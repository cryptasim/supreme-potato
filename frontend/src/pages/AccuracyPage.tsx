import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAccuracy, useHorizonCurve, useMeta, useSeries } from '../api/hooks';
import type { AccuracyResponse, ActualMode, SelectionParams } from '../api/types';
import { WorstHoursTable } from '../components/accuracy/WorstHoursTable';
import { LevelTable } from '../components/accuracy/LevelTable';
import { DailyMaeChart } from '../components/charts/DailyMaeChart';
import { HistogramChart } from '../components/charts/HistogramChart';
import { HorizonCurveChart } from '../components/charts/HorizonCurveChart';
import { HourOfDayChart } from '../components/charts/HourOfDayChart';
import { SeriesChart } from '../components/charts/SeriesChart';
import { CutoffControl } from '../components/decision/CutoffControl';
import { InsightCallout } from '../components/ui/Callout';
import { ErrorState } from '../components/ui/ErrorState';
import { KpiGrid, KpiTile } from '../components/ui/KpiTile';
import { Panel } from '../components/ui/Panel';
import { Segmented } from '../components/ui/Segmented';
import { ChartSkeleton, KpiSkeletonRow } from '../components/ui/Skeleton';
import { DEFAULT_CUTOFF, isValidCutoff } from '../lib/cutoff';
import { addDays, clampDate, fmtNumber, fmtPct, fmtPower, fmtSignedPower, isValidYmd } from '../lib/format';
import { bandInsight, biasInsight, horizonInsight, worstHourInsight, type Insight } from '../lib/insights';
import { useDebounced } from '../lib/useDebounced';
import { ACTUAL_MODE_OPTIONS, DELIVERY_FROM, DELIVERY_TO } from '../lib/window';

type Mode = 'cutoff' | 'horizon';

/**
 * Purpose 2: how wrong is the forecast, and how does that depend on lead time and time of day?
 * Every chart below the controls row is scoped by the same selection (cut-off or horizon).
 */
export function AccuracyPage() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const min = meta.data?.delivery_from ?? DELIVERY_FROM;
  const max = meta.data?.delivery_to ?? DELIVERY_TO;

  const mode: Mode = params.get('mode') === 'horizon' ? 'horizon' : 'cutoff';
  const rawCutoff = params.get('cutoff');
  const cutoff = isValidCutoff(rawCutoff) ? rawCutoff : (meta.data?.default_cutoff ?? DEFAULT_CUTOFF);
  const urlH = Number(params.get('h'));
  const committedH = Number.isInteger(urlH) && urlH >= 0 && urlH <= 48 && params.has('h') ? urlH : 24;
  const actualMode: ActualMode = params.get('actual') === 'hourly_mean' ? 'hourly_mean' : 'point';

  // The slider moves a local value; the URL (and therefore the query) follows after a pause.
  const [sliderH, setSliderH] = useState(committedH);
  const horizonH = useDebounced(sliderH, 250);
  // Follow the URL when it changes underneath us (back/forward, a pasted or in-app link).
  useEffect(() => setSliderH(committedH), [committedH]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const sel: SelectionParams = useMemo(
    () => (mode === 'cutoff' ? { kind: 'cutoff', cutoff } : { kind: 'horizon', horizonH }),
    [mode, cutoff, horizonH],
  );

  const accuracy = useAccuracy(sel, actualMode);
  const curve = useHorizonCurve(actualMode);

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Forecast Accuracy</h1>
        <p className="mt-1 text-[14px] leading-relaxed text-ink2">
          How far national wind forecasts missed across the January 2026 decision window, and how that error shrinks
          as the forecast gets closer to delivery. Error = forecast − actual, so a positive value means wind came in
          short.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
        <Segmented
          label="Select forecasts by"
          value={mode}
          options={[
            { value: 'cutoff', label: 'Decision cut-off', title: 'Latest run at or before D-1 cut-off' },
            { value: 'horizon', label: 'Fixed lead time', title: 'Latest run published at least H hours ahead' },
          ]}
          onChange={(v) => update({ mode: v })}
        />
        {mode === 'cutoff' ? (
          <CutoffControl id="acc-cutoff" value={cutoff} onChange={(c) => update({ cutoff: c })} runTimes={meta.data?.forecast_run_times_utc} />
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:min-w-[240px] sm:max-w-sm sm:flex-1">
            <label htmlFor="horizon" className="flex items-baseline justify-between text-xs font-medium text-ink2">
              <span>Minimum lead time</span>
              <span className="tabular text-sm font-semibold text-ink">{sliderH} h</span>
            </label>
            <input
              id="horizon"
              type="range"
              min={0}
              max={48}
              step={1}
              value={sliderH}
              onChange={(e) => setSliderH(Number(e.target.value))}
              onPointerUp={() => update({ h: String(sliderH) })}
              onKeyUp={() => update({ h: String(sliderH) })}
              aria-valuetext={`${sliderH} hours`}
              className="h-9 w-full"
            />
            <div className="tabular flex justify-between text-[11px] text-muted">
              <span>0 h</span>
              <span>24 h</span>
              <span>48 h</span>
            </div>
          </div>
        )}
        <Segmented label="Actual generation" value={actualMode} options={ACTUAL_MODE_OPTIONS} onChange={(v) => update({ actual: v })} />
      </div>

      {accuracy.isError && !accuracy.data ? (
        <Panel>
          <ErrorState error={accuracy.error} onRetry={() => accuracy.refetch()} title="Could not load accuracy statistics" />
        </Panel>
      ) : !accuracy.data ? (
        <>
          <KpiSkeletonRow count={6} />
          <Panel title="Loading charts…">
            <ChartSkeleton height={260} />
          </Panel>
        </>
      ) : (
        <AccuracyBody
          data={accuracy.data}
          busy={accuracy.isFetching}
          mode={mode}
          horizonH={sliderH}
          curve={curve}
          sel={sel}
          actualMode={actualMode}
          min={min}
          max={max}
        />
      )}
    </div>
  );
}

