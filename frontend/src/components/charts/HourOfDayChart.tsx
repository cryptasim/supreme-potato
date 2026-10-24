import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ByHour } from '../../api/types';
import { fmtPower, fmtSignedPower } from '../../lib/format';
import { AXIS_PROPS, ChartLegend, GRID_PROPS, TooltipCard, UTC_AXIS_TITLE, xLabel, yLabel } from './common';

/** MAE (bars) and bias (line) by hour of day. Same unit, so one axis. */
export function HourOfDayChart({ data, height = 260 }: { data: ByHour[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: String(d.hour).padStart(2, '0') }));
  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: 'MAE', color: 'var(--metric)', shape: 'bar' },
          { label: 'Bias (+ = over-forecast)', color: 'var(--risk)', shape: 'dots' },
        ]}
      />
      <div role="img" aria-label="Mean absolute error and bias by hour of day" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 18, left: 8 }} accessibilityLayer>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval={2} label={xLabel(`Hour of day, ${UTC_AXIS_TITLE}`)} />
            <YAxis
              {...AXIS_PROPS}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              label={yLabel('MW')}
            />
            <Tooltip content={<HourTooltip />} cursor={{ fill: 'var(--grid)' }} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Bar dataKey="mae" fill="var(--metric)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Line
              dataKey="bias"
              stroke="var(--risk)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--risk)', stroke: 'var(--surface)', strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HourTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as ByHour;
  return (
    <TooltipCard
      title={`${String(r.hour).padStart(2, '0')}:00 UTC`}
      rows={[
        { label: 'MAE', value: fmtPower(r.mae), color: 'var(--metric)', shape: 'bar' },
        { label: 'Bias', value: fmtSignedPower(r.bias), color: 'var(--risk)', shape: 'dots' },
      ]}
      footer={`${r.n} hours`}
    />
  );
}
