/** Mirrors the server-sent events of backend/app/agent/runner.py and the briefing schema. */

export type RiskLevel = 'low' | 'elevated' | 'high';

export interface Briefing {
  headline: string;
  risk_level: RiskLevel;
  forecast_gwh: number;
  reliable_wind_gwh: number;
  recommended_extra_gwh: number;
  recommendation: string;
  drivers: string[];
  watch_items: string[];
  confidence_note: string;
  hindsight: string | null;
}

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
}

export type AgentEvent =
  | { type: 'start'; run_id: string; model: string; kind: 'chat' | 'briefing' }
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; id: string; name: string; label: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      ok: boolean;
      duration_ms: number;
      output: Record<string, unknown>;
    }
  | { type: 'briefing'; briefing: Briefing }
  | {
      type: 'done';
      stop_reason: string | null;
      turns: number;
      tool_calls: number;
      usage: AgentUsage;
      elapsed_ms: number;
      model: string;
    }
  | { type: 'error'; message: string; retryable: boolean };

export interface AgentStatus {
  enabled: boolean;
  model: string;
  reason: string | null;
}

export type AgentPage = 'decision' | 'accuracy' | 'methodology';

export interface AgentContextInfo {
  page?: AgentPage;
  delivery_date?: string;
  cutoff?: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
