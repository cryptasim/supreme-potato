import { useMemo } from 'react';
import { Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { SeriesResponse } from '../../api/types';
import { fmtGW, fmtSignedPower, fmtUtcDate, fmtUtcDateTime, gwTick } from '../../lib/format';
import { AXIS_PROPS, ChartLegend, GRID_PROPS, TooltipCard, UTC_AXIS_TITLE, xLabel, yLabel } from './common';

interface Row {
  ts: number;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish: string | null;
  horizon: number | null;
}

/**
 * Merge hourly forecasts with native half-hourly actuals on one numeric time axis.
 * Forecast is null on the half-hours; connectNulls on that line bridges only those gaps.
 */
export function mergeSeries(data: SeriesResponse): Row[] {
  const byTs = new Map<number, Row>();
  const get = (iso: string) => {
    const ts = Date.parse(iso);
    let r = byTs.get(ts);
    if (!r) {
      r = { ts, forecast: null, actual: null, error: null, publish: null, horizon: null };
      byTs.set(ts, r);
    }
    return r;
  };
  for (const a of data.actuals) get(a.start_time).actual = a.generation;
  for (const p of data.points) {
    const r = get(p.start_time);
    r.forecast = p.forecast;
    r.error = p.error;
    r.publish = p.publish_time;
    r.horizon = p.horizon_h;
    if (r.actual === null) r.actual = p.actual;
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

export function SeriesChart({ data, height = 340 }: { data: SeriesResponse; height?: number }) {
  const rows = useMemo(() => mergeSeries(data), [data]);
  const fmtTick = (ts: number) => fmtUtcDate(new Date(ts).toISOString());

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: 'Forecast (selected run)', color: 'var(--forecast)', shape: 'line' },
          { label: 'Actual (FUELHH, 30-min)', color: 'var(--actual)', shape: 'line' },
        ]}
      />
      <div role="img" aria-label="Forecast versus actual wind generation over the selected dates" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 8 }} accessibilityLayer>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              {...AXIS_PROPS}
              tickFormatter={fmtTick}
              minTickGap={28}
              label={xLabel(`Date, ${UTC_AXIS_TITLE}`)}
              height={40}
            />
            <YAxis {...AXIS_PROPS} axisLine={false} width={52} tickFormatter={gwTick} label={yLabel('Wind generation (GW)')} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: 'var(--axis)' }} />
            <Line dataKey="actual" stroke="var(--actual)" strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="forecast" stroke="var(--forecast)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Brush
              dataKey="ts"
              height={26}
              travellerWidth={8}
              stroke="var(--axis)"
              fill="var(--surface-2)"
              tickFormatter={fmtTick}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SeriesTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as Row;
  return (
    <TooltipCard
      title={`${fmtUtcDateTime(new Date(r.ts).toISOString())} UTC`}
      rows={[
        { label: 'Forecast', value: fmtGW(r.forecast, 2), color: 'var(--forecast)' },
        { label: 'Actual', value: fmtGW(r.actual, 2), color: 'var(--actual)' },
        ...(r.error !== null ? [{ label: 'Error (F − A)', value: fmtSignedPower(r.error) }] : []),
      ]}
      footer={r.publish ? `Run ${fmtUtcDateTime(r.publish)} · ${r.horizon?.toFixed(1)}h ahead` : 'Half-hour actual only'}
    />
  );
}
