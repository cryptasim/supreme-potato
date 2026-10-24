"""In-memory data store: the committed snapshot, optionally replaced by a live Elexon pull.

The store is immutable once built. A refresh builds a brand-new store and swaps the module-level
reference under a lock, so concurrent requests always see one consistent dataset (they grab the
reference once per request). Nothing is written to disk: Vercel's filesystem is read-only.
"""

from __future__ import annotations

import gzip
import json
import os
import threading
from bisect import bisect_right
from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal

from app.elexon import fetch_actuals, fetch_forecasts
from app.selection import ForecastIndex, build_forecast_index, format_ts, parse_ts

# Decision days D-1 = Jan 1..31 -> delivery days D = Jan 2..Feb 1 (see docs/API_CONTRACT.md).
DECISION_FROM, DECISION_TO = date(2026, 1, 1), date(2026, 1, 31)
DELIVERY_FROM, DELIVERY_TO = date(2026, 1, 2), date(2026, 2, 1)
DEFAULT_CUTOFF = "09:00"
# Mirrors scripts/ingest.py: start early enough that every delivery hour has its full set of runs.
FORECAST_PUBLISH_FROM = "2025-12-30T00:00:00Z"
FORECAST_PUBLISH_TO = "2026-02-01T00:00:00Z"

SNAPSHOT_PATH = Path(
    os.environ.get("SNAPSHOT_PATH", Path(__file__).resolve().parents[1] / "data" / "snapshot_jan2026.json.gz")
)

DataMode = Literal["snapshot", "live"]


@dataclass(frozen=True, eq=False)
class DataStore:
    version: int
    data_mode: DataMode
    source: str
    created_at: str  # ISO-8601 UTC 'Z'
    actuals: dict[int, float]  # half-hour start_ts -> MW
    forecasts: ForecastIndex  # target start_ts -> runs sorted by publish time
    forecast_points: int
    publish_times: list[int] = field(default_factory=list)  # distinct runs, ascending

    # Identity for caching is the data version: results computed for version N are never served for N+1.
    def __hash__(self) -> int:
        return hash(self.version)

    def __eq__(self, other: object) -> bool:
        return isinstance(other, DataStore) and other.version == self.version

    @classmethod
    def build(
        cls,
        *,
        version: int,
        data_mode: DataMode,
        source: str,
        created_at: str,
        actuals: Iterable[tuple[str, float]],
        forecasts: Iterable[tuple[str, str, float]],
    ) -> DataStore:
        rows = [(parse_ts(p), parse_ts(s), float(g)) for p, s, g in forecasts]
        return cls(
            version=version,
            data_mode=data_mode,
            source=source,
            created_at=format_ts(parse_ts(created_at)),
            actuals={parse_ts(s): float(g) for s, g in actuals},
            forecasts=build_forecast_index(rows),
            forecast_points=len(rows),
            publish_times=sorted({p for p, _, _ in rows}),
        )

    def next_run_after(self, ts: int) -> int | None:
        i = bisect_right(self.publish_times, ts)
        return self.publish_times[i] if i < len(self.publish_times) else None


def load_snapshot(path: Path = SNAPSHOT_PATH, version: int = 1) -> DataStore:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        raw = json.load(fh)
    meta = raw["meta"]
    return DataStore.build(
        version=version,
        data_mode="snapshot",
        source=meta["source"],
        created_at=meta["created_at"],
        actuals=raw["actuals"],
        forecasts=raw["forecasts"],
    )


_lock = threading.Lock()
_current: DataStore | None = None


def get_store() -> DataStore:
    """Current dataset; the snapshot is loaded lazily on first use (once per process)."""
    global _current
    if _current is None:
        with _lock:
            if _current is None:
                _current = load_snapshot()
    return _current


def refresh_from_elexon() -> DataStore:
    """Re-fetch the window live from Elexon and swap it in. Raises on failure; old data is kept."""
    global _current
    actuals = fetch_actuals(DELIVERY_FROM.isoformat(), DELIVERY_TO.isoformat())
    forecasts = fetch_forecasts(FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO)
    if not actuals or not forecasts:
        raise RuntimeError("Elexon returned no data for the window")
    fresh = DataStore.build(
        version=0,  # assigned below, under the lock, so concurrent refreshes never share a version
        data_mode="live",
        source=get_store().source,
        created_at=datetime.now(UTC).isoformat(timespec="seconds"),
        actuals=[(a.start_time, a.generation) for a in actuals],
        forecasts=[(f.publish_time, f.start_time, f.generation) for f in forecasts],
    )
    with _lock:
        previous = _current.version if _current is not None else 0
        _current = replace(fresh, version=previous + 1)
        return _current
