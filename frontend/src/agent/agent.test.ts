import { describe, expect, it } from 'vitest';
import { toBlocks } from '../components/agent/Markdown';
import { suggestionsFor } from '../components/agent/AnalystPanel';
import { buildHistory, type ChatItem } from './AnalystProvider';
import { IDLE_RUN, modelLabel, runReducer, type RunAction, type RunState } from './run';
import { SseParser } from './sse';

const replay = (actions: RunAction[], from: RunState = IDLE_RUN) => actions.reduce(runReducer, from);

describe('SseParser', () => {
  it('reassembles frames split across arbitrary chunk boundaries', () => {
    const wire = 'data: {"type":"text","delta":"Hold "}\n\ndata: {"type":"text","delta":"99.7"}\r\n\r\n';
    const p = new SseParser();
    const out = [...wire].flatMap((ch) => p.push(ch));
    expect(out).toEqual([
      { type: 'text', delta: 'Hold ' },
      { type: 'text', delta: '99.7' },
    ]);
  });

  it('skips malformed and non-event frames', () => {
    const p = new SseParser();
    expect(p.push(': keep-alive\n\ndata: {oops\n\ndata: {"no":"type"}\n\ndata: {"type":"done"}\n\n')).toEqual([
      { type: 'done' },
    ]);
  });
});

describe('runReducer', () => {
  it('tracks tool steps, text and stats through a run', () => {
    const s = replay([
      { type: 'begin' },
      { type: 'start', run_id: 'r', model: 'claude-opus-5-5', kind: 'chat' },
      { type: 'tool_call', id: 'a', name: 'get_decision_view', label: 'Decision view', input: {} },
      { type: 'tool_call', id: 'b', name: 'rank_days', label: 'Rank', input: {} },
      { type: 'tool_result', id: 'b', name: 'rank_days', ok: false, duration_ms: 4, output: { error: 'x' } },
      { type: 'tool_result', id: 'a', name: 'get_decision_view', ok: true, duration_ms: 2, output: { f: 1 } },
      { type: 'text', delta: 'Buy ' },
      { type: 'text', delta: 'more.' },
      {
        type: 'done', stop_reason: 'end_turn', turns: 2, tool_calls: 2, elapsed_ms: 900, model: 'claude-opus-5-5',
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
      },
    ]);
    expect(s.status).toBe('done');
    expect(s.text).toBe('Buy more.');
    expect(s.steps.map((x) => [x.id, x.status, x.durationMs])).toEqual([
      ['a', 'ok', 2],
      ['b', 'error', 4],
    ]);
    expect(s.stats?.turns).toBe(2);
  });

  it('marks an error-only run as failed, but keeps a partial answer as done', () => {
    const errOnly = replay([{ type: 'begin' }, { type: 'error', message: 'down', retryable: true }, doneEvent()]);
    expect(errOnly.status).toBe('error');
    const partial = replay([{ type: 'begin' }, { type: 'text', delta: 'Partial' }, { type: 'error', message: 'cut', retryable: true }, doneEvent()]);
    expect(partial.status).toBe('done');
    expect(partial.error?.message).toBe('cut');
  });

  it('turns a stream that closes without done into a readable error', () => {
    const s = replay([{ type: 'begin' }, { type: 'end' }]);
    expect(s.status).toBe('error');
    expect(s.error?.message).toMatch(/connection closed/);
    expect(replay([{ type: 'end' }], { ...IDLE_RUN, status: 'done' }).status).toBe('done');
  });

  it('only cancels a running run', () => {
    expect(replay([{ type: 'begin' }, { type: 'cancel' }]).status).toBe('cancelled');
    expect(replay([{ type: 'cancel' }]).status).toBe('idle');
  });
});

function doneEvent(): RunAction {
  return {
    type: 'done', stop_reason: null, turns: 1, tool_calls: 0, elapsed_ms: 1, model: 'm',
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
  };
}

describe('buildHistory', () => {
  const answered = (text: string): RunState => ({ ...IDLE_RUN, status: 'done', text });
  it('keeps completed exchanges, drops failed ones and appends the question', () => {
    const items: ChatItem[] = [
      { id: '1', role: 'user', content: 'q1' },
      { id: '2', role: 'assistant', content: '', run: answered('a1') },
      { id: '3', role: 'user', content: 'q2' },
      { id: '4', role: 'assistant', content: '', run: { ...IDLE_RUN, status: 'error' } },
    ];
    expect(buildHistory(items, 'q3')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q3' },
    ]);
  });

  it('caps history so the request stays within the API limit of 20 messages', () => {
    const items: ChatItem[] = Array.from({ length: 30 }, (_, i) => [
      { id: `u${i}`, role: 'user' as const, content: `q${i}` },
      { id: `a${i}`, role: 'assistant' as const, content: '', run: answered(`a${i}`) },
    ]).flat();
    const h = buildHistory(items, 'last');
    expect(h).toHaveLength(19);
    expect(h[0]).toEqual({ role: 'user', content: 'q21' });
    expect(h.at(-1)).toEqual({ role: 'user', content: 'last' });
  });
});

describe('Markdown blocks', () => {
  it('parses headings, lists, tables and paragraphs', () => {
    const md = '## Call\nBuy **132 GWh**.\nMore text.\n\n- one\n- two\n  continued\n1. first\n\n| Cut-off | Run |\n|---|---|\n| 09:00 | 07:30 |\n';
    expect(toBlocks(md)).toEqual([
      { kind: 'h', level: 2, text: 'Call' },
      { kind: 'p', text: 'Buy **132 GWh**. More text.' },
      { kind: 'ul', items: ['one', 'two continued'] },
      { kind: 'ol', items: ['first'] },
      { kind: 'table', head: ['Cut-off', 'Run'], rows: [['09:00', '07:30']] },
    ]);
  });

  it('survives an unterminated code fence mid-stream', () => {
    expect(toBlocks('```\npartial')).toEqual([{ kind: 'code', text: 'partial' }]);
  });
});

describe('labels and suggestions', () => {
  it('formats model ids', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(modelLabel('claude-sonnet-5')).toBe('Claude Sonnet 5');
    expect(modelLabel(undefined)).toBe('Claude');
  });

  it('tailors suggestions to the page and day', () => {
    expect(suggestionsFor({ page: 'decision', delivery_date: '2026-01-15', cutoff: '09:00' })[0]).toContain('Thu 15 Jan');
    expect(suggestionsFor({ page: 'accuracy' })[0]).toMatch(/Summarise January/);
    expect(suggestionsFor({})).toHaveLength(3);
  });
});
