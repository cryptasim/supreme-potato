import { describe, expect, it } from 'vitest';
import {
  DASH,
  addDays,
  clampDate,
  fmtDuration,
  fmtGW,
  fmtGWh,
  fmtLongDate,
  fmtMW,
  fmtPower,
  fmtSignedPower,
  fmtUtcDateTime,
  fmtUtcTime,
  gwTick,
  isValidYmd,
  minutesBetween,
  niceTicks,
  niceTicksSigned,
} from './format';

describe('power and energy formatting', () => {
  it('formats MW with thousands separators', () => {
    expect(fmtMW(12345.6)).toBe('12,346 MW');
  });
  it('converts MW to GW', () => {
    expect(fmtGW(12345)).toBe('12.3 GW');
    expect(fmtGW(12345, 2)).toBe('12.35 GW');
  });
  it('switches between MW and GW at 1 GW', () => {
    expect(fmtPower(800)).toBe('800 MW');
    expect(fmtPower(1500)).toBe('1.50 GW');
  });
  it('signs values with a true minus', () => {
    expect(fmtSignedPower(455)).toBe('+455 MW');
    expect(fmtSignedPower(-1200)).toBe('−1.20 GW');
  });
  it('converts MWh to GWh', () => {
    expect(fmtGWh(300000)).toBe('300.0 GWh');
  });
  it('renders missing values as a dash', () => {
    expect(fmtGW(null)).toBe(DASH);
    expect(fmtGWh(undefined)).toBe(DASH);
    expect(fmtSignedPower(Number.NaN)).toBe(DASH);
  });
  it('makes compact GW axis ticks', () => {
    expect(gwTick(12000)).toBe('12');
    expect(gwTick(2500)).toBe('2.5');
  });
});

describe('durations', () => {
  it('formats minutes as hours and minutes', () => {
    expect(fmtDuration(90)).toBe('1h 30m');
    expect(fmtDuration(45)).toBe('45m');
    expect(fmtDuration(120)).toBe('2h');
    expect(fmtDuration(null)).toBe(DASH);
  });
});

describe('UTC date handling', () => {
  it('formats times in UTC regardless of the local timezone', () => {
    expect(fmtUtcTime('2026-01-14T07:30:00Z')).toBe('07:30');
    expect(fmtUtcDateTime('2026-01-14T23:30:00Z')).toBe('14 Jan 23:30');
  });
  it('formats long dates from YYYY-MM-DD', () => {
    expect(fmtLongDate('2026-01-15')).toBe('Thu 15 Jan 2026');
  });
  it('steps days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-02', -1)).toBe('2026-01-01');
  });
  it('clamps to the delivery window', () => {
    expect(clampDate('2025-12-31', '2026-01-02', '2026-02-01')).toBe('2026-01-02');
    expect(clampDate('2026-03-01', '2026-01-02', '2026-02-01')).toBe('2026-02-01');
    expect(clampDate('2026-01-15', '2026-01-02', '2026-02-01')).toBe('2026-01-15');
  });
  it('validates YYYY-MM-DD strings', () => {
    expect(isValidYmd('2026-01-15')).toBe(true);
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('15/01/2026')).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
  it('measures minutes between timestamps', () => {
    expect(minutesBetween('2026-01-14T07:30:00Z', '2026-01-14T09:00:00Z')).toBe(90);
  });
});

describe('niceTicks', () => {
  it('produces round GW steps covering the max', () => {
    expect(niceTicks(17_300)).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(niceTicks(9_000)).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe('niceTicksSigned', () => {
  it('extends below zero for negative minima', () => {
    expect(niceTicksSigned(-300, 2400)).toEqual([-500, 0, 500, 1000, 1500, 2000, 2500]);
  });
  it('matches niceTicks when everything is positive', () => {
    expect(niceTicksSigned(0, 2400)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });
});
