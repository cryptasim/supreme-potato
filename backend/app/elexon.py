"""Thin client for the Elexon BMRS Insights API (no API key required)."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
TIMEOUT = httpx.Timeout(60.0, connect=10.0)


@dataclass(frozen=True, slots=True)
class Actual:
    start_time: str  # ISO-8601 UTC, half-hourly
    generation: float  # MW


@dataclass(frozen=True, slots=True)
class Forecast:
    publish_time: str  # ISO-8601 UTC
    start_time: str  # ISO-8601 UTC, hourly target
    generation: float  # MW


def _get(path: str, params: dict[str, str], retries: int = 3) -> list[dict]:
    last_exc: Exception | None = None
    for _ in range(retries):
        try:
            resp = httpx.get(f"{BASE_URL}/{path}", params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_exc = exc
    raise RuntimeError(f"Elexon request failed for {path}: {last_exc}") from last_exc


def fetch_actuals(settlement_from: str, settlement_to: str) -> list[Actual]:
    """WIND outturn from FUELHH for settlement dates [from, to] inclusive."""
    rows = _get(
        "FUELHH/stream",
        {"settlementDateFrom": settlement_from, "settlementDateTo": settlement_to, "fuelType": "WIND"},
    )
    out = {r["startTime"]: Actual(r["startTime"], float(r["generation"])) for r in rows if r.get("fuelType") == "WIND"}
    return sorted(out.values(), key=lambda a: a.start_time)


def fetch_forecasts(publish_from: str, publish_to: str) -> list[Forecast]:
    """All WINDFOR forecast runs published in [from, to]."""
    rows = _get("WINDFOR/stream", {"publishDateTimeFrom": publish_from, "publishDateTimeTo": publish_to})
    out = {
        (r["publishTime"], r["startTime"]): Forecast(r["publishTime"], r["startTime"], float(r["generation"]))
        for r in rows
    }
    return sorted(out.values(), key=lambda f: (f.publish_time, f.start_time))
