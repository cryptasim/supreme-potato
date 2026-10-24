/**
 * Shared chart chrome so every chart reads as one system: recessive hairline grid and axes,
 * theme-token text, a legend with keys that mirror the mark, and a tooltip where the value leads.
 */
import type { ReactNode } from 'react';

export const GRID_PROPS = { stroke: 'var(--grid)', vertical: false } as const;

export const AXIS_PROPS = {
  stroke: 'var(--axis)',
  tickLine: false,
  tick: { fill: 'var(--muted)', fontSize: 11 },
} as const;

/** Rotated Y-axis title. Units always live here (or in the X title), never only in prose. */
export function yLabel(value: string) {
  return {
    value,
    angle: -90,
    position: 'insideLeft' as const,
    offset: 14,
    style: { textAnchor: 'middle', fill: 'var(--muted)', fontSize: 11 },
  };
}

export function xLabel(value: string) {
  return {
    value,
    position: 'insideBottom' as const,
    offset: -2,
    style: { fill: 'var(--muted)', fontSize: 11 },
  };
}

export const UTC_AXIS_TITLE = 'UTC (= UK time in Jan)';

export type KeyShape = 'line' | 'dots' | 'dashed' | 'band' | 'bar';

export interface LegendItem {
  label: string;
  color: string; // a CSS value, usually var(--token)
  shape: KeyShape;
}

/** Small inline SVG key that mirrors the mark it stands for. */
export function SeriesKey({ color, shape }: { color: string; shape: KeyShape }) {
  return (
    <svg aria-hidden width="20" height="10" viewBox="0 0 20 10" className="shrink-0">
      {shape === 'band' && <rect x="0" y="1" width="20" height="8" rx="2" fill={color} />}
      {shape === 'bar' && <rect x="5" y="0" width="10" height="10" rx="2" fill={color} />}
      {shape === 'line' && <line x1="1" y1="5" x2="19" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />}
      {shape === 'dashed' && (
        <line x1="1" y1="5" x2="19" y2="5" stroke={color} strokeWidth="1.6" strokeDasharray="4 3" />
      )}
      {shape === 'dots' && (
        <>
          <line x1="1" y1="5" x2="19" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="5" r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink2" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <SeriesKey color={i.color} shape={i.shape} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
  shape?: KeyShape;
}

/** Tooltip body: heading, then rows where the value is the strong element. */
export function TooltipCard({ title, rows, footer }: { title: string; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-medium text-ink2">{title}</div>
      <dl className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.color ? <SeriesKey color={r.color} shape={r.shape ?? 'line'} /> : <span className="w-5" />}
            <dt className="text-muted">{r.label}</dt>
            <dd className="tabular ml-auto pl-3 font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-muted">{footer}</div>}
    </div>
  );
}
