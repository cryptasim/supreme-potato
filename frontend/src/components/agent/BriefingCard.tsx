import { useEffect, useState } from 'react';
import { useAgentStatus } from '../../api/hooks';
import type { RunState } from '../../agent/run';
import type { Briefing, RiskLevel } from '../../agent/types';
import { useAgentRun } from '../../agent/useAgentRun';
import { fmtLongDate } from '../../lib/format';
import { AgentTrace, RunStats, SparkIcon } from './AgentTrace';

const RISK: Record<RiskLevel, { label: string; cls: string }> = {
  low: { label: 'Low shortfall risk', cls: 'bg-[color-mix(in_srgb,var(--good)_14%,transparent)] text-good' },
  elevated: { label: 'Elevated shortfall risk', cls: 'bg-risk-soft text-risk' },
  high: { label: 'High shortfall risk', cls: 'bg-[color-mix(in_srgb,var(--critical)_14%,transparent)] text-critical' },
};

// Finished briefings survive stepping between days (memory only, per page load).
const cache = new Map<string, RunState>();

const gwh = (v: number) => `${v.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GWh`;

interface Props {
  deliveryDate: string;
  cutoff: string;
  /** The desk's standard (in-sample P10) extra-to-procure, MWh, to compare the agent's call with. */
  standardExtraMwh: number | null;
}

/**
 * The agent's pre-gate briefing for one delivery day. The agent picks its own tools, then commits to
 * a schema-validated recommendation that renders as a fixed layout, not free text.
 */
export function BriefingCard({ deliveryDate, cutoff, standardExtraMwh }: Props) {
  const key = `${deliveryDate}@${cutoff}`;
  const status = useAgentStatus();
  const { state, start, stop, reset } = useAgentRun();
  const [runKey, setRunKey] = useState<string | null>(null);

  useEffect(() => {
    if (runKey && runKey !== key) {
      reset();
      setRunKey(null);
    }
  }, [key, runKey, reset]);

  useEffect(() => {
    if (runKey && state.status === 'done' && state.briefing) cache.set(runKey, state);
  }, [runKey, state]);

  const run = runKey === key ? state : cache.get(key);
  const enabled = status.data?.enabled ?? false;
  const generate = () => {
    cache.delete(key);
    setRunKey(key);
    start('/agent/briefing', { delivery_date: deliveryDate, cutoff });
  };

  return (
    <section
      aria-labelledby="briefing-title"
      className="relative overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-forecast via-metric to-risk" />
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
            <SparkIcon size={14} />
          </span>
          <div className="min-w-0">
            <h2 id="briefing-title" className="text-[15px] font-semibold leading-snug text-ink">
              AI pre-gate briefing · {fmtLongDate(deliveryDate)}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              An agent researches this day with WindSight&apos;s data tools, cross-checks the band out of sample, and commits
              to a recommendation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {run?.status === 'running' ? (
            <button type="button" onClick={stop} className={BTN_SECONDARY}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={!enabled}
              title={enabled ? undefined : (status.data?.reason ?? 'Analyst unavailable')}
              className={run?.briefing ? BTN_SECONDARY : BTN_PRIMARY}
            >
              <SparkIcon size={12} />
              {run?.briefing ? 'Regenerate' : 'Generate briefing'}
            </button>
          )}
        </div>
      </header>

      <div className="px-5 pb-5 pt-3">
        {!run || run.status === 'idle' ? (
          <IdleNote enabled={enabled} loading={status.isLoading} reason={status.data?.reason} />
        ) : (
          <div className="flex flex-col gap-4">
            {run.briefing && <BriefingView b={run.briefing} standardExtraMwh={standardExtraMwh} />}
            {!run.briefing && run.text && run.status !== 'running' && (
              <p className="text-[13px] text-ink2">{run.text}</p>
            )}
            {run.error && !run.briefing && (
              <p className="rounded-lg bg-sunken px-3 py-2 text-[12.5px] text-ink">
                {run.error.message}{' '}
                {run.error.retryable && (
                  <button type="button" onClick={generate} className="font-medium text-forecast hover:underline">
                    Retry
                  </button>
                )}
              </p>
            )}
            {run.status === 'cancelled' && <p className="text-[12px] text-muted">Stopped.</p>}
            <AgentTrace run={run} defaultOpen={run.status === 'running'} key={run.status === 'running' ? 'live' : 'done'} />
            <RunStats run={run} />
          </div>
        )}
      </div>
    </section>
  );
}

const BTN_PRIMARY =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-ink shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const BTN_SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-sunken disabled:opacity-40';

function IdleNote({ enabled, loading, reason }: { enabled: boolean; loading: boolean; reason?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-ink2">
      <p className="max-w-2xl leading-relaxed">
        {loading || enabled
          ? 'One click runs a Claude agent that plans its own research (decision view, trailing out-of-sample error, error by wind level, later runs), then publishes a risk-rated cover recommendation with the evidence behind it.'
          : `The analyst is switched off on this deployment. ${reason ?? ''}`}
      </p>
    </div>
  );
}

export function BriefingView({ b, standardExtraMwh }: { b: Briefing; standardExtraMwh: number | null }) {
  const risk = RISK[b.risk_level];
  const standard = standardExtraMwh === null ? null : standardExtraMwh / 1000;
  const delta = standard === null ? null : b.recommended_extra_gwh - standard;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${risk.cls}`}>
          {risk.label}
        </span>
        <p className="mt-2 text-[17px] font-semibold leading-snug tracking-tight text-ink">{b.headline}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">{b.recommendation}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <List title="Evidence" items={b.drivers} dot="bg-forecast" />
          <List title="Watch before the gate" items={b.watch_items} dot="bg-risk" />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          <span className="font-medium text-ink2">Confidence: </span>
          {b.confidence_note}
        </p>
        {b.hindsight && (
          <details className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-ink2">
            <summary className="cursor-pointer font-medium text-ink">Hindsight check (not known at the cut-off)</summary>
            <p className="mt-1.5 leading-relaxed">{b.hindsight}</p>
          </details>
        )}
      </div>

      <dl className="order-first grid content-start gap-2.5 rounded-xl border border-line bg-sunken p-4 lg:order-none">
        <div>
          <dt className="text-[11.5px] font-medium text-ink2">Recommended extra to procure</dt>
          <dd className="mt-0.5 text-[26px] font-semibold tabular-nums tracking-tight text-risk">{gwh(b.recommended_extra_gwh)}</dd>
          {delta !== null && standard !== null && (
            <dd className="text-[11.5px] text-muted">
              {Math.abs(delta) < 0.05
                ? 'Same as the standard P10 cover'
                : `${delta > 0 ? '+' : '−'}${gwh(Math.abs(delta))} vs the standard P10 cover (${gwh(standard)})`}
            </dd>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-line pt-2.5">
          <div>
            <dt className="text-[11px] text-muted">Reliable wind</dt>
            <dd className="text-[14px] font-semibold tabular-nums text-ink">{gwh(b.reliable_wind_gwh)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted">Forecast wind</dt>
            <dd className="text-[14px] font-semibold tabular-nums text-ink">{gwh(b.forecast_gwh)}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

function List({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((d) => (
          <li key={d} className="flex gap-2 text-[13px] leading-snug text-ink">
            <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
