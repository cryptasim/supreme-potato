import { describe, expect, it } from 'vitest';
import { buildCutoffOptions, isValidCutoff, runForCutoff } from './cutoff';

describe('runForCutoff', () => {
  it('uses the 07:30 run at the default 09:00 cut-off', () => {
    expect(runForCutoff('09:00')).toEqual({ run: '07:30', previousDay: false });
  });
  it('is inclusive: a run published exactly at the cut-off counts', () => {
    expect(runForCutoff('09:30')).toEqual({ run: '09:30', previousDay: false });
  });
  it('falls back to the previous evening run before the first run of the day', () => {
    expect(runForCutoff('01:00')).toEqual({ run: '22:30', previousDay: true });
  });
});

describe('cut-off options', () => {
  it('offers 48 half-hourly options labelled with their run', () => {
    const opts = buildCutoffOptions();
    expect(opts).toHaveLength(48);
    expect(opts.find((o) => o.value === '09:00')?.label).toBe('09:00 · uses 07:30 run');
  });
  it('validates HH:MM', () => {
    expect(isValidCutoff('09:45')).toBe(true);
    expect(isValidCutoff('24:00')).toBe(false);
    expect(isValidCutoff('9:00')).toBe(false);
  });
});
