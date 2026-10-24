"""Forecast-selection and actual-alignment rules (pure functions, no I/O).

Times are handled internally as integer epoch seconds (UTC): comparisons are exact and cheap, and
there is no ambiguity about timezones. Conversion to/from ISO strings happens only at the edges.

The forecast index maps each target ``startTime`` to the runs that forecast it, sorted by
``publishTime``. Every rule below reduces to "latest run published at or before some limit", which
is a single ``bisect`` on that sorted list -> O(log runs) per target.
"""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

HOUR = 3600
HALF_HOUR = 1800

ActualMode = Literal["point", "hourly_mean"]
# start_ts -> (publish_ts ascending, generation aligned with publish_ts)
ForecastIndex = Mapping[int, tuple[list[int], list[float]]]


def parse_ts(iso: str) -> int:
    """ISO-8601 UTC string ('...Z' or '+00:00') -> epoch seconds."""
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


def format_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def date_of(ts: int) -> date:
    return datetime.fromtimestamp(ts, UTC).date()


def day_start(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=UTC).timestamp())


def build_forecast_index(rows: Iterable[tuple[int, int, float]]) -> dict[int, tuple[list[int], list[float]]]:
    """Group (publish_ts, start_ts, generation) rows by target and sort each group by publish time."""
    grouped: dict[int, list[tuple[int, float]]] = {}
    for publish_ts, start_ts, gen in rows:
        grouped.setdefault(start_ts, []).append((publish_ts, gen))
    index: dict[int, tuple[list[int], list[float]]] = {}
    for start_ts, runs in grouped.items():
        runs.sort()
        index[start_ts] = ([p for p, _ in runs], [g for _, g in runs])
    return index


@dataclass(frozen=True, slots=True)
class Selection:
    start_ts: int
    publish_ts: int
    generation: float

    @property
    def horizon_h(self) -> float:
        """Lead time of the selected forecast in hours (always > 0)."""
        return (self.start_ts - self.publish_ts) / HOUR


def _latest_at_or_before(index: ForecastIndex, start_ts: int, limit_ts: int) -> Selection | None:
    runs = index.get(start_ts)
    if runs is None:
        return None
    publish, gens = runs
    # Never use a run published at/after the target hour starts: that is not a forecast we could
    # have acted on (WINDFOR includes negative horizons down to -14.5h).
    limit_ts = min(limit_ts, start_ts - 1)
    i = bisect_right(publish, limit_ts)
    if i == 0:
        return None
    return Selection(start_ts, publish[i - 1], gens[i - 1])


def select_by_cutoff(index: ForecastIndex, start_ts: int, decision_ts: int) -> Selection | None:
    """Latest run with publishTime <= decision time (boundary inclusive) and publishTime < startTime."""
    return _latest_at_or_before(index, start_ts, decision_ts)


def select_by_horizon(index: ForecastIndex, start_ts: int, horizon_h: float) -> Selection | None:
    """Latest run with startTime - publishTime >= H hours (and strictly positive lead)."""
    return _latest_at_or_before(index, start_ts, start_ts - int(horizon_h * HOUR))


def decision_time(delivery_date: date, cutoff: str) -> int:
    """Decision for delivery day D is taken on D-1 at the HH:MM cut-off (UTC == UK time in January)."""
    hh, mm = (int(x) for x in cutoff.split(":"))
    return day_start(delivery_date - timedelta(days=1)) + hh * HOUR + mm * 60


def target_grid(delivery_date: date) -> list[int]:
    """The 24 hourly on-the-hour targets of a delivery day (WINDFOR is hourly)."""
    start = day_start(delivery_date)
    return [start + h * HOUR for h in range(24)]


def actual_for_target(actuals: Mapping[int, float], start_ts: int, mode: ActualMode) -> float | None:
    """Actual MW for an hourly target.

    point:       FUELHH value of the half-hour starting at the same time.
    hourly_mean: mean of both half-hours in the hour; None if either is missing, so we never
                 silently compare an hourly forecast against a single half-hour.
    """
    if mode == "point":
        return actuals.get(start_ts)
    first, second = actuals.get(start_ts), actuals.get(start_ts + HALF_HOUR)
    if first is None or second is None:
        return None
    return (first + second) / 2


@dataclass(frozen=True, slots=True)
class Mode:
    """How a forecast is chosen for each target: cut-off on D-1, or a minimum lead time."""

    kind: Literal["cutoff", "horizon"]
    cutoff: str | None = None
    horizon_h: int | None = None

    @classmethod
    def for_cutoff(cls, cutoff: str) -> Mode:
        return cls("cutoff", cutoff=cutoff)

    @classmethod
    def for_horizon(cls, horizon_h: int) -> Mode:
        return cls("horizon", horizon_h=horizon_h)


def select_forecast(index: ForecastIndex, start_ts: int, mode: Mode) -> Selection | None:
    if mode.kind == "cutoff":
        assert mode.cutoff is not None
        return select_by_cutoff(index, start_ts, decision_time(date_of(start_ts), mode.cutoff))
    assert mode.horizon_h is not None
    return select_by_horizon(index, start_ts, mode.horizon_h)
