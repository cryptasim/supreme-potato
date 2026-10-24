import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAgentStatus } from '../api/hooks';
import { IDLE_RUN, runReducer, type RunAction, type RunState } from './run';
import type { AgentContextInfo, AgentStatus, ChatTurn } from './types';
import { streamRun } from './useAgentRun';

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  run?: RunState;
}

interface AnalystApi {
  open: boolean;
  setOpen: (v: boolean) => void;
  items: ChatItem[];
  running: boolean;
  status: AgentStatus | undefined;
  statusLoading: boolean;
  context: AgentContextInfo;
  setContext: (c: AgentContextInfo) => void;
  /** Open the panel and send a question (or just open it when `text` is omitted). */
  ask: (text?: string) => void;
  stop: () => void;
  clear: () => void;
}

const Ctx = createContext<AnalystApi | null>(null);
const MAX_HISTORY = 18; // messages sent back; the API accepts 20 including the new question
const MAX_CHARS = 4000;

let seq = 0;
const nextId = () => `m${++seq}`;

/** Text-only history: completed exchanges whose answer has text. Failed exchanges are dropped. */
export function buildHistory(items: ChatItem[], question: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (let i = 0; i + 1 < items.length; i++) {
    const q = items[i];
    const a = items[i + 1];
    if (q.role === 'user' && a.role === 'assistant' && a.run?.text.trim()) {
      turns.push({ role: 'user', content: q.content.slice(0, MAX_CHARS) });
      turns.push({ role: 'assistant', content: a.run.text.slice(0, MAX_CHARS) });
      i++;
    }
  }
  return [...turns.slice(-MAX_HISTORY), { role: 'user', content: question.slice(0, MAX_CHARS) }];
}

export function AnalystProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [context, setContext] = useState<AgentContextInfo>({});
  const ctrl = useRef<AbortController | null>(null);
  const status = useAgentStatus();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const contextRef = useRef(context);
  contextRef.current = context;

  const running = items.some((i) => i.run?.status === 'running');

  const send = useCallback((text: string) => {
    const question = text.trim();
    if (!question) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const history = buildHistory(itemsRef.current, question);
    const answerId = nextId();
    setItems((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content: question },
      { id: answerId, role: 'assistant', content: '', run: IDLE_RUN },
    ]);
    const dispatch = (a: RunAction) =>
      setItems((prev) => prev.map((it) => (it.id === answerId ? { ...it, run: runReducer(it.run ?? IDLE_RUN, a) } : it)));
    void streamRun('/agent/chat', { messages: history, context: contextRef.current }, dispatch, c.signal);
  }, []);

  const ask = useCallback(
    (text?: string) => {
      setOpen(true);
      if (text) send(text);
    },
    [send],
  );
  const stop = useCallback(() => ctrl.current?.abort(), []);
  const clear = useCallback(() => {
    ctrl.current?.abort();
    setItems([]);
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);

  const value = useMemo<AnalystApi>(
    () => ({
      open,
      setOpen,
      items,
      running,
      status: status.data,
      statusLoading: status.isLoading,
      context,
      setContext,
      ask,
      stop,
      clear,
    }),
    [open, items, running, status.data, status.isLoading, context, ask, stop, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalyst(): AnalystApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAnalyst must be used inside <AnalystProvider>');
  return v;
}

/** Pages call this so the analyst knows what the user is looking at. */
export function useAnalystPageContext(info: AgentContextInfo): void {
  const { setContext } = useAnalyst();
  const key = JSON.stringify(info);
  useEffect(() => {
    setContext(JSON.parse(key) as AgentContextInfo);
  }, [key, setContext]);
}
