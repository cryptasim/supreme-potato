import type {
  AccuracyResponse,
  ActualMode,
  DecisionResponse,
  HorizonCurvePoint,
  Meta,
  SelectionParams,
  SeriesResponse,
} from './types';

/** Same-origin by default ("/api/..."), overridable at build time for a separately hosted API. */
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | undefined>;

export function buildUrl(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}/api${path}${qs ? `?${qs}` : ''}`;
}

async function getJson<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  const res = await fetch(buildUrl(path, query), { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    // FastAPI errors are {"detail": string | validation-error[]}; surface something readable.
    let detail = `${res.status} ${res.statusText}`.trim();
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
    } catch {
      /* non-JSON body: keep status text */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

function selectionQuery(sel: SelectionParams): Query {
  return sel.kind === 'cutoff' ? { cutoff: sel.cutoff } : { horizon_h: sel.horizonH };
}

export const api = {
  meta: (signal?: AbortSignal) => getJson<Meta>('/meta', undefined, signal),

  decision: (deliveryDate: string, cutoff: string, actualMode: ActualMode, signal?: AbortSignal) =>
    getJson<DecisionResponse>('/decision', { delivery_date: deliveryDate, cutoff, actual_mode: actualMode }, signal),

  accuracy: (sel: SelectionParams, actualMode: ActualMode, signal?: AbortSignal) =>
    getJson<AccuracyResponse>('/accuracy', { ...selectionQuery(sel), actual_mode: actualMode }, signal),

  series: (start: string, end: string, sel: SelectionParams, actualMode: ActualMode, signal?: AbortSignal) =>
    getJson<SeriesResponse>('/series', { start, end, ...selectionQuery(sel), actual_mode: actualMode }, signal),

  horizonCurve: (actualMode: ActualMode, signal?: AbortSignal) =>
    getJson<HorizonCurvePoint[]>('/horizon-curve', { actual_mode: actualMode }, signal),
};
