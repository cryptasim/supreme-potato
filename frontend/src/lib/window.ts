import type { ActualMode } from '../api/types';

/** Decision window from the contract; /api/meta overrides when available. */
export const DELIVERY_FROM = '2026-01-02';
export const DELIVERY_TO = '2026-02-01';
/** A day with an instructive forecast miss makes a better first impression than Jan 2. */
export const DEFAULT_DELIVERY_DATE = '2026-01-15';

/** How FUELHH half-hours are aligned to hourly forecast targets (contract `actual_mode`). */
export const ACTUAL_MODE_OPTIONS: { value: ActualMode; label: string; title: string }[] = [
  { value: 'point', label: 'Settlement point', title: 'FUELHH value at the hour start' },
  { value: 'hourly_mean', label: 'Hourly mean', title: 'Mean of the two half-hours in the hour' },
];
