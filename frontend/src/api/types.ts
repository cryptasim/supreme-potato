/**
 * Response shapes mirrored 1:1 from docs/API_CONTRACT.md (v1).
 * All times are ISO-8601 UTC strings ending in "Z"; all generation values are MW.
 * Sign conventions differ by field and matter:
 *   - `error`, `bias`, `histogram`      : forecast − actual  (positive = over-forecast = wind came in short)
 *   - `quantiles`, `band`               : actual − forecast
 */

export type ActualMode = 'point' | 'hourly_mean';

export interface Meta {
  source: string;
  snapshot_created_at: string;
  delivery_from: string;
  delivery_to: string;
  decision_from: string;
  decision_to: string;
  default_cutoff: string;
  forecast_runs: number;
  forecast_run_times_utc: string[];
  actual_points: number;
  forecast_points: number;
  data_mode: 'snapshot' | 'live' | string;
}

export interface DecisionPoint {
  start_time: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish_time: string | null;
  horizon_h: number | null;
  p10: number | null;
  p90: number | null;
}

export interface DecisionSummary {
  forecast_mwh: number | null;
  actual_mwh: number | null;
  p10_mwh: number | null;
  extra_to_procure_mwh: number | null;
  mae: number | null;
  bias: number | null;
  max_abs_error: number | null;
  n: number;
}

export interface ErrorBand {
  q10: number;
  q50: number;
  q90: number;
}

export interface DecisionResponse {
  delivery_date: string;
  decision_time: string;
  forecast_run: string | null;
  forecast_age_minutes: number | null;
  next_run_after_cutoff: string | null;
  points: DecisionPoint[];
  summary: DecisionSummary;
  band: ErrorBand;
}

export interface SeriesPoint {
  start_time: string;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish_time: string | null;
  horizon_h: number | null;
}

export interface SeriesResponse {
  mode: 'cutoff' | 'horizon';
  horizon_h: number | null;
  cutoff: string | null;
  points: SeriesPoint[];
  actuals: { start_time: string; generation: number }[];
}

export interface AccuracyKpis {
  mae: number;
  rmse: number;
  bias: number;
  mape_pct: number | null;
  nmae_pct: number;
  p50_abs_error: number;
  p90_abs_error: number;
  p99_abs_error: number;
  max_abs_error: number;
  mean_actual: number;
  r2: number;
}

export interface ErrorQuantiles {
  q01: number;
  q05: number;
  q10: number;
  q25: number;
  q50: number;
  q75: number;
  q90: number;
  q95: number;
  q99: number;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface ByHour {
  hour: number;
  mae: number;
  bias: number;
  n: number;
}

export interface ByHorizon {
  horizon_h: number;
  mae: number;
  bias: number;
  rmse: number;
  n: number;
}

export interface ByDay {
  delivery_date: string;
  mae: number | null;
  bias: number | null;
  forecast_mwh: number | null;
  actual_mwh: number | null;
}

export interface ByLevel {
  bucket: string;
  mae: number;
  bias: number;
  n: number;
}

export interface WorstHour {
  start_time: string;
  forecast: number;
  actual: number;
  error: number;
}

export interface AccuracyResponse {
  mode: 'cutoff' | 'horizon';
  cutoff: string | null;
  horizon_h: number | null;
  n: number;
  kpis: AccuracyKpis;
  quantiles: ErrorQuantiles;
  histogram: HistogramBin[];
  by_hour: ByHour[];
  by_horizon: ByHorizon[];
  by_day: ByDay[];
  by_level: ByLevel[];
  worst_hours: WorstHour[];
}

export interface HorizonCurvePoint {
  horizon_h: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  p90_abs_error: number | null;
  n: number;
}

/** Either a decision cut-off (HH:MM) or a fixed forecast horizon in hours. */
export type SelectionParams = { kind: 'cutoff'; cutoff: string } | { kind: 'horizon'; horizonH: number };