interface BodyProps {
  data: AccuracyResponse;
  busy: boolean;
  mode: Mode;
  horizonH: number;
  curve: ReturnType<typeof useHorizonCurve>;
  sel: SelectionParams;
  actualMode: ActualMode;
  min: string;
  max: string;
}

function AccuracyBody({ data, busy, mode, horizonH, curve, sel, actualMode, min, max }: BodyProps) {
  const navigate = useNavigate();
  const k = data.kpis;

  // Lead times a cut-off decision actually spans, from the by-horizon buckets (floor(h)).
  const decisionRange = useMemo<[number, number] | null>(() => {
    if (mode !== 'cutoff' || !data.by_horizon.length) return null;
    const hs = data.by_horizon.map((b) => b.horizon_h);
    return [Math.min(...hs), Math.min(48, Math.max(...hs) + 1)];
  }, [mode, data.by_horizon]);

  const context =
    mode === 'cutoff'
      ? `At a ${data.cutoff ?? ''} D-1 cut-off${decisionRange ? ` (${decisionRange[0]}–${decisionRange[1]}h ahead)` : ''}, across ${data.n} delivery hours`
      : `With forecasts published at least ${data.horizon_h ?? horizonH}h ahead, across ${data.n} delivery hours`;

  const insights = [
    bandInsight(data.quantiles, context),
    biasInsight(k.bias),
    horizonInsight(curve.data),
    worstHourInsight(data.by_hour),
  ].filter((i): i is Insight => i !== null);

  return (
    <>
      <div className={`transition-opacity ${busy ? 'opacity-60' : ''}`}>
        <KpiGrid cols={6}>
          <KpiTile label="MAE" swatch="metric" value={fmtPower(k.mae)} note="Mean absolute error per hour" />
          <KpiTile label="RMSE" value={fmtPower(k.rmse)} note="Penalises big misses" />
          <KpiTile
            label="Bias"
            value={fmtSignedPower(k.bias)}
            note={
              k.bias === null ? 'No matched hours' : k.bias > 0 ? 'Over-forecast on average' : k.bias < 0 ? 'Under-forecast on average' : 'Unbiased'
            }
          />
          <KpiTile label="nMAE" value={fmtPct(k.nmae_pct)} note={`MAE ÷ mean actual (${fmtPower(k.mean_actual)})`} />
          <KpiTile label="P90 absolute error" swatch="risk" value={fmtPower(k.p90_abs_error)} note="9 hours in 10 miss by less" />
          <KpiTile label="R²" value={fmtNumber(k.r2, 3)} note="Share of variation explained" />
        </KpiGrid>
      </div>

      {insights.length > 0 && (
        <section aria-label="Key findings" className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <InsightCallout key={i.id} insight={i} />
          ))}
        </section>
      )}

      <Panel
        title="Error vs lead time"
        subtitle={`Error in GW for the latest forecast published at least H hours ahead, all January delivery hours. ${
          mode === 'cutoff' ? 'Shaded: the lead times your cut-off decision uses.' : `Marked: ${horizonH}h selected.`
        }`}
      >
        {curve.isError && !curve.data ? (
          <ErrorState error={curve.error} onRetry={() => curve.refetch()} />
        ) : !curve.data ? (
          <ChartSkeleton height={280} />
        ) : (
          <HorizonCurveChart curve={curve.data} selectedH={mode === 'horizon' ? horizonH : null} decisionRange={decisionRange} />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Distribution of hourly errors" subtitle="Hours per 0.5 GW error bin · forecast − actual" busy={busy}>
          <HistogramChart bins={data.histogram} />
        </Panel>
        <Panel title="Error by hour of day" subtitle="MW · MAE bars, bias line (+ = over-forecast)" busy={busy}>
          <HourOfDayChart data={data.by_hour} />
        </Panel>
      </div>

      <Panel
        title="Daily MAE"
        subtitle="MW per delivery day · worst day highlighted · click a bar to open that day on the Decision Desk"
        busy={busy}
      >
        <DailyMaeChart
          data={data.by_day}
          onSelectDay={(d) => navigate(`/?date=${d}${sel.kind === 'cutoff' ? `&cutoff=${sel.cutoff}` : ''}&actual=${actualMode}`)}
        />
      </Panel>

      <SeriesPanel sel={sel} actualMode={actualMode} min={min} max={max} />

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Worst 10 hours" subtitle="Largest absolute errors in the selection" className="lg:col-span-3" busy={busy}>
          <WorstHoursTable rows={data.worst_hours} cutoff={sel.kind === 'cutoff' ? sel.cutoff : null} actualMode={actualMode} />
        </Panel>
        <Panel title="Error by wind level" subtitle="Bucketed by forecast generation, 5 GW bands" className="lg:col-span-2" busy={busy}>
          <LevelTable rows={data.by_level} />
        </Panel>
      </div>
    </>
  );
}

