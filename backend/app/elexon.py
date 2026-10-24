"""Thin client for the Elexon BMRS Insights API (no API key required)."""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
# Offline ingest (no deadline): generous per-call timeout.
TIMEOUT_S, CONNECT_TIMEOUT_S = 60.0, 10.0
# With a deadline (live refresh inside a 60s serverless function) each call is capped further and
# never runs past the deadline; retries back off briefly and stop once too little time is left.
DEADLINE_CALL_TIMEOUT_S = 20.0
RETRIES = 3
BACKOFF_S = 0.5  # sleep 0.5s, 1.0s between attempts
MIN_ATTEMPT_S = 2.0  # do not start an attempt with less time than this remaining


@dataclass(frozen=True, slots=True)
class Actual:
    start_time: str  # ISO-8601 UTC, half-hourly
    generation: float  # MW


@dataclass(frozen=True, slots=True)
class Forecast:
    publish_time: str  # ISO-8601 UTC
    start_time: str  # ISO-8601 UTC, hourly target
    generation: float  # MW


def _get(path: str, params: dict[str, str], deadline: float | None = None) -> list[dict]:
    """GET with retries. ``deadline`` is a ``time.monotonic()`` instant that no attempt may run past."""
    last_exc: Exception | None = None
    for attempt in range(RETRIES):
        if attempt:
            pause = BACKOFF_S * attempt
            if deadline is not None:
                pause = min(pause, max(0.0, deadline - time.monotonic() - MIN_ATTEMPT_S))
            time.sleep(pause)
        connect_s, read_s = CONNECT_TIMEOUT_S, TIMEOUT_S
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining < MIN_ATTEMPT_S:
                last_exc = last_exc or TimeoutError("refresh deadline exceeded")
                break
            # connect + read together stay within the remaining budget (read is per socket read).
            connect_s = min(CONNECT_TIMEOUT_S, remaining / 4)
            read_s = min(DEADLINE_CALL_TIMEOUT_S, remaining - connect_s)
        timeout = httpx.Timeout(read_s, connect=connect_s)
        try:
            resp = httpx.get(f"{BASE_URL}/{path}", params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            last_exc = exc
    raise RuntimeError(f"Elexon request failed for {path}: {last_exc}") from last_exc


def fetch_actuals(settlement_from: str, settlement_to: str, deadline: float | None = None) -> list[Actual]:
    """WIND outturn from FUELHH for settlement dates [from, to] inclusive."""
    rows = _get(
        "FUELHH/stream",
        {"settlementDateFrom": settlement_from, "settlementDateTo": settlement_to, "fuelType": "WIND"},
        deadline,
    )
    out = {r["startTime"]: Actual(r["startTime"], float(r["generation"])) for r in rows if r.get("fuelType") == "WIND"}
    return sorted(out.values(), key=lambda a: a.start_time)


def fetch_forecasts(publish_from: str, publish_to: str, deadline: float | None = None) -> list[Forecast]:
    """All WINDFOR forecast runs published in [from, to]."""
    rows = _get("WINDFOR/stream", {"publishDateTimeFrom": publish_from, "publishDateTimeTo": publish_to}, deadline)
    out = {
        (r["publishTime"], r["startTime"]): Forecast(r["publishTime"], r["startTime"], float(r["generation"]))
        for r in rows
    }
    return sorted(out.values(), key=lambda f: (f.publish_time, f.start_time))
