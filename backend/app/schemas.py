"""Pydantic response models - the JSON shapes of docs/API_CONTRACT.md."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Health(BaseModel):
    status: Literal["ok"] = "ok"


class Meta(BaseModel):
    source: str
    snapshot_created_at: str
    delivery_from: str
    delivery_to: str
    decision_from: str
    decision_to: str
    default_cutoff: str
    forecast_runs: int
    forecast_run_times_utc: list[str]
    actual_points: int
    forecast_points: int
    data_mode: Literal["snapshot", "live"]


class SeriesPoint(BaseModel):
    start_time: str
    forecast: float | None
    actual: float | None
    error: float | None  # forecast - actual
    publish_time: str | None
    horizon_h: float | None  # actual lead of the selected forecast


class DecisionPoint(SeriesPoint):
    p10: float | None
    p90: float | None


class DecisionSummary(BaseModel):
    forecast_mwh: float | None
    actual_mwh: float | None
    p10_mwh: float | None
    extra_to_procure_mwh: float | None
    mae: float | None
    bias: float | None
    max_abs_error: float | None
    n: int


class Band(BaseModel):
    """Quantiles of (actual - forecast) in MW over all January delivery hours, same mode."""

    q10: float | None
    q50: float | None
    q90: float | None


class Decision(BaseModel):
    delivery_date: str
    decision_time: str
    forecast_run: str | None
    forecast_age_minutes: int | None
    next_run_after_cutoff: str | None
    points: list[DecisionPoint]
    summary: DecisionSummary
    band: Band


class ActualPoint(BaseModel):
    start_time: str
    generation: float


class Series(BaseModel):
    mode: Literal["cutoff", "horizon"]
    horizon_h: int | None
    cutoff: str | None
    points: list[SeriesPoint]
    actuals: list[ActualPoint]


class Kpis(BaseModel):
    mae: float | None
    rmse: float | None
    bias: float | None
    mape_pct: float | None
    nmae_pct: float | None
    p50_abs_error: float | None
    p90_abs_error: float | None
    p99_abs_error: float | None
    max_abs_error: float | None
    mean_actual: float | None
    r2: float | None


class Quantiles(BaseModel):
    q01: float | None
    q05: float | None
    q10: float | None
    q25: float | None
    q50: float | None
    q75: float | None
    q90: float | None
    q95: float | None
    q99: float | None


class HistogramBin(BaseModel):
    bin_start: int
    bin_end: int
    count: int


class HourStats(BaseModel):
    hour: int
    mae: float | None
    bias: float | None
    n: int


class HorizonStats(BaseModel):
    horizon_h: int
    mae: float | None
    bias: float | None
    rmse: float | None
    n: int


class DayStats(BaseModel):
    delivery_date: str
    mae: float | None
    bias: float | None
    forecast_mwh: float | None
    actual_mwh: float | None


class LevelStats(BaseModel):
    bucket: str
    mae: float | None
    bias: float | None
    n: int


class WorstHour(BaseModel):
    start_time: str
    forecast: float
    actual: float
    error: float


class Accuracy(BaseModel):
    mode: Literal["cutoff", "horizon"]
    cutoff: str | None
    horizon_h: int | None
    n: int
    kpis: Kpis
    quantiles: Quantiles
    histogram: list[HistogramBin]
    by_hour: list[HourStats]
    by_horizon: list[HorizonStats]
    by_day: list[DayStats]
    by_level: list[LevelStats]
    worst_hours: list[WorstHour]


class HorizonCurvePoint(BaseModel):
    horizon_h: int
    mae: float | None
    rmse: float | None
    bias: float | None
    p90_abs_error: float | None
    n: int
