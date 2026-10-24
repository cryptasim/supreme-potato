/**
 * Decision cut-off helpers. A cut-off HH:MM on D-1 selects, per target hour, the latest forecast
 * run with publishTime <= cut-off (inclusive). Runs are published at fixed UTC times, so the run
 * that a cut-off picks can be worked out client-side for labelling the options.
 */

export const DEFAULT_CUTOFF = '09:00';

/** Nominal WINDFOR publication times (UTC); /api/meta is authoritative when loaded. */
export const DEFAULT_RUN_TIMES = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30'];

export interface CutoffPreset {
  cutoff: string;
  label: string;
  hint: string;
}

/** Market-anchored presets: the GB day-ahead auctions close at 09:20 (EPEX) and 09:50 (N2EX) UK time. */
export const CUTOFF_PRESETS: CutoffPreset[] = [
  { cutoff: '09:00', label: '09:00', hint: 'Before EPEX 09:20 gate' },
  { cutoff: '09:45', label: '09:45', hint: 'Before N2EX 09:50 gate' },
  { cutoff: '07:00', label: '07:00', hint: 'Early desk, overnight run' },
  { cutoff: '12:00', label: '12:00', hint: 'Late review, after gates' },
];

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isValidCutoff(s: string | null | undefined): s is string {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * The run a cut-off would use. If no run on D-1 is at or before the cut-off, the previous
 * evening's last run (D-2) is used, flagged by `previousDay`.
 */
export function runForCutoff(cutoff: string, runTimes: string[] = DEFAULT_RUN_TIMES): { run: string; previousDay: boolean } {
  const sorted = [...runTimes].sort((a, b) => toMin(a) - toMin(b));
  const eligible = sorted.filter((r) => toMin(r) <= toMin(cutoff));
  if (eligible.length > 0) return { run: eligible[eligible.length - 1], previousDay: false };
  return { run: sorted[sorted.length - 1], previousDay: true };
}

/** Half-hourly cut-off options for the free select, each labelled with the run it would use. */
export function buildCutoffOptions(runTimes: string[] = DEFAULT_RUN_TIMES): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const { run, previousDay } = runForCutoff(value, runTimes);
    out.push({ value, label: `${value} · uses ${run} run${previousDay ? ' (D-2)' : ''}` });
  }
  return out;
}
