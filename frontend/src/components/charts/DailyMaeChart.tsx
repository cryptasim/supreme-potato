import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ByDay } from '../../api/types';
import { fmtGWh, fmtLongDate, fmtPower, fmtSignedPower, fmtUtcDate, mwTick, niceTicks } from '../../lib/format';
import { AXIS_PROPS, GRID_PROPS, TooltipCard, xLabel, yLabel } from './common';

interface Props {
  data: ByDay[];
  onSelectDay?: (ymd: string) => void;
  height?: number;
}

/** Daily MAE; the worst day is called out in the risk hue. Clicking a bar opens that day on the desk. */
export function DailyMaeChart({ data, onSelectDay, height = 240 }: Props) {
  const rows = data.map((d) => ({ ...d, label: fmtUtcDate(d.delivery_date) }));
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.mae ?? 0)) * 1.04);
  const worst = rows.reduce<ByDay | null>((a, b) => ((b.mae ?? -1) > (a?.mae ?? -1) ? b : a), null);

  return (
    <div role="img" aria-label="Mean absolute error for each delivery day" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 18, left: 8 }} barCategoryGap={2} accessibilityLayer>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={14} label={xLabel('Delivery day (2026)')} />
          <YAxis
            {...AXIS_PROPS}
            axisLine={false}
            width={56}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            tickFormatter={mwTick}
            label={yLabel('MAE (MW)')}
          />
          <Tooltip content={<DayTooltip />} cursor={{ fill: 'var(--grid)' }} />
          <Bar
            dataKey="mae"
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
            cursor={onSelectDay ? 'pointer' : undefined}
            onClick={(item) => {
              const day = (item as { payload?: ByDay }).payload?.delivery_date;
              if (day) onSelectDay?.(day);
            }}
          >
            {rows.map((r) => (
              <Cell key={r.delivery_date} fill={r.delivery_date === worst?.delivery_date ? 'var(--risk)' : 'var(--metric)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DayTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload as ByDay;
  return (
    <TooltipCard
      title={fmtLongDate(r.delivery_date)}
      rows={[
        { label: 'MAE', value: fmtPower(r.mae), color: 'var(--metric)', shape: 'bar' },
        { label: 'Bias', value: fmtSignedPower(r.bias) },
        { label: 'Forecast', value: fmtGWh(r.forecast_mwh) },
        { label: 'Actual', value: fmtGWh(r.actual_mwh) },
      ]}
      footer="Click to open this day in the Decision Desk"
    />
  );
}
