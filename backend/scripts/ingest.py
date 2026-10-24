"""Pull the January-2026 decision window from Elexon BMRS into a compact snapshot.

Decision days D-1 = 2026-01-01 .. 2026-01-31  ->  delivery days D = 2026-01-02 .. 2026-02-01.

Usage (from backend/):  python -m scripts.ingest
"""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

from app.elexon import fetch_actuals, fetch_forecasts

DELIVERY_FROM = "2026-01-02"
DELIVERY_TO = "2026-02-01"
# Forecasts published up to the last decision day; start a little early so that every
# delivery hour has its full set of earlier runs available (max horizon ~57.5h).
FORECAST_PUBLISH_FROM = "2025-12-30T00:00:00Z"
FORECAST_PUBLISH_TO = "2026-02-01T00:00:00Z"

OUT = Path(__file__).resolve().parents[1] / "data" / "snapshot_jan2026.json.gz"


def main() -> None:
    actuals = fetch_actuals(DELIVERY_FROM, DELIVERY_TO)
    forecasts = fetch_forecasts(FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO)
    snapshot = {
        "meta": {
            "source": "Elexon BMRS (data.elexon.co.uk) FUELHH fuelType=WIND, WINDFOR",
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "delivery_from": DELIVERY_FROM,
            "delivery_to": DELIVERY_TO,
            "forecast_publish_from": FORECAST_PUBLISH_FROM,
            "forecast_publish_to": FORECAST_PUBLISH_TO,
        },
        # Compact column-ish rows: [startTime, generation] and [publishTime, startTime, generation]
        "actuals": [[a.start_time, a.generation] for a in actuals],
        "forecasts": [[f.publish_time, f.start_time, f.generation] for f in forecasts],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8") as fh:
        json.dump(snapshot, fh, separators=(",", ":"))
    print(f"wrote {OUT} actuals={len(actuals)} forecasts={len(forecasts)}")


if __name__ == "__main__":
    main()
