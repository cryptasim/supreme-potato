import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { ActualMode, SelectionParams } from './types';

// The dataset is a fixed historical snapshot, so responses never go stale within a session.
const STATIC = { staleTime: Infinity, gcTime: 30 * 60_000 } as const;

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: ({ signal }) => api.meta(signal), ...STATIC });
}

export function useDecision(deliveryDate: string, cutoff: string, actualMode: ActualMode) {
  return useQuery({
    queryKey: ['decision', deliveryDate, cutoff, actualMode],
    queryFn: ({ signal }) => api.decision(deliveryDate, cutoff, actualMode, signal),
    // Keep the previous day on screen (dimmed) while stepping through dates: no layout jump.
    placeholderData: keepPreviousData,
    ...STATIC,
  });
}

export function useAccuracy(sel: SelectionParams, actualMode: ActualMode) {
  return useQuery({
    queryKey: ['accuracy', sel, actualMode],
    queryFn: ({ signal }) => api.accuracy(sel, actualMode, signal),
    placeholderData: keepPreviousData,
    ...STATIC,
  });
}

export function useSeries(start: string, end: string, sel: SelectionParams, actualMode: ActualMode) {
  return useQuery({
    queryKey: ['series', start, end, sel, actualMode],
    queryFn: ({ signal }) => api.series(start, end, sel, actualMode, signal),
    placeholderData: keepPreviousData,
    ...STATIC,
  });
}

export function useHorizonCurve(actualMode: ActualMode) {
  return useQuery({
    queryKey: ['horizon-curve', actualMode],
    queryFn: ({ signal }) => api.horizonCurve(actualMode, signal),
    placeholderData: keepPreviousData,
    ...STATIC,
  });
}
