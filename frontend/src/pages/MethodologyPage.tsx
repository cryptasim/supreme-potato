import type { ReactNode } from 'react';
import { useAnalystPageContext } from '../agent/AnalystProvider';
import { useMeta } from '../api/hooks';
import { DEFAULT_RUN_TIMES } from '../lib/cutoff';
import { fmtUtcDateTime } from '../lib/format';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line pt-6">
      <h2 id={`${id}-h`} className="text-lg font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <div className="mt-2 flex max-w-[68ch] flex-col gap-3 text-[14px] leading-relaxed text-ink2">{children}</div>
    </section>
  );
}

const Rule = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border border-line bg-sunken px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
    {children}
  </div>
);

const SECTIONS = [
  ['window', 'Decision window'],
  ['cutoff', 'Cut-off rule'],
  ['selection', 'Forecast selection'],
  ['alignment', 'Time alignment'],
  ['error', 'Error definition'],
  ['band', 'Shortfall-risk band'],
  ['sources', 'Data sources'],
  ['analyst', 'AI desk analyst'],
  ['limits', 'Limitations & next steps'],
] as const;

/** Plain statement of every rule the numbers depend on, mirroring docs/API_CONTRACT.md. */
export function MethodologyPage() {
  const meta = useMeta();
  useAnalystPageContext({ page: 'methodology' });
  const runs = meta.data?.forecast_run_times_utc ?? DEFAULT_RUN_TIMES;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="On this page" className="hidden lg:block">
        <ul className="sticky top-24 flex flex-col gap-1.5 text-[13px]">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-ink2 hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex min-w-0 flex-col gap-6">
        <header className="max-w-[68ch]">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Methodology</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-ink2">
            The rules behind every number in WindSight. They are applied identically by the API and described here in
            plain terms so the desk can check them.
          </p>
        </header>

        <Section id="window" title="Decision window">
          <p>
            Purchase decisions are made on day D-1 between 1 and 31 January 2026, for delivery on day D. Delivery days
            therefore run from <strong className="text-ink">2 January to 1 February 2026</strong>. Each delivery day has
            24 hourly targets, 00:00 to 23:00 UTC.
          </p>
          <p>January is GMT, so UK local time equals UTC throughout. All times in the app are labelled UTC.</p>
        </Section>

        <Section id="cutoff" title="Cut-off rule">
          <p>
            The desk decides at a cut-off time on D-1, <strong className="text-ink">09:00 by default</strong>. That sits
            before the GB day-ahead auction gates: EPEX SPOT at 09:20 and N2EX at 09:50. You can move the cut-off to
            see what a later or earlier decision would have seen.
          </p>
          <p>
            WINDFOR runs are published around {runs.join(', ')} UTC. At 09:00 the 07:30 run is the freshest available.
            The 09:30 run lands after the EPEX gate has closed.
          </p>
        </Section>

        <Section id="selection" title="Forecast selection">
          <p>For each delivery hour, WindSight takes the single forecast the desk could actually have used:</p>
          <Rule>
            decision_time = (D − 1) at cut-off, UTC
            <br />
            selected = forecast with the latest publishTime where
            <br />
            &nbsp;&nbsp;publishTime ≤ decision_time and publishTime &lt; startTime
          </Rule>
          <p>
            The Forecast Accuracy page also offers a fixed lead-time mode. It picks the latest forecast published at
            least H hours before the target (H from 0 to 48), which isolates how error depends on lead time.
          </p>
          <p>
            Hours with no eligible forecast, or no actual, are left out of the error statistics. On the Decision Desk
            they still appear, with blank values.
          </p>
        </Section>

        <Section id="alignment" title="Time alignment">
          <p>
            WINDFOR forecasts are hourly, on the hour. FUELHH actuals are half-hourly settlement periods. Errors are
            computed on the hourly grid:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong className="text-ink">Settlement point</strong> (default): the actual whose half-hour starts at
              the same time as the forecast hour.
            </li>
            <li>
              <strong className="text-ink">Hourly mean</strong>: the mean of the two half-hours inside the hour.
            </li>
          </ul>
          <p>The time-series chart also draws the native 30-minute actuals so nothing is hidden by the alignment.</p>
        </Section>

        <Section id="error" title="Error definition">
          <Rule>error = forecast − actual (MW)</Rule>
          <p>
            A positive error is an over-forecast: wind came in short and the desk would need to buy more. MAE, RMSE,
            bias, nMAE (MAE ÷ mean actual), percentiles of absolute error and R² are all computed from this hourly
            error.
          </p>
        </Section>

        <Section id="band" title="Shortfall-risk band">
          <p>
            The P10–P90 band comes from the empirical distribution of (actual − forecast) across all January delivery
            hours, using the same cut-off and alignment. Its 10th and 90th percentiles, q10 and q90, are added to each
            hour's forecast F:
          </p>
          <Rule>
            P10 = max(0, F + q10) &nbsp;·&nbsp; P90 = max(0, F + q90)
            <br />
            reliable wind at 90% confidence = P10
            <br />
            extra to procure = F − P10
          </Rule>
          <p>
            In words: in 9 hours out of 10, wind generation was at least the P10 value. The gap between the forecast and
            P10 is the energy to cover from other sources if the desk wants that level of confidence.
          </p>
        </Section>

        <Section id="sources" title="Data sources">
          <ul className="list-disc pl-5">
            <li>
              Actual wind generation: Elexon BMRS{' '}
              <a className="text-ink underline underline-offset-2" href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH" target="_blank" rel="noreferrer">
                FUELHH
              </a>
              , fuel type WIND, half-hourly.
            </li>
            <li>
              Wind forecasts: Elexon BMRS{' '}
              <a className="text-ink underline underline-offset-2" href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR" target="_blank" rel="noreferrer">
                WINDFOR
              </a>
              , national hourly forecasts at lead times from about −14.5 h to 57.5 h.
            </li>
            <li>
              Market context: day-ahead gate times for{' '}
              <a className="text-ink underline underline-offset-2" href="https://www.epexspot.com/en/market-results" target="_blank" rel="noreferrer">
                EPEX SPOT
              </a>{' '}
              and{' '}
              <a className="text-ink underline underline-offset-2" href="https://www.nordpoolgroup.com/" target="_blank" rel="noreferrer">
                N2EX (Nord Pool)
              </a>
              .
            </li>
          </ul>
          {meta.data && (
            <p className="text-[13px] text-muted">
              Loaded: {meta.data.forecast_runs} forecast runs, {meta.data.forecast_points.toLocaleString('en-GB')}{' '}
              forecast points and {meta.data.actual_points.toLocaleString('en-GB')} half-hourly actuals. Source:{' '}
              {meta.data.data_mode} data, snapshot taken {fmtUtcDateTime(meta.data.snapshot_created_at)} UTC.
            </p>
          )}
        </Section>

        <Section id="analyst" title="AI desk analyst">
          <p>
            The analyst is a Claude agent with tool use. It does not see the database directly and it does not
            calculate anything itself: it plans which of WindSight&apos;s data tools to call, reads their results and
            explains them. The tools run the same code as the dashboard, so its numbers match the screens.
          </p>
          <Rule>
            get_decision_view · get_trailing_performance · get_accuracy_summary · get_lead_time_curve ·
            compare_cutoffs · rank_days · get_outturn (hindsight) · get_dataset_overview
          </Rule>
          <ul className="list-disc pl-5">
            <li>
              <strong className="text-ink">Decision time and hindsight are kept apart.</strong> The decision view
              contains no actuals; outturn comes from a separately labelled hindsight tool.
            </li>
            <li>
              <strong className="text-ink">Out-of-sample check.</strong> get_trailing_performance only uses hours that
              were already metered before the decision time, giving a walk-forward band to test the January-wide
              (in-sample) P10 against.
            </li>
            <li>
              <strong className="text-ink">Structured briefing.</strong> The pre-gate briefing must be published through
              a schema-validated tool (risk level, recommended cover, evidence, watch items); an invalid briefing is
              sent back to the agent to fix.
            </li>
            <li>
              <strong className="text-ink">Auditable.</strong> Every tool call, its timing and the exact data returned
              are shown beside the answer.
            </li>
            <li>
              <strong className="text-ink">Bounded.</strong> Each run is capped in steps and time, and requests are rate
              limited.
            </li>
          </ul>
          <p>The analyst supports the decision; the desk owns it.</p>
        </Section>

        <Section id="limits" title="Limitations & next steps">
          <ul className="list-disc pl-5">
            <li>
              The band is fitted on the same month it is shown for, so it uses hindsight. In production it would be
              fitted on a rolling window of past months only.
            </li>
            <li>
              WINDFOR covers transmission-metered wind. Embedded wind and solar sit in demand, not here.
            </li>
            <li>One month of data is a small sample: one storm can move the tails.</li>
            <li>
              FUELHH is metered output after balancing actions. Part of January's steady over-forecast may be wind
              curtailed for grid constraints rather than forecast skill. That hypothesis is worth testing with BOAL
              data.
            </li>
          </ul>
          <p className="font-medium text-ink">Next steps</p>
          <ul className="list-disc pl-5">
            <li>Add solar (and other renewables) to size the full intermittent shortfall.</li>
            <li>Condition the band on lead time, hour and wind level, or use probabilistic forecasts directly.</li>
            <li>Integrate demand and day-ahead prices to turn MWh of cover into £ of expected cost.</li>
            <li>Alert the desk when a fresh run moves the forecast by more than the P10 cover before the gate.</li>
          </ul>
        </Section>
      </article>
    </div>
  );
}
