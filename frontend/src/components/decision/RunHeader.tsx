import type { DecisionResponse } from '../../api/types';
import { fmtDuration, fmtUtcDateTime, fmtUtcTime, minutesBetween } from '../../lib/format';

/**
 * States plainly which forecast the desk was looking at when it decided, and how fresh it was.
 * This is the "latest forecast available at decision time" requirement made visible.
 */
export function RunHeader({ data }: { data: DecisionResponse }) {
  const { decision_time, forecast_run, forecast_age_minutes, next_run_after_cutoff } = data;
  const waitMin = next_run_after_cutoff ? minutesBetween(decision_time, next_run_after_cutoff) : null;
  const stale = (forecast_age_minutes ?? 0) >= 6 * 60;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="eyebrow">Forecast run used</div>
        {forecast_run ? (
          <p className="mt-1 text-lg font-semibold leading-snug text-ink">
            {fmtUtcDateTime(forecast_run)} UTC{' '}
            <span className="font-normal text-ink2">
              (age {fmtDuration(forecast_age_minutes)} at decision)
            </span>
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold text-ink">No forecast published before the cut-off</p>
        )}
        <p className="mt-1 text-[13px] text-ink2">
          Decision at {fmtUtcDateTime(decision_time)} UTC. Each hour uses the latest WINDFOR run published at or
          before this time.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Chip tone={stale ? 'warn' : 'ok'}>
          {stale ? 'Stale run' : 'Fresh run'} · {fmtDuration(forecast_age_minutes)} old
        </Chip>
        {next_run_after_cutoff && waitMin !== null && (
          <Chip tone="info">
            Next run {fmtUtcTime(next_run_after_cutoff)} lands {fmtDuration(waitMin)} after cut-off
          </Chip>
        )}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const dot = tone === 'ok' ? 'bg-good' : tone === 'warn' ? 'bg-risk' : 'bg-forecast';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 text-xs font-medium text-ink2">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
