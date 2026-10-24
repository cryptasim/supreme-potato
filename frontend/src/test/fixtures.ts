import type { DecisionResponse, Meta } from '../api/types';

export const META: Meta = {
  source: 'Elexon BMRS FUELHH + WINDFOR',
  snapshot_created_at: '2026-10-24T20:00:00Z',
  delivery_from: '2026-01-02',
  delivery_to: '2026-02-01',
  decision_from: '2026-01-01',
  decision_to: '2026-01-31',
  default_cutoff: '09:00',
  forecast_runs: 264,
  forecast_run_times_utc: ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30'],
  actual_points: 1488,
  forecast_points: 19272,
  data_mode: 'snapshot',
};

export function decisionFixture(date = '2026-01-15'): DecisionResponse {
  const points = Array.from({ length: 24 }, (_, h) => {
    const forecast = 12000 + h * 100;
    const actual = forecast - 400;
    return {
      start_time: `${date}T${String(h).padStart(2, '0')}:00:00Z`,
      forecast,
      actual,
      error: forecast - actual,
      publish_time: '2026-01-14T07:30:00Z',
      horizon_h: 16.5 + h,
      p10: forecast - 2100,
      p90: forecast + 1900,
    };
  });
  return {
    delivery_date: date,
    decision_time: '2026-01-14T09:00:00Z',
    forecast_run: '2026-01-14T07:30:00Z',
    forecast_age_minutes: 90,
    next_run_after_cutoff: '2026-01-14T09:30:00Z',
    points,
    summary: {
      forecast_mwh: 315600,
      actual_mwh: 306000,
      p10_mwh: 265200,
      extra_to_procure_mwh: 50400,
      mae: 400,
      bias: 400,
      max_abs_error: 400,
      n: 24,
    },
    band: { q10: -2100, q50: 50, q90: 1900 },
  };
}
