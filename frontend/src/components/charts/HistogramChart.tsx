import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { HistogramBin } from '../../api/types';
import { fmtGW, gwTick } from '../../lib/format';
import { AXIS_PROPS, ChartLegend, GRID_PROPS, TooltipCard, xLabel, yLabel } from './common';

/**
 * Distribution of forecast − actual. Two-sided colour carries meaning: warm bins are
 * over-forecasts (wind came in short → shortfall), violet bins are under-forecasts (surplus).
 */
export function HistogramChart({ bins, height = 260 }: { bins: HistogramBin[]; height?: number }) {
  const total = bins.reduce((a, b) => a + b.count, 0) || 1;
  const rows = bins.map((b) => ({ ...b, mid: (b.bin_start + b.bin_end) / 2, share: (b.count / total) * 100 }));
  // Whole-GW ticks across the bin range (bins are 0.5 GW, so the axis spans bin edges exactly).
  const lo = bins.length ? bins[0].bin_start : -1000;
  const hi = bins.length ? bins[bins.length - 1].bin_end : 1000;
  const step = hi - lo > 9000 ? 2000 : 1000;
  const xTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) xTicks.push(v);

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: 'Over-forecast (wind short)', color: 'var(--risk)', shape: 'bar' },
          { label: 'Under-forecast (wind surplus)', color: 'var(--metric)', shape: 'bar' },
        ]}
      />
      <div role="img" aria-label="Histogram of hourly forecast errors in 0.5 GW bins" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 18, left: 8 }} barCategoryGap={2} accessibilityLayer>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="mid"
              type="number"
              domain={[lo, hi]}
              ticks={xTicks}
              {...AXIS_PROPS}
              tickFormatter={gwTick}
              label={xLabel('Error, forecast − actual (GW)')}
            />
            <YAxis {...AXIS_PROPS} axisLine={false} width={48} allowDecimals={false} label={yLabel('Hours')} />
            <Tooltip content={<HistTooltip />} cursor={{ fill: 'var(--grid)' }} />
            <ReferenceLine x={0} stroke="var(--ink-2)" strokeOpacity={0.6} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.bin_start} fill={r.bin_start >= 0 ? 'var(--risk)' : 'var(--metric)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HistTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as HistogramBin & { share: number };
  return (
    <TooltipCard
      title={`Error ${fmtGW(r.bin_start, 1)} to ${fmtGW(r.bin_end, 1)}`}
      rows={[
        { label: 'Hours', value: String(r.count), color: r.bin_start >= 0 ? 'var(--risk)' : 'var(--metric)', shape: 'bar' },
        { label: 'Share', value: `${r.share.toFixed(1)}%` },
      ]}
    />
  );
}
