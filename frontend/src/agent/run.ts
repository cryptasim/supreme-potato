import type { AgentEvent, AgentUsage, Briefing } from './types';

/** One tool invocation as the UI shows it: pending until its result arrives. */
export interface AgentStep {
  id: string;
  name: string;
  label: string;
  input: Record<string, unknown>;
  status: 'running' | 'ok' | 'error';
  durationMs?: number;
  output?: Record<string, unknown>;
}

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  model?: string;
  text: string;
  reasoning: string;
  steps: AgentStep[];
  briefing?: Briefing;
  error?: { message: string; retryable: boolean };
  stats?: { turns: number; toolCalls: number; usage: AgentUsage; elapsedMs: number; stopReason: string | null };
}

export const IDLE_RUN: RunState = { status: 'idle', text: '', reasoning: '', steps: [] };

export type RunAction =
  | AgentEvent
  | { type: 'reset' }
  | { type: 'begin' }
  | { type: 'fail'; message: string }
  | { type: 'cancel' }
  | { type: 'end' };

/** Pure reducer from the event stream to view state; every UI surface renders a RunState. */
export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'reset':
      return IDLE_RUN;
    case 'begin':
      return { ...IDLE_RUN, status: 'running' };
    case 'start':
      return { ...state, status: 'running', model: action.model };
    case 'text':
      return { ...state, text: state.text + action.delta };
    case 'reasoning':
      return { ...state, reasoning: state.reasoning + action.delta };
    case 'tool_call':
      return {
        ...state,
        steps: [
          ...state.steps,
          { id: action.id, name: action.name, label: action.label, input: action.input, status: 'running' },
        ],
      };
    case 'tool_result':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === action.id
            ? { ...s, status: action.ok ? 'ok' : 'error', durationMs: action.duration_ms, output: action.output }
            : s,
        ),
      };
    case 'briefing':
      return { ...state, briefing: action.briefing };
    case 'error':
      return { ...state, error: { message: action.message, retryable: action.retryable } };
    case 'done':
      return {
        ...state,
        status: state.error && !state.text && !state.briefing ? 'error' : 'done',
        model: action.model || state.model,
        stats: {
          turns: action.turns,
          toolCalls: action.tool_calls,
          usage: action.usage,
          elapsedMs: action.elapsed_ms,
          stopReason: action.stop_reason,
        },
      };
    case 'fail':
      return { ...state, status: 'error', error: { message: action.message, retryable: true } };
    case 'cancel':
      return state.status === 'running' ? { ...state, status: 'cancelled' } : state;
    case 'end':
      // The stream closed without a `done` frame: a dropped connection or a platform timeout.
      return state.status === 'running'
        ? {
            ...state,
            status: state.text || state.briefing ? 'done' : 'error',
            error: state.error ?? { message: 'The connection closed before the analyst finished.', retryable: true },
          }
        : state;
    default:
      return state;
  }
}

/** Human label for a model id, e.g. "claude-opus-5-5" -> "Claude Opus 5.5". */
export function modelLabel(id: string | undefined): string {
  if (!id) return 'Claude';
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id);
  if (!m) return id;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${family} ${m[3] ? `${m[2]}.${m[3]}` : m[2]}`;
}