const RANGE_PRESETS = (min: string, max: string) => [
  { label: 'First week', start: min, end: addDays(min, 6) },
  { label: 'Mid-month', start: '2026-01-12', end: '2026-01-18' },
  { label: 'Full window', start: min, end: max },
];

function SeriesPanel({ sel, actualMode, min, max }: { sel: SelectionParams; actualMode: ActualMode; min: string; max: string }) {
  const [range, setRange] = useState({ start: min, end: addDays(min, 13) });
  const start = clampDate(range.start, min, max);
  const end = clampDate(range.end < start ? start : range.end, min, max);
  const series = useSeries(start, end, sel, actualMode);

  const setDate = (key: 'start' | 'end', v: string) => {
    if (isValidYmd(v)) setRange((r) => ({ ...r, [key]: v }));
  };

  return (
    <Panel
      title="Forecast vs actual over time"
      subtitle="GW · hourly forecast at the current selection against native 30-minute actuals · drag the handles below to zoom"
      busy={series.isFetching}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <label htmlFor="series-start" className="text-[11px] text-muted">From</label>
            <input id="series-start" type="date" min={min} max={max} value={start} onChange={(e) => setDate('start', e.target.value)} className="tabular h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label htmlFor="series-end" className="text-[11px] text-muted">To</label>
            <input id="series-end" type="date" min={min} max={max} value={end} onChange={(e) => setDate('end', e.target.value)} className="tabular h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink" />
          </div>
          {RANGE_PRESETS(min, max).map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={p.start === start && p.end === end}
              onClick={() => setRange({ start: p.start, end: p.end })}
              className={`h-8 rounded-md border px-2.5 text-xs font-medium ${
                p.start === start && p.end === end ? 'border-transparent bg-brand text-brand-ink' : 'border-line bg-surface text-ink2 hover:bg-sunken'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
    >
      {series.isError && !series.data ? (
        <ErrorState error={series.error} onRetry={() => series.refetch()} />
      ) : !series.data ? (
        <ChartSkeleton height={340} />
      ) : (
        <SeriesChart data={series.data} />
      )}
    </Panel>
  );
}
