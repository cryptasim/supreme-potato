# API contract (v1)

All endpoints are `GET`, return JSON, and live under `/api`. Times are ISO‑8601 UTC strings ending in `Z`
(January = GMT, so UK local time == UTC). Generation values are MW (float, 1 dp is fine).

## Domain rules (single source of truth)

- **Decision window**: purchase decisions made on days D‑1 = 2026‑01‑01 … 2026‑01‑31 → delivery days
  D = **2026‑01‑02 … 2026‑02‑01**.
- **Target grid**: hourly, on‑the‑hour `startTime`s (WINDFOR is hourly). 24 targets per delivery day,
  `D 00:00Z … D 23:00Z`.
- **Actual for a target**: FUELHH WIND `generation` at the same `startTime` (mode `point`, default), or the
  mean of the half‑hours `startTime` and `startTime+30min` (mode `hourly_mean`). Query param `actual_mode`.
- **Cut‑off mode** (`cutoff=HH:MM`, default `09:00`): decision time for delivery day D is `D‑1 HH:MM Z`.
  For each target, the selected forecast is the one with the **latest `publishTime` ≤ decision time** and
  `publishTime < startTime`. Ties are impossible (unique (publishTime,startTime)).
- **Horizon mode** (`horizon_h=H`, integer 0…48): for each target, select the forecast with the latest
  `publishTime` such that `startTime − publishTime ≥ H hours` (and `publishTime < startTime`, i.e. if H=0
  still require strictly positive lead).
- A target with no eligible forecast or no actual is **omitted** from error stats; in `/decision` it is
  returned with `forecast: null` / `actual: null`.
- **Error** `= forecast − actual` (positive = over‑forecast = wind came in short → buy more).
- **Shortfall‑risk band**: from the empirical distribution of errors (same mode/params, all January
  delivery hours), `q10, q50, q90` of `actual − forecast` relative error expressed in MW. For a given
  forecast F: `p10 = F + q10(actual−forecast)`, `p90 = F + q90(actual−forecast)`, clipped at ≥ 0.
  "Reliable wind at 90% confidence" = `p10`. "Extra to procure vs forecast" = `F − p10`.

## Endpoints

### `GET /api/health` → `{"status":"ok"}`

### `GET /api/meta`
```json
{
  "source": "Elexon BMRS ...",
  "snapshot_created_at": "2026-...Z",
  "delivery_from": "2026-01-02", "delivery_to": "2026-02-01",
  "decision_from": "2026-01-01", "decision_to": "2026-01-31",
  "default_cutoff": "09:00",
  "forecast_runs": 264,
  "forecast_run_times_utc": ["02:30","04:30","07:30","09:30","11:30","15:30","18:30","22:30"],
  "actual_points": 1488, "forecast_points": 19272,
  "data_mode": "snapshot"          // or "live" after /api/refresh
}
```

### `GET /api/decision?delivery_date=YYYY-MM-DD&cutoff=HH:MM&actual_mode=point`
`delivery_date` must be within window (else 422). Response:
```json
{
  "delivery_date": "2026-01-15",
  "decision_time": "2026-01-14T09:00:00Z",
  "forecast_run": "2026-01-14T07:30:00Z",          // publishTime used (latest run used by any hour), null if none
  "forecast_age_minutes": 90,                       // decision_time − forecast_run
  "next_run_after_cutoff": "2026-01-14T09:30:00Z",  // first run published after decision time (null if none)
  "points": [
    {"start_time":"2026-01-15T00:00:00Z","forecast":12345.0,"actual":11890.0,"error":455.0,
     "publish_time":"2026-01-14T07:30:00Z","horizon_h":16.5,"p10":10900.0,"p90":13600.0}
  ],
  "summary": {
    "forecast_mwh": 300000.0, "actual_mwh": 290000.0,   // sum over hours of MW × 1h (null-safe; only hours with value)
    "p10_mwh": 260000.0, "extra_to_procure_mwh": 40000.0,  // sum(forecast − p10)
    "mae": 800.0, "bias": 120.0, "max_abs_error": 2500.0, "n": 24
  },
  "band": {"q10": -2100.0, "q50": 50.0, "q90": 1900.0}   // MW, of actual − forecast
}
```

### `GET /api/series?start=YYYY-MM-DD&end=YYYY-MM-DD&horizon_h=4&actual_mode=point`
OR `...&cutoff=09:00` (if `cutoff` given it wins; default is `horizon_h=4` when neither supplied).
Dates are delivery dates, inclusive, clamped to window. Response:
```json
{
  "mode": "horizon", "horizon_h": 4, "cutoff": null,
  "points": [{"start_time":"...Z","forecast":12345.0,"actual":11890.0,"error":455.0,"publish_time":"...Z","horizon_h":4.5}]
}
```
Actuals are returned for **every half‑hour** separately in `actuals`:
`"actuals": [{"start_time":"...Z","generation":11890.0}]` so the chart can show the native 30‑min actual line.

### `GET /api/accuracy?cutoff=09:00` or `?horizon_h=H` (same defaulting as /series), `actual_mode`
```json
{
  "mode": "cutoff", "cutoff": "09:00", "horizon_h": null,
  "n": 744,
  "kpis": {"mae":..., "rmse":..., "bias":..., "mape_pct":..., "nmae_pct":..., // nmae = MAE / mean(actual) × 100
           "p50_abs_error":..., "p90_abs_error":..., "p99_abs_error":..., "max_abs_error":...,
           "mean_actual":..., "r2":...},
  "quantiles": {"q01":...,"q05":...,"q10":...,"q25":...,"q50":...,"q75":...,"q90":...,"q95":...,"q99":...}, // of actual − forecast
  "histogram": [{"bin_start":-5000,"bin_end":-4500,"count":3}],   // error = forecast − actual, 500 MW bins
  "by_hour": [{"hour":0,"mae":...,"bias":...,"n":31}],              // hour of day of target (UTC)
  "by_horizon": [{"horizon_h":16,"mae":...,"bias":...,"rmse":...,"n":...}],  // floor(horizon) buckets, actual lead of selected forecast
  "by_day": [{"delivery_date":"2026-01-02","mae":...,"bias":...,"forecast_mwh":...,"actual_mwh":...}],
  "by_level": [{"bucket":"0-5 GW","mae":...,"bias":...,"n":...}],   // by forecast level, 5 GW buckets
  "worst_hours": [{"start_time":...,"forecast":...,"actual":...,"error":...}]  // top 10 |error|
}
```

### `GET /api/horizon-curve?actual_mode=point`
Error vs lead time across the full forecast set: for H in 0..48 step 1 (horizon mode), return
`[{"horizon_h":H,"mae":...,"rmse":...,"bias":...,"p90_abs_error":...,"n":...}]`. This powers the
"how much does waiting for a fresher forecast help?" chart. Restrict targets to January delivery window.

### `POST /api/refresh`
Re‑fetch the window from Elexon into the in‑memory store (read‑only FS on Vercel). Returns `/api/meta`.
On failure returns 502 with `{"detail": "..."}` and keeps snapshot data.

Errors: FastAPI default `{"detail": ...}` with 422 for bad params.
