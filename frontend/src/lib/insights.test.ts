import { describe, expect, it } from 'vitest';
import { bandInsight, biasInsight, horizonInsight, worstHourInsight } from './insights';

describe('insights', () => {
  it('describes the central 80% band from actual − forecast quantiles', () => {
    const q = { q01: -4000, q05: -3000, q10: -2100, q25: -900, q50: 50, q75: 800, q90: 1900, q95: 2600, q99: 3800 };
    const i = bandInsight(q, 'At 09:00');
    expect(i?.headline).toBe('80% of the time, actual wind lands between 2.1 GW below and 1.9 GW above the forecast');
  });
  it('handles a band that sits entirely below the forecast', () => {
    const q = { q01: -7000, q05: -6000, q10: -5000, q25: -3500, q50: -2000, q75: -1000, q90: -300, q95: 200, q99: 1500 };
    expect(bandInsight(q, 'At 48h')?.headline).toBe(
      '80% of the time, actual wind lands between 0.3 GW and 5.0 GW below the forecast',
    );
  });
  it('reads positive bias (forecast − actual) as over-forecast', () => {
    expect(biasInsight(320)?.headline).toBe('Forecasts over-estimate wind by 320 MW on average');
    expect(biasInsight(320)?.tone).toBe('risk');
  });
  it('reads negative bias as under-forecast', () => {
    expect(biasInsight(-1500)?.headline).toBe('Forecasts under-estimate wind by 1.50 GW on average');
  });
  it('calls a tiny bias unbiased', () => {
    expect(biasInsight(10)?.headline).toMatch(/close to unbiased/);
  });
  it('quantifies the gain from waiting for a fresher forecast', () => {
    const curve = [
      { horizon_h: 4, mae: 500, rmse: 700, bias: 0, p90_abs_error: 1000, n: 744 },
      { horizon_h: 24, mae: 1000, rmse: 1400, bias: 0, p90_abs_error: 2000, n: 744 },
    ];
    expect(horizonInsight(curve)?.headline).toBe('Waiting from 24h to 4h ahead cuts typical error by 50%');
    expect(horizonInsight([])).toBeNull();
  });
  it('finds the worst hour of day', () => {
    const byHour = [
      { hour: 3, mae: 700, bias: 0, n: 31 },
      { hour: 17, mae: 1300, bias: 0, n: 31 },
    ];
    expect(worstHourInsight(byHour)?.headline).toBe('Errors peak around 17:00 UTC (MAE 1.30 GW)');
  });
  it('skips hours with a null MAE and returns null when none remain', () => {
    const byHour = [
      { hour: 3, mae: 700, bias: 0, n: 31 },
      { hour: 9, mae: null, bias: null, n: 0 },
      { hour: 17, mae: 1300, bias: 0, n: 31 },
    ];
    const i = worstHourInsight(byHour);
    expect(i?.headline).toBe('Errors peak around 17:00 UTC (MAE 1.30 GW)');
    expect(i?.detail).toMatch(/^The calmest hour is 03:00 UTC/);
    expect(worstHourInsight([{ hour: 0, mae: null, bias: null, n: 0 }])).toBeNull();
  });
  it('omits band and bias findings when the backend returns nulls', () => {
    const q = { q01: null, q05: null, q10: null, q25: null, q50: null, q75: null, q90: null, q95: null, q99: null };
    expect(bandInsight(q, 'At 09:00')).toBeNull();
    expect(biasInsight(null)).toBeNull();
  });
});
