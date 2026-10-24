import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { DecisionPoint } from '../../api/types';
import { fmtGW, fmtSignedPower, fmtUtcDateTime, fmtUtcTime, gwTick } from '../../lib/format';
import { AXIS_PROPS, ChartLegend, GRID_PROPS, TooltipCard, UTC_AXIS_TITLE, xLabel, yLabel } from './common';

interface Row {
  hour: string;
  iso: string;
  forecast: number | null;
  actual: number | null;
  p10: number | null;
  p90: number | null;
  band: [number, number] | null;
  error: number | null;
  publish: string | null;
  horizon: number | null;
}

export function toDecisionRows(points: DecisionPoint[]): Row[] {
  return points.map((p) => ({
    hour: fmtUtcTime(p.start_time),
    iso: p.start_time,
    forecast: p.forecast,
    actual: p.actual,
    p10: p.p10,
    p90: p.p90,
    band: p.p10 !== null && p.p90 !== null ? [p.p10, p.p90] : null,
    error: p.error,
    publish: p.publish_time,
    horizon: p.horizon_h,
  }));
}

function DecisionTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as Row;
  return (
    <TooltipCard
      title={`${fmtUtcDateTime(r.iso)} UTC`}
      rows={[
        { label: 'Forecast', value: fmtGW(r.forecast, 2), color: 'var(--forecast)', shape: 'line' },
        {
          label: 'P10–P90',
          value: r.band ? `${fmtGW(r.p10, 1)} – ${fmtGW(r.p90, 1)}` : '—',
          color: 'var(--forecast-band)',
          shape: 'band',
        },
        { label: 'Reliable (P10)', value: fmtGW(r.p10, 2), color: 'var(--risk)', shape: 'dashed' },
        { label: 'Actual', value: fmtGW(r.actual, 2), color: 'var(--actual)', shape: 'dots' },
        { label: 'Error (F − A)', value: fmtSignedPower(r.error) },
      ]}
      footer={
        r.publish
          ? `Run ${fmtUtcDateTime(r.publish)} · ${r.horizon?.toFixed(1)}h ahead`
          : 'No eligible forecast for this hour'
      }
    />
  );
}

interface DecisionChartProps {
  points: DecisionPoint[];
  height?: number;
}

/**
 * The decision view's main chart: the forecast the desk would have used, its P10–P90 band from
 * January's error distribution, the P10 "reliable wind" floor, and (hindsight) what actually blew.
 */
export function DecisionChart({ points, height = 340 }: DecisionChartProps) {
  const rows = useMemo(() => toDecisionRows(points), [points]);

  // Annotate the hour with the largest realised miss; that's the hour a trader asks about.
  const worst = useMemo(() => {
    let best: Row | null = null;
    for (const r of rows) {
      if (r.error === null) continue;
      if (!best || Math.abs(r.error) > Math.abs(best.error ?? 0)) best = r;
    }
    return best;
  }, [rows]);

  const peakForecast = Math.max(0, ...rows.map((r) => Math.max(r.p90 ?? 0, r.actual ?? 0, r.forecast ?? 0)));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: 'Forecast (run used)', color: 'var(--forecast)', shape: 'line' },
          { label: 'P10–P90 range', color: 'var(--forecast-band)', shape: 'band' },
          { label: 'Reliable wind (P10)', color: 'var(--risk)', shape: 'dashed' },
          { label: 'Actual (hindsight)', color: 'var(--actual)', shape: 'dots' },
        ]}
      />
      <div
        role="img"
        aria-label={`Hourly wind forecast versus actual for the delivery day. Peak value about ${fmtGW(peakForecast)}.`}
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 18, right: 12, bottom: 18, left: 8 }} accessibilityLayer>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="hour" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={18} label={xLabel(`Hour starting, ${UTC_AXIS_TITLE}`)} />
            <YAxis
              {...AXIS_PROPS}
              axisLine={false}
              width={52}
              tickFormatter={gwTick}
              domain={[0, (max: number) => Math.ceil((max * 1.05) / 2000) * 2000]}
              label={yLabel('Wind generation (GW)')}
            />
            <Tooltip content={<DecisionTooltip />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
            <Area
              dataKey="band"
              type="monotone"
              stroke="none"
              fill="var(--forecast-band)"
              fillOpacity={1}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="p10"
              type="monotone"
              stroke="var(--risk)"
              strokeWidth={1.6}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="forecast"
              type="monotone"
              stroke="var(--forecast)"
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--forecast)', stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              type="monotone"
              stroke="var(--actual)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--actual)', stroke: 'var(--surface)', strokeWidth: 1.5 }}
              activeDot={{ r: 4.5, fill: 'var(--actual)', stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {worst && (
              <ReferenceLine
                x={worst.hour}
                stroke="var(--ink-2)"
                strokeOpacity={0.5}
                label={{
                  value: `Largest miss ${fmtSignedPower(worst.error)}`,
                  position: 'top',
                  fill: 'var(--ink-2)',
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
