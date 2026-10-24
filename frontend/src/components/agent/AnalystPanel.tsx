import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useAnalyst, type ChatItem } from '../../agent/AnalystProvider';
import { modelLabel } from '../../agent/run';
import type { AgentContextInfo } from '../../agent/types';
import { fmtLongDate } from '../../lib/format';
import { AgentTrace, RunStats, SparkIcon, Spinner } from './AgentTrace';
import { Markdown } from './Markdown';

export function suggestionsFor(ctx: AgentContextInfo): string[] {
  const day = ctx.delivery_date ? fmtLongDate(ctx.delivery_date) : null;
  if (ctx.page === 'decision' && day) {
    return [
      `Is the standard P10 cover enough for ${day}?`,
      `What changes for ${day} if we wait for the next forecast run?`,
      'Has the forecast been running high in the days before this decision?',
      'Which January days went worst, and what did they have in common?',
    ];
  }
  if (ctx.page === 'accuracy') {
    return [
      'Summarise January forecast accuracy for the desk in three bullets.',
      'How much does error shrink as delivery gets closer, and is it worth waiting?',
      'When is the forecast least reliable: which wind levels and hours?',
      'Which days went worst, and what happened?',
    ];
  }
  return [
    'How should the desk use the P10 band when buying day-ahead?',
    'How accurate were January wind forecasts at the 09:00 cut-off?',
    'Which January days had the biggest forecast misses?',
  ];
}

/** Slide-over analyst chat. Non-modal: the dashboard stays usable beside it on wide screens. */
export function AnalystPanel() {
  const a = useAnalyst();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const enabled = a.status?.enabled ?? false;

  useEffect(() => {
    if (a.open) inputRef.current?.focus();
  }, [a.open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a.items]);

  const { open, setOpen } = a;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const submit = () => {
    if (!draft.trim() || a.running || !enabled) return;
    a.ask(draft);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside
      aria-label="Desk analyst"
      // `invisible` (applied after the slide-out, via the visibility transition) also takes the closed
      // panel's controls out of the tab order and the accessibility tree.
      className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-2xl transition-[transform,visibility] duration-200 ${
        a.open ? 'visible translate-x-0' : 'invisible pointer-events-none translate-x-full'
      }`}
    >
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-ink">
          <SparkIcon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink">Desk Analyst</h2>
          <p className="text-[11.5px] text-muted">
            {modelLabel(a.status?.model)} agent · researches with WindSight&apos;s data tools
          </p>
        </div>
        {a.items.length > 0 && (
          <button
            type="button"
            onClick={a.clear}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-ink2 hover:bg-sunken hover:text-ink"
          >
            New chat
          </button>
        )}
        <button
          type="button"
          onClick={() => a.setOpen(false)}
          aria-label="Close analyst"
          className="rounded-md p-1.5 text-ink2 hover:bg-sunken hover:text-ink"
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
            <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {!a.statusLoading && !enabled ? (
          <NotConfigured reason={a.status?.reason} />
        ) : a.items.length === 0 ? (
          <EmptyState context={a.context} onPick={(q) => a.ask(q)} />
        ) : (
          <div className="flex flex-col gap-4">
            {a.items.map((it) => (
              <Message key={it.id} item={it} onRetry={(q) => a.ask(q)} items={a.items} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-line px-4 pb-3 pt-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-sunken px-3 py-2 focus-within:border-forecast">
          <label htmlFor="analyst-input" className="sr-only">
            Ask the analyst
          </label>
          <textarea
            id="analyst-input"
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!enabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder={enabled ? 'Ask about a delivery day, cover, or forecast accuracy…' : 'Analyst unavailable'}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
          />
          {a.running ? (
            <button
              type="button"
              onClick={a.stop}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-page"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || !enabled}
              className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-ink disabled:opacity-40"
            >
              Ask
            </button>
          )}
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-muted">
          Every figure comes from a logged tool call over the Elexon snapshot; open a step to audit it. Decision support,
          not a trading instruction.
        </p>
      </div>
    </aside>
  );
}

function EmptyState({ context, onPick }: { context: AgentContextInfo; onPick: (q: string) => void }) {
  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-ink2">
        Ask in plain English. The analyst plans its own research, calls WindSight&apos;s data tools (decision view,
        walk-forward accuracy, lead-time curve, cut-off comparison and more), and answers with the numbers it found.
      </p>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">Try</p>
      <div className="mt-2 flex flex-col gap-2">
        {suggestionsFor(context).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] text-ink hover:border-forecast hover:bg-sunken"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotConfigured({ reason }: { reason: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-line bg-sunken p-4 text-[13px] leading-relaxed text-ink2">
      <p className="font-semibold text-ink">The analyst is switched off on this deployment.</p>
      <p className="mt-1">{reason ?? 'No model API key is configured.'}</p>
      <p className="mt-2 text-[12px] text-muted">
        Operators: set <code className="font-mono">ANTHROPIC_API_KEY</code> in the environment and redeploy. The rest of
        WindSight works without it.
      </p>
    </div>
  );
}

function Message({ item, items, onRetry }: { item: ChatItem; items: ChatItem[]; onRetry: (q: string) => void }) {
  if (item.role === 'user') {
    return (
      <div className="ml-10 self-end rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-[13.5px] text-brand-ink">
        {item.content}
      </div>
    );
  }
  const run = item.run!;
  const idx = items.findIndex((i) => i.id === item.id);
  const question = idx > 0 ? items[idx - 1].content : '';
  return (
    <div className="flex flex-col gap-2.5">
      <AgentTrace run={run} defaultOpen={run.status === 'running'} key={run.status === 'running' ? 'live' : 'done'} />
      {run.text ? (
        <Markdown text={run.text} />
      ) : run.status === 'running' && run.steps.length === 0 ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <Spinner /> Thinking…
        </p>
      ) : null}
      {run.error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2 text-[12.5px] text-ink">
          <span>{run.error.message}</span>
          {run.error.retryable && question && (
            <button type="button" onClick={() => onRetry(question)} className="font-medium text-forecast hover:underline">
              Retry
            </button>
          )}
        </div>
      )}
      {run.status === 'cancelled' && <p className="text-[12px] text-muted">Stopped.</p>}
      <RunStats run={run} />
    </div>
  );
}
