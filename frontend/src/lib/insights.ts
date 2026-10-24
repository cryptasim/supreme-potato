/**
 * Plain-English findings computed from API data, shown as callouts on the accuracy page.
 * Each returns null when the inputs can't support a sentence, so the UI simply omits it.
 */
import type { ByHour, ErrorQuantiles, HorizonCurvePoint } from '../api/types';
import { fmtGW, fmtPower, fmtUtcTime } from './format';

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export interface Insight {
  id: string;
  headline: string;
  detail: string;
  tone: 'neutral' | 'risk' | 'good';
}

/**
 * Central 80% of (actual − forecast): q10..q90. A negative q10 means actual can fall that far
 * *below* forecast, which is the shortfall the desk must cover.
 */
export function bandInsight(q: ErrorQuantiles | undefined, context: string): Insight | null {
  if (!q || !isNum(q.q10) || !isNum(q.q90)) return null;
  const { q10, q90 } = q;
  const describe = (v: number) => (v < 0 ? `${fmtGW(-v)} below` : `${fmtGW(v)} above`);
  // With a strong over-forecast bias both quantiles can be negative: say "between X and Y below".
  const headline =
    q10 < 0 && q90 < 0
      ? `80% of the time, actual wind lands between ${fmtGW(-q90)} and ${fmtGW(-q10)} below the forecast`
      : `80% of the time, actual wind lands between ${describe(q10)} and ${describe(q90)} the forecast`;
  const detail =
    q10 < 0
      ? `${context}. In 1 hour in 10, wind falls short of forecast by more than ${fmtGW(-q10)}. That is the cover to hold for 90% confidence.`
      : `${context}. Even the low (P10) outcome is at or above the forecast, so no extra cover is indicated.`;
  return { id: 'band', headline, detail, tone: 'risk' };
}

/** Bias = mean(forecast − actual). Positive = over-forecast = wind tends to come in short. */
export function biasInsight(bias: number | undefined | null): Insight | null {
  if (!isNum(bias)) return null;
  if (Math.abs(bias) < 50) {
    return {
      id: 'bias',
      headline: 'Forecasts are close to unbiased on average',
      detail: `Mean error is ${fmtPower(bias)}. Over- and under-forecasts roughly cancel out, so day-to-day spread matters more than a systematic offset.`,
      tone: 'good',
    };
  }
  const over = bias > 0;
  return {
    id: 'bias',
    headline: over
      ? `Forecasts over-estimate wind by ${fmtPower(bias)} on average`
      : `Forecasts under-estimate wind by ${fmtPower(Math.abs(bias))} on average`,
    detail: over
      ? 'Wind tends to come in short of forecast. Buying to the raw forecast would leave you systematically under-covered.'
      : 'Wind tends to beat the forecast. Buying to the raw forecast would leave you slightly over-covered on average.',
    tone: over ? 'risk' : 'neutral',
  };
}

/** How much MAE improves by waiting from a day-ahead lead time to a short one. */
export function horizonInsight(curve: HorizonCurvePoint[] | undefined, fromH = 24, toH = 4): Insight | null {
  if (!curve?.length) return null;
  const at = (h: number) => curve.find((p) => p.horizon_h === h)?.mae ?? null;
  const far = at(fromH);
  const near = at(toH);
  if (far === null || near === null || far <= 0) return null;
  const cut = ((far - near) / far) * 100;
  return {
    id: 'horizon',
    headline: `Waiting from ${fromH}h to ${toH}h ahead cuts typical error by ${Math.round(cut)}%`,
    detail: `MAE falls from ${fmtPower(far)} to ${fmtPower(near)}. Day-ahead buying locks in the larger error, which is why intraday re-balancing pays.`,
    tone: 'neutral',
  };
}

/** The hour of day with the largest MAE. Hours without an MAE (no matched data) are skipped. */
export function worstHourInsight(byHour: ByHour[] | undefined): Insight | null {
  const rows = (byHour ?? []).filter((h): h is ByHour & { mae: number } => isNum(h.mae));
  if (!rows.length) return null;
  const worst = rows.reduce((a, b) => (b.mae > a.mae ? b : a));
  const best = rows.reduce((a, b) => (b.mae < a.mae ? b : a));
  const hh = (h: number) => fmtUtcTime(`2026-01-01T${String(h).padStart(2, '0')}:00:00Z`);
  return {
    id: 'hour',
    headline: `Errors peak around ${hh(worst.hour)} UTC (MAE ${fmtPower(worst.mae)})`,
    detail: `The calmest hour is ${hh(best.hour)} UTC at ${fmtPower(best.mae)}. Hold extra cover around the worst hours.`,
    tone: 'neutral',
  };
}
