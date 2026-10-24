import { useState } from 'react';
import { modelLabel, type AgentStep, type RunState } from '../../agent/run';

/** Live, auditable record of what the agent did: each tool call, its timing, and the data it saw. */
export function AgentTrace({ run, defaultOpen = true }: { run: RunState; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const running = run.status === 'running';
  if (!run.steps.length && !run.reasoning && !running) return null;
  // The briefing's publish step is the deliverable, not research, so it is listed but not counted.
  const research = run.steps.filter((s) => s.name !== 'publish_briefing');
  const done = research.filter((s) => s.status !== 'running').length;

  return (
    <div className="rounded-lg border border-line bg-sunken/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-ink2 hover:text-ink"
      >
        {running ? <Spinner /> : <CheckIcon className="text-good" />}
        <span>
          {running
            ? research.length
              ? `Working · ${done}/${research.length} data calls complete`
              : 'Planning the analysis…'
            : `Researched with ${research.length} data call${research.length === 1 ? '' : 's'}`}
        </span>
        <Chevron open={open} className="ml-auto" />
      </button>
      {open && (run.steps.length > 0 || run.reasoning) && (
        <div className="border-t border-line px-3 pb-2.5 pt-2">
          {run.steps.length > 0 && (
            <ol className="relative ml-1.5 space-y-1.5 border-l border-line pl-3.5">
              {run.steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
            </ol>
          )}
          {run.reasoning && <Reasoning text={run.reasoning} />}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const [show, setShow] = useState(false);
  return (
    <li className="relative">
      <span
        aria-hidden
        className={`absolute -left-[19px] top-[5px] h-2 w-2 rounded-full ring-2 ring-[var(--surface-2)] ${
          step.status === 'running' ? 'animate-pulse bg-forecast' : step.status === 'ok' ? 'bg-good' : 'bg-critical'
        }`}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
        <span className="text-ink">{step.label}</span>
        <code className="font-mono text-[11px] text-muted">{step.name}</code>
        {step.durationMs !== undefined && <span className="text-[11px] tabular-nums text-muted">{step.durationMs} ms</span>}
        {step.status === 'error' && <span className="text-[11px] font-medium text-critical">rejected · agent retried</span>}
        {step.output && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-[11px] font-medium text-forecast underline-offset-2 hover:underline"
          >
            {show ? 'hide data' : 'view data'}
          </button>
        )}
      </div>
      {show && step.output && (
        <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-[11px] leading-snug text-ink2">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

function Reasoning({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink"
        aria-expanded={show}
      >
        <Chevron open={show} /> Reasoning summary
      </button>
      {show && <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-ink2">{text}</p>}
    </div>
  );
}

export function RunStats({ run }: { run: RunState }) {
  if (!run.stats) return null;
  const { usage, elapsedMs, toolCalls, turns } = run.stats;
  const total = usage.input_tokens + usage.output_tokens;
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  return (
    <p className="text-[11px] tabular-nums text-muted">
      {modelLabel(run.model)} · {toolCalls} tool call{toolCalls === 1 ? '' : 's'} · {turns} model turn
      {turns === 1 ? '' : 's'} · {(elapsedMs / 1000).toFixed(1)} s · {k(total)} tokens
      {usage.cache_read_input_tokens ? ` (${k(usage.cache_read_input_tokens)} cached)` : ''}
    </p>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" className={`animate-spin text-forecast ${className}`}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" className={className}>
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ open, className = '' }: { open: boolean; className?: string }) {
  return (
    <svg aria-hidden width="11" height="11" viewBox="0 0 12 12" className={`transition-transform ${open ? 'rotate-90' : ''} ${className}`}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SparkIcon({ className = '', size = 14 }: { className?: string; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" className={className}>
      <path
        d="M8 1.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5 2.9-.4 4.1-1.6 4.5-4.5Z"
        fill="currentColor"
      />
      <path d="M12.5 10c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2Z" fill="currentColor" opacity=".7" />
    </svg>
  );
}
