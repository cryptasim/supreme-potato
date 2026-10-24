import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { HorizonCurvePoint } from '../../api/types';
import { fmtPower, gwTick, niceTicks } from '../../lib/format';
import { AXIS_PROPS, ChartLegend, GRID_PROPS, TooltipCard, xLabel, yLabel } from './common';

interface Props {
  curve: HorizonCurvePoint[];
  /** Highlight a selected horizon (horizon mode). */
  selectedH?: number | null;
  /** Shade the lead times a day-ahead decision actually uses (cut-off mode). */
  decisionRange?: [number, number] | null;
  height?: number;
}

/** "How much does waiting for a fresher forecast help?": error vs lead time. */
export function HorizonCurveChart({ curve, selectedH = null, decisionRange = null, height = 280 }: Props) {
  const ticks = niceTicks(Math.max(0, ...curve.map((p) => p.p90_abs_error ?? 0)) * 1.05);
  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={[
          { label: 'MAE', color: 'var(--metric)', shape: 'line' },
          { label: 'P90 absolute error (1-in-10 hour)', color: 'var(--risk)', shape: 'line' },
        ]}
      />
      <div role="img" aria-label="Forecast error versus lead time, 0 to 48 hours" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curve} margin={{ top: 16, right: 12, bottom: 18, left: 8 }} accessibilityLayer>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="horizon_h"
              type="number"
              domain={[0, 48]}
              ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
              {...AXIS_PROPS}
              label={xLabel('Lead time: hours between forecast publication and target hour')}
            />
            <YAxis {...AXIS_PROPS} axisLine={false} width={52} tickFormatter={gwTick} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} label={yLabel('Error (GW)')} />
            <Tooltip content={<CurveTooltip />} cursor={{ stroke: 'var(--axis)' }} />
            {decisionRange && (
              <ReferenceArea
                x1={decisionRange[0]}
                x2={decisionRange[1]}
                fill="var(--forecast-band)"
                fillOpacity={1}
                label={{ value: 'Day-ahead decision leads', position: 'insideTop', fill: 'var(--ink-2)', fontSize: 11 }}
              />
            )}
            {selectedH !== null && (
              <ReferenceLine
                x={selectedH}
                stroke="var(--ink)"
                strokeOpacity={0.55}
                label={{ value: `${selectedH}h`, position: 'top', fill: 'var(--ink)', fontSize: 11 }}
              />
            )}
            <Line dataKey="mae" stroke="var(--metric)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="p90_abs_error" stroke="var(--risk)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CurveTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as HorizonCurvePoint;
  return (
    <TooltipCard
      title={`${p.horizon_h}h or more ahead`}
      rows={[
        { label: 'MAE', value: fmtPower(p.mae), color: 'var(--metric)' },
        { label: 'P90 |error|', value: fmtPower(p.p90_abs_error), color: 'var(--risk)' },
        { label: 'RMSE', value: fmtPower(p.rmse) },
        { label: 'Bias', value: fmtPower(p.bias) },
      ]}
      footer={`${p.n} hours`}
    />
  );
}
