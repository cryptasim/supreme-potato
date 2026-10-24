"""Builds endpoint payloads from the store, combining selection rules with metrics.

Every public function takes the ``DataStore`` as its first argument and is wrapped in
``functools.lru_cache``. The store hashes/compares by its data version, so the cache key is
(data version, request params): a refresh produces a new version and old entries simply stop
being hit. Cached payloads are plain dicts/tuples that callers must treat as read-only.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from functools import lru_cache

from app import metrics as m
from app.data_store import DECISION_FROM, DECISION_TO, DEFAULT_CUTOFF, DELIVERY_FROM, DELIVERY_TO, DataStore
from app.selection import (
    HALF_HOUR,
    HOUR,
    ActualMode,
    Mode,
    actual_for_target,
    date_of,
    day_start,
    decision_time,
    format_ts,
    select_forecast,
    target_grid,
)

QUANTILE_LEVELS = {f"q{p:02d}": p / 100 for p in (1, 5, 10, 25, 50, 75, 90, 95, 99)}
HISTOGRAM_BIN_MW = 500
LEVEL_BUCKET_MW = 5000
CACHE_SIZE = 256


def _r(x: float | None, nd: int = 1) -> float | None:
    return None if x is None else round(x, nd)


@dataclass(frozen=True, slots=True)
class Row:
    """One hourly target with its selected forecast (if any) and aligned actual (if any)."""

    start_ts: int
    forecast: float | None
    actual: float | None
    publish_ts: int | None

    @property
    def matched(self) -> bool:
        return self.forecast is not None and self.actual is not None

    @property
    def error(self) -> float | None:
        """forecast - actual: positive = over-forecast (wind came in short -> buy more)."""
        return self.forecast - self.actual if self.matched else None  # type: ignore[operator]

    @property
    def horizon_h(self) -> float | None:
        return None if self.publish_ts is None else (self.start_ts - self.publish_ts) / HOUR


def delivery_dates(start: date = DELIVERY_FROM, end: date = DELIVERY_TO) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


@lru_cache(maxsize=CACHE_SIZE)
def window_rows(store: DataStore, mode: Mode, actual_mode: ActualMode) -> tuple[Row, ...]:
    """All January delivery-window targets (31 days x 24h) under one selection mode."""
    rows = []
    for d in delivery_dates():
        for ts in target_grid(d):
            sel = select_forecast(store.forecasts, ts, mode)
            rows.append(
                Row(
                    start_ts=ts,
                    forecast=sel.generation if sel else None,
                    actual=actual_for_target(store.actuals, ts, actual_mode),
                    publish_ts=sel.publish_ts if sel else None,
                )
            )
    return tuple(rows)


def _matched(rows: Sequence[Row]) -> list[Row]:
    return [r for r in rows if r.matched]


def _shortfall_quantiles(rows: Sequence[Row]) -> dict[str, float | None]:
    """Quantiles of (actual - forecast); the sign is flipped vs `error` so q10 reads as 'shortfall'."""
    residuals = [r.actual - r.forecast for r in _matched(rows)]  # type: ignore[operator]
    return {k: m.quantile(residuals, q) for k, q in QUANTILE_LEVELS.items()}


def _sum(values: Sequence[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def _point(r: Row) -> dict:
    return {
        "start_time": format_ts(r.start_ts),
        "forecast": _r(r.forecast),
        "actual": _r(r.actual),
        "error": _r(r.error),
        "publish_time": format_ts(r.publish_ts) if r.publish_ts is not None else None,
        "horizon_h": r.horizon_h,
    }


def _error_stats(rows: Sequence[Row]) -> dict:
    errors = [r.error for r in _matched(rows)]
    return {"mae": _r(m.mae(errors)), "bias": _r(m.bias(errors)), "rmse": _r(m.rmse(errors)), "n": len(errors)}


def resolve_mode(cutoff: str | None, horizon_h: int | None) -> Mode:
    """Contract defaulting: a cut-off wins; otherwise horizon mode with H defaulting to 4."""
    if cutoff is not None:
        return Mode.for_cutoff(cutoff)
    return Mode.for_horizon(4 if horizon_h is None else horizon_h)


def regular_run_times(publish_times: Sequence[int]) -> list[str]:
    """The nominal daily run schedule (HH:MM UTC).

    Only times that recur on at least half of the days count, so a one-off late publication (e.g. the
    2026-01-15 11:30 run that appeared at 12:25) does not show up as an extra scheduled run.
    """
    by_time = m.group_by(publish_times, key=lambda p: format_ts(p)[11:16])
    n_days = len({date_of(p) for p in publish_times})
    return sorted(t for t, ps in by_time.items() if len(ps) * 2 >= n_days)


def meta(store: DataStore) -> dict:
    return {
        "source": store.source,
        "snapshot_created_at": store.created_at,
        "delivery_from": DELIVERY_FROM.isoformat(),
        "delivery_to": DELIVERY_TO.isoformat(),
        "decision_from": DECISION_FROM.isoformat(),
        "decision_to": DECISION_TO.isoformat(),
        "default_cutoff": DEFAULT_CUTOFF,
        "forecast_runs": len(store.publish_times),
        "forecast_run_times_utc": regular_run_times(store.publish_times),
        "actual_points": len(store.actuals),
        "forecast_points": store.forecast_points,
        "data_mode": store.data_mode,
    }


@lru_cache(maxsize=CACHE_SIZE)
def decision(store: DataStore, delivery_date: date, cutoff: str, actual_mode: ActualMode) -> dict:
    mode = Mode.for_cutoff(cutoff)
    all_rows = window_rows(store, mode, actual_mode)
    rows = [r for r in all_rows if date_of(r.start_ts) == delivery_date]
    decision_ts = decision_time(delivery_date, cutoff)

    q = _shortfall_quantiles(all_rows)
    q10, q50, q90 = q["q10"], q["q50"], q["q90"]

    def band(f: float | None, qx: float | None) -> float | None:
        return None if f is None or qx is None else max(0.0, f + qx)

    points = [{**_point(r), "p10": _r(band(r.forecast, q10)), "p90": _r(band(r.forecast, q90))} for r in rows]

    publish = [r.publish_ts for r in rows if r.publish_ts is not None]
    run = max(publish) if publish else None
    next_run = store.next_run_after(decision_ts)
    errors = [r.error for r in _matched(rows)]
    p10s = [band(r.forecast, q10) for r in rows]
    extra = [r.forecast - p for r, p in zip(rows, p10s, strict=True) if r.forecast is not None and p is not None]

    return {
        "delivery_date": delivery_date.isoformat(),
        "decision_time": format_ts(decision_ts),
        "forecast_run": format_ts(run) if run is not None else None,
        "forecast_age_minutes": (decision_ts - run) // 60 if run is not None else None,
        "next_run_after_cutoff": format_ts(next_run) if next_run is not None else None,
        "points": points,
        "summary": {
            # Hourly MW x 1 h = MWh.
            "forecast_mwh": _r(_sum([r.forecast for r in rows])),
            "actual_mwh": _r(_sum([r.actual for r in rows])),
            "p10_mwh": _r(_sum(p10s)),
            "extra_to_procure_mwh": _r(_sum(extra)),
            "mae": _r(m.mae(errors)),
            "bias": _r(m.bias(errors)),
            "max_abs_error": _r(m.max_abs(errors)),
            "n": len(errors),
        },
        "band": {"q10": _r(q10), "q50": _r(q50), "q90": _r(q90)},
    }


@lru_cache(maxsize=CACHE_SIZE)
def series(store: DataStore, start: date, end: date, mode: Mode, actual_mode: ActualMode) -> dict:
    lo, hi = day_start(start), day_start(end) + 24 * HOUR
    rows = [r for r in window_rows(store, mode, actual_mode) if lo <= r.start_ts < hi]
    half_hours = range(lo, hi, HALF_HOUR)
    return {
        "mode": mode.kind,
        "horizon_h": mode.horizon_h,
        "cutoff": mode.cutoff,
        "points": [_point(r) for r in rows],
        "actuals": [
            {"start_time": format_ts(ts), "generation": store.actuals[ts]} for ts in half_hours if ts in store.actuals
        ],
    }


def _level_bucket(forecast: float) -> int:
    return int(forecast // LEVEL_BUCKET_MW)


@lru_cache(maxsize=CACHE_SIZE)
def accuracy(store: DataStore, mode: Mode, actual_mode: ActualMode) -> dict:
    all_rows = window_rows(store, mode, actual_mode)
    rows = _matched(all_rows)
    errors = [r.error for r in rows]
    abs_errors = [abs(e) for e in errors]
    forecasts = [r.forecast for r in rows]
    actuals = [r.actual for r in rows]
    mean_actual = sum(actuals) / len(actuals) if actuals else None
    mae = m.mae(errors)

    by_hour = m.group_by(rows, key=lambda r: (r.start_ts // HOUR) % 24)
    by_horizon = m.group_by(rows, key=lambda r: int(r.horizon_h))
    by_day = m.group_by(rows, key=lambda r: date_of(r.start_ts))
    by_level = m.group_by(rows, key=lambda r: _level_bucket(r.forecast))
    worst = sorted(rows, key=lambda r: abs(r.error), reverse=True)[:10]

    return {
        "mode": mode.kind,
        "cutoff": mode.cutoff,
        "horizon_h": mode.horizon_h,
        "n": len(rows),
        "kpis": {
            "mae": _r(mae),
            "rmse": _r(m.rmse(errors)),
            "bias": _r(m.bias(errors)),
            "mape_pct": _r(m.mape_pct(forecasts, actuals), 2),
            "nmae_pct": _r(mae / mean_actual * 100, 2) if mae is not None and mean_actual else None,
            "p50_abs_error": _r(m.quantile(abs_errors, 0.5)),
            "p90_abs_error": _r(m.quantile(abs_errors, 0.9)),
            "p99_abs_error": _r(m.quantile(abs_errors, 0.99)),
            "max_abs_error": _r(m.max_abs(errors)),
            "mean_actual": _r(mean_actual),
            "r2": _r(m.r2(forecasts, actuals), 4),
        },
        "quantiles": {k: _r(v) for k, v in _shortfall_quantiles(rows).items()},
        "histogram": [
            {"bin_start": s, "bin_end": e, "count": c} for s, e, c in m.histogram(errors, width=HISTOGRAM_BIN_MW)
        ],
        "by_hour": [{"hour": h, **_error_stats(by_hour.get(h, []))} for h in range(24)],
        "by_horizon": [{"horizon_h": h, **_error_stats(by_horizon[h])} for h in sorted(by_horizon)],
        "by_day": [
            {
                "delivery_date": d.isoformat(),
                "mae": _error_stats(by_day.get(d, []))["mae"],
                "bias": _error_stats(by_day.get(d, []))["bias"],
                "forecast_mwh": _r(_sum([r.forecast for r in by_day.get(d, [])])),
                "actual_mwh": _r(_sum([r.actual for r in by_day.get(d, [])])),
            }
            for d in delivery_dates()
        ],
        "by_level": [{"bucket": f"{b * 5}-{(b + 1) * 5} GW", **_error_stats(by_level[b])} for b in sorted(by_level)],
        "worst_hours": [
            {
                "start_time": format_ts(r.start_ts),
                "forecast": _r(r.forecast),
                "actual": _r(r.actual),
                "error": _r(r.error),
            }
            for r in worst
        ],
    }


@lru_cache(maxsize=CACHE_SIZE)
def horizon_curve(store: DataStore, actual_mode: ActualMode) -> list[dict]:
    """Error vs minimum lead time H = 0..48h: how much does waiting for a fresher run help?"""
    out = []
    for h in range(49):
        rows = _matched(window_rows(store, Mode.for_horizon(h), actual_mode))
        errors = [r.error for r in rows]
        out.append(
            {
                "horizon_h": h,
                "mae": _r(m.mae(errors)),
                "rmse": _r(m.rmse(errors)),
                "bias": _r(m.bias(errors)),
                "p90_abs_error": _r(m.quantile([abs(e) for e in errors], 0.9)),
                "n": len(errors),
            }
        )
    return out
