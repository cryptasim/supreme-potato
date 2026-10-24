import { API_BASE, ApiError } from '../api/client';
import type { AgentEvent } from './types';

/**
 * Incremental parser for the `data: {json}\n\n` frames the agent endpoints emit. Chunks can split a
 * frame anywhere (even mid-UTF-8 sequence, handled by the TextDecoder in `postStream`), so the
 * parser buffers until it sees a blank line. Unknown or malformed frames are skipped, not fatal.
 */
export class SseParser {
  private buffer = '';

  push(chunk: string): AgentEvent[] {
    // Normalise the whole buffer, not just the chunk: a CRLF can straddle two chunks.
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n');
    const events: AgentEvent[] = [];
    let sep = this.buffer.indexOf('\n\n');
    while (sep !== -1) {
      const frame = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) {
        try {
          const parsed = JSON.parse(data) as AgentEvent;
          if (parsed && typeof parsed.type === 'string') events.push(parsed);
        } catch {
          /* ignore a malformed frame */
        }
      }
      sep = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

/** POST a JSON body and feed each streamed event to `onEvent`. Resolves when the stream ends. */
export async function postStream(
  path: string,
  body: unknown,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`.trim();
    try {
      const j = await res.json();
      if (typeof j?.detail === 'string') detail = j.detail;
      else if (Array.isArray(j?.detail) && j.detail[0]?.msg) detail = j.detail[0].msg;
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, res.status);
  }
  const parser = new SseParser();
  if (!res.body) {
    // No streaming support in this environment: parse the whole body at once.
    parser.push(await res.text()).forEach(onEvent);
    parser.push('\n\n').forEach(onEvent);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach(onEvent);
  }
  parser.push(decoder.decode() + '\n\n').forEach(onEvent);
}
