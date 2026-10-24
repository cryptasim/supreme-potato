import { useCallback, useEffect, useReducer, useRef } from 'react';
import { IDLE_RUN, runReducer, type RunAction, type RunState } from './run';
import { postStream } from './sse';

/** Streams one agent run into a RunState. Starting again aborts the previous run. */
export async function streamRun(
  path: string,
  body: unknown,
  dispatch: (a: RunAction) => void,
  signal: AbortSignal,
): Promise<void> {
  dispatch({ type: 'begin' });
  try {
    await postStream(path, body, dispatch, signal);
    dispatch({ type: 'end' });
  } catch (e) {
    if (signal.aborted) dispatch({ type: 'cancel' });
    else dispatch({ type: 'fail', message: e instanceof Error ? e.message : 'The analyst request failed.' });
  }
}

export function useAgentRun(): {
  state: RunState;
  start: (path: string, body: unknown) => void;
  stop: () => void;
  reset: () => void;
} {
  const [state, dispatch] = useReducer(runReducer, IDLE_RUN);
  const ctrl = useRef<AbortController | null>(null);

  const start = useCallback((path: string, body: unknown) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    void streamRun(path, body, dispatch, c.signal);
  }, []);
  const stop = useCallback(() => ctrl.current?.abort(), []);
  const reset = useCallback(() => {
    ctrl.current?.abort();
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);
  return { state, start, stop, reset };
}
