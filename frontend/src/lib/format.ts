/**
 * Formatting helpers. Every date/time is rendered in UTC explicitly: the data is UTC and in
 * January UK local time == UTC, but the viewer's browser may sit in any timezone. Never use
 * local-time getters (getHours, toLocaleString without timeZone) on API timestamps.
 */

export const DASH = '—';

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function num(v: number, dp: number): string {
  return v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** "1,234 MW" */
export function fmtMW(mw: number | null | undefined, dp = 0): string {
  return isNum(mw) ? `${num(mw, dp)} MW` : DASH;
}

/** "12.3 GW" from a MW value. */
export function fmtGW(mw: number | null | undefined, dp = 1): string {
  return isNum(mw) ? `${num(mw / 1000, dp)} GW` : DASH;
}

/** Picks MW below 1 GW and GW above, so error stats (hundreds of MW) and levels (GW) both read naturally. */
export function fmtPower(mw: number | null | undefined): string {
  if (!isNum(mw)) return DASH;
  return Math.abs(mw) < 1000 ? fmtMW(mw) : fmtGW(mw, 2);
}

/** Signed variant: "+455 MW", "−1.20 GW" (true minus sign). */
export function fmtSignedPower(mw: number | null | undefined): string {
  if (!isNum(mw)) return DASH;
  const sign = mw > 0 ? '+' : mw < 0 ? '−' : '±';
  return `${sign}${fmtPower(Math.abs(mw))}`;
}

/** "300.0 GWh" from MWh. */
export function fmtGWh(mwh: number | null | undefined, dp = 1): string {
  return isNum(mwh) ? `${num(mwh / 1000, dp)} GWh` : DASH;
}

export function fmtPct(v: number | null | undefined, dp = 1): string {
  return isNum(v) ? `${num(v, dp)}%` : DASH;
}

export function fmtNumber(v: number | null | undefined, dp = 2): string {
  return isNum(v) ? num(v, dp) : DASH;
}

/** 90 → "1h 30m", 45 → "45m", 120 → "2h". */
export function fmtDuration(minutes: number | null | undefined): string {
  if (!isNum(minutes)) return DASH;
  const m = Math.round(Math.abs(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** "07:30" in UTC. */
export function fmtUtcTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "14 Jan" in UTC; accepts an ISO timestamp or a YYYY-MM-DD date. */
export function fmtUtcDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = parseUtc(iso);
  if (!d) return DASH;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14 Jan 07:30" in UTC. */
export function fmtUtcDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return `${fmtUtcDate(iso)} ${fmtUtcTime(iso)}`;
}

/** "Thu 15 Jan 2026" from YYYY-MM-DD. */
export function fmtLongDate(ymd: string | null | undefined): string {
  if (!ymd) return DASH;
  const d = parseUtc(ymd);
  if (!d) return DASH;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function parseUtc(s: string): Date | null {
  // A bare YYYY-MM-DD is parsed by JS as UTC midnight already, but be explicit for clarity.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar arithmetic on YYYY-MM-DD strings, done in UTC so DST/timezone never shifts a day. */
export function addDays(ymd: string, days: number): string {
  const d = parseUtc(ymd);
  if (!d) throw new Error(`Invalid date: ${ymd}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function clampDate(ymd: string, min: string, max: string): string {
  // ISO dates compare correctly as strings.
  if (ymd < min) return min;
  if (ymd > max) return max;
  return ymd;
}

export function isValidYmd(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseUtc(s) !== null && addDays(s, 0) === s;
}

/** Minutes between two ISO timestamps (b − a). */
export function minutesBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000);
}

/** Compact axis tick for MW values shown in GW: 12000 → "12". */
export function gwTick(mw: number): string {
  const gw = mw / 1000;
  return Number.isInteger(gw) ? String(gw) : gw.toFixed(1);
}

/** Round-number ticks from 0 to just above `max` (MW), ~4–6 ticks on 1/2/2.5/5 × 10^n steps. */
export function niceTicks(max: number, target = 5): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v));
  return out;
}

/** Like niceTicks but also extends below zero when `min` is negative (signed measures such as bias). */
export function niceTicksSigned(min: number, max: number, target = 5): number[] {
  // Step is sized on the larger magnitude so both arms share it; the positive arm only reaches max.
  const step = niceTicks(Math.max(max, -min, 1), target)[1] ?? 1;
  const ticks: number[] = [];
  for (let v = -step; v > min - step; v -= step) ticks.unshift(Math.round(v));
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** MW axis tick with thousands separators: 2000 → "2,000". */
export function mwTick(mw: number): string {
  return Math.round(mw).toLocaleString('en-GB');
}
