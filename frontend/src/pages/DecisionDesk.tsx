import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAnalystPageContext } from '../agent/AnalystProvider';
import { useDecision, useMeta } from '../api/hooks';
import type { ActualMode, DecisionResponse } from '../api/types';
import { BriefingCard } from '../components/agent/BriefingCard';
import { DecisionChart } from '../components/charts/DecisionChart';
import { CutoffControl } from '../components/decision/CutoffControl';
import { DateStepper } from '../components/decision/DateStepper';
import { HourlyTable } from '../components/decision/HourlyTable';
import { RunHeader } from '../components/decision/RunHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { KpiGrid, KpiTile } from '../components/ui/KpiTile';
import { Panel } from '../components/ui/Panel';
import { Segmented } from '../components/ui/Segmented';
import { ChartSkeleton, KpiSkeletonRow, Skeleton } from '../components/ui/Skeleton';
import { DEFAULT_CUTOFF, isValidCutoff } from '../lib/cutoff';
import { clampDate, fmtGW, fmtGWh, fmtLongDate, fmtPower, fmtSignedPower, isValidYmd } from '../lib/format';
import { ACTUAL_MODE_OPTIONS, DEFAULT_DELIVERY_DATE, DELIVERY_FROM, DELIVERY_TO } from '../lib/window';

/**
 * Purpose 1: for a delivery day, show the forecast the desk had at its cut-off, how much wind
 * it can rely on at 90% confidence, and therefore how much extra to procure.
 * State lives in the URL so a view can be bookmarked or shared in a chat.
 */
export function DecisionDesk() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();
  const min = meta.data?.delivery_from ?? DELIVERY_FROM;
  const max = meta.data?.delivery_to ?? DELIVERY_TO;

  const rawDate = params.get('date');
  const date = clampDate(isValidYmd(rawDate) ? rawDate : DEFAULT_DELIVERY_DATE, min, max);
  const rawCutoff = params.get('cutoff');
  const cutoff = isValidCutoff(rawCutoff) ? rawCutoff : (meta.data?.default_cutoff ?? DEFAULT_CUTOFF);
  const actualMode: ActualMode = params.get('actual') === 'hourly_mean' ? 'hourly_mean' : 'point';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  const q = useDecision(date, cutoff, actualMode);
  useAnalystPageContext({ page: 'decision', delivery_date: date, cutoff });

  return (
    <div className="flex flex-col gap-5">
      <PageIntro />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-xl border border-line bg-surface px-4 py-4 shadow-card sm:px-5">
        <DateStepper value={date} min={min} max={max} onChange={(d) => update({ date: d })} />
        <CutoffControl value={cutoff} onChange={(c) => update({ cutoff: c })} runTimes={meta.data?.forecast_run_times_utc} />
        <Segmented
          label="Actual generation"
          value={actualMode}
          options={ACTUAL_MODE_OPTIONS}
          onChange={(v) => update({ actual: v })}
        />
      </div>

      {q.isError && !q.data ? (
        <Panel>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the decision for this day" />
        </Panel>
      ) : !q.data ? (
        <DecisionSkeleton />
      ) : (
        <DecisionBody data={q.data} busy={q.isFetching} cutoff={cutoff} />
      )}
    </div>
  );
}

function PageIntro() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Decision Desk</h1>
      <p className="mt-1 text-[14px] leading-relaxed text-ink2">
        What the day-ahead desk could see at its cut-off, how much wind to count on with 90% confidence, and how
        much to buy elsewhere to cover the shortfall risk.
      </p>
    </div>
  );
}

function DecisionBody({ data, busy, cutoff }: { data: DecisionResponse; busy: boolean; cutoff: string }) {
  const [showTable, setShowTable] = useState(false);
  const s = data.summary;
  const extraShare =
    s.extra_to_procure_mwh !== null && s.forecast_mwh ? (s.extra_to_procure_mwh / s.forecast_mwh) * 100 : null;
  // Energy totals cover hours with a forecast; `n` only counts hours that also have an actual.
  const forecastHours = s.forecast_hours ?? data.points.filter((p) => p.forecast !== null).length;

  return (
    <>
      <Panel busy={busy}>
        <RunHeader data={data} />
      </Panel>

      <div className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <KpiGrid>
          <KpiTile
            label="Forecast wind energy"
            swatch="forecast"
            value={fmtGWh(s.forecast_mwh)}
            note={`Delivery day total over ${forecastHours} hours with a forecast`}
          />
          <KpiTile
            label="Reliable wind at 90% (P10)"
            swatch="risk"
            value={fmtGWh(s.p10_mwh)}
            note="Sum of hourly P10s: each hour has a 90% chance of at least this much wind"
          />
          <KpiTile
            label="Extra to procure vs forecast"
            swatch="risk"
            emphasis
            value={fmtGWh(s.extra_to_procure_mwh)}
            note={
              extraShare !== null && s.extra_to_procure_mwh !== null && forecastHours > 0
                ? `≈ ${fmtGW(s.extra_to_procure_mwh / forecastHours)} per hour, ${extraShare.toFixed(0)}% of forecast. Cover from thermal or the market.`
                : 'Forecast minus P10, summed over the day'
            }
          />
          <KpiTile
            label="Realised MAE (hindsight)"
            swatch="metric"
            value={fmtPower(s.mae)}
            note={
              s.actual_mwh !== null
                ? `Actual ${fmtGWh(s.actual_mwh)} · bias ${fmtSignedPower(s.bias)} · ${s.n} hours with forecast and actual`
                : 'Actuals not yet available'
            }
          />
        </KpiGrid>
      </div>

      <BriefingCard deliveryDate={data.delivery_date} cutoff={cutoff} standardExtraMwh={s.extra_to_procure_mwh} />

      <Panel
        title={`Wind forecast vs actual · ${fmtLongDate(data.delivery_date)}`}
        subtitle="GB wind generation, GW · hourly targets · shaded band = P10–P90 from January's error distribution at this cut-off"
        busy={busy}
      >
        <DecisionChart points={data.points} />
        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            aria-expanded={showTable}
            aria-controls="hourly-detail"
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink2 hover:text-ink"
          >
            <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${showTable ? 'rotate-90' : ''}`}>
              <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showTable ? 'Hide' : 'Show'} hourly detail (24 rows)
          </button>
          {showTable && (
            <div id="hourly-detail" className="mt-3">
              <HourlyTable points={data.points} />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-risk" />
                Wind fell short by more than the P10 cover in this hour.
              </p>
            </div>
          )}
        </div>
      </Panel>

      <p className="text-xs leading-relaxed text-muted">
        Band quantiles (actual − forecast): q10 {fmtSignedPower(data.band.q10)}, median {fmtSignedPower(data.band.q50)},
        q90 {fmtSignedPower(data.band.q90)}. They come from all January delivery hours at this cut-off, so actuals inform
        the band. In live use it would be fitted on past months only.
      </p>
    </>
  );
}

function DecisionSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading decision">
      <div className="rounded-xl border border-line bg-surface px-5 py-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-6 w-80 max-w-full" />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>
      <KpiSkeletonRow />
      <div className="rounded-xl border border-line bg-surface px-5 py-4">
        <Skeleton className="h-4 w-64" />
        <ChartSkeleton />
      </div>
    </div>
  );
}
