"""The agentic loop: model turn -> validated tool calls -> results -> next turn, as an event stream.

Events are plain dicts with a ``type`` key, serialised as server-sent events by the HTTP layer:

    start        {run_id, model, kind}
    text         {delta}                       answer text as it streams
    reasoning    {delta}                       summarised model reasoning (shown collapsed in the UI)
    tool_call    {id, name, label, input}
    tool_result  {id, name, ok, duration_ms, output}
    briefing     {briefing}                    validated structured briefing (briefing runs only)
    done         {stop_reason, turns, tool_calls, usage, elapsed_ms, model}
    error        {message, retryable}

Guarantees: every tool_use gets exactly one tool_result in a single user message; tools never run
for a turn that was cut off (max_tokens) or refused; the loop is bounded by turns and wall time.
"""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.agent import tools as agent_tools
from app.agent.briefing import PUBLISH_TOOL, Briefing, publish_tool_schema
from app.agent.gateway import GatewayError, ModelGateway, Turn
from app.agent.prompts import SYSTEM_PROMPT
from app.data_store import DataStore

Event = dict[str, Any]


@dataclass(frozen=True)
class Limits:
    max_turns: int = 8
    deadline_s: float = 100.0


def run_agent(
    gateway: ModelGateway,
    store: DataStore,
    messages: list[dict],
    *,
    kind: str = "chat",
    limits: Limits = Limits(),  # noqa: B008  (frozen dataclass: safe default)
) -> Iterator[Event]:
    briefing_run = kind == "briefing"
    tools = agent_tools.tool_schemas() + ([publish_tool_schema()] if briefing_run else [])
    convo = list(messages)
    t0 = time.monotonic()
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
    turns = tool_calls = 0
    served_model = gateway.model
    stop_reason: str | None = None

    yield {"type": "start", "run_id": uuid.uuid4().hex[:12], "model": gateway.model, "kind": kind}

    def done() -> Event:
        return {
            "type": "done",
            "stop_reason": stop_reason,
            "turns": turns,
            "tool_calls": tool_calls,
            "usage": usage,
            "elapsed_ms": int((time.monotonic() - t0) * 1000),
            "model": served_model,
        }

    while True:
        if turns >= limits.max_turns:
            stop_reason = "turn_limit"
            yield {"type": "error", "message": "Stopped after the maximum number of steps.", "retryable": False}
            break
        if time.monotonic() - t0 > limits.deadline_s:
            stop_reason = "deadline"
            yield {"type": "error", "message": "Stopped: the analysis ran out of time.", "retryable": True}
            break

        turns += 1
        try:
            turn: Turn = yield from _relay(gateway.stream_turn(system=SYSTEM_PROMPT, tools=tools, messages=convo))
        except GatewayError as exc:
            stop_reason = "upstream_error"
            yield {"type": "error", "message": str(exc), "retryable": exc.retryable}
            break

        for k in usage:
            usage[k] += turn.usage.get(k, 0)
        served_model = turn.model or served_model
        stop_reason = turn.stop_reason

        if turn.stop_reason == "refusal":
            yield {"type": "error", "message": "The model declined this request.", "retryable": False}
            break
        if turn.stop_reason == "pause_turn":
            convo.append({"role": "assistant", "content": turn.content})
            continue
        if not turn.tool_uses:
            break  # final answer
        if turn.stop_reason == "max_tokens":
            yield {
                "type": "error",
                "message": "The response was cut off before a tool call finished.",
                "retryable": True,
            }
            break

        convo.append({"role": "assistant", "content": turn.content})
        results, published = [], None
        for use in turn.tool_uses:
            tool_calls += 1
            if use.name == PUBLISH_TOOL and briefing_run:
                result, published = _publish(use.input)
                yield {"type": "tool_call", "id": use.id, "name": use.name, "label": "Publish briefing", "input": {}}
                yield {
                    "type": "tool_result",
                    "id": use.id,
                    "name": use.name,
                    "ok": published is not None,
                    "duration_ms": 0,
                    "output": result,
                }
            else:
                outcome = agent_tools.execute(store, use.name, use.input)
                result = outcome.content
                yield {
                    "type": "tool_call",
                    "id": use.id,
                    "name": use.name,
                    "label": outcome.label,
                    "input": use.input if isinstance(use.input, dict) else {},
                }
                yield {
                    "type": "tool_result",
                    "id": use.id,
                    "name": use.name,
                    "ok": outcome.ok,
                    "duration_ms": outcome.duration_ms,
                    "output": result,
                }
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": use.id,
                    "content": json.dumps(result, separators=(",", ":")),
                    **({"is_error": True} if "error" in result else {}),
                }
            )

        if published is not None:
            yield {"type": "briefing", "briefing": published.model_dump()}
            stop_reason = "briefing_published"
            break  # the briefing is the deliverable; no need for another model turn
        convo.append({"role": "user", "content": results})

    yield done()


def _relay(gen):
    """Forward streamed deltas as events and hand back the gateway's final Turn."""
    turn = None
    try:
        while True:
            kind, delta = next(gen)
            yield {"type": kind, "delta": delta}
    except StopIteration as stop:
        turn = stop.value
    return turn


def _publish(raw: Any) -> tuple[dict, Briefing | None]:
    try:
        briefing = Briefing.model_validate(raw if isinstance(raw, dict) else {})
    except ValidationError as exc:
        errs = [f"{'.'.join(map(str, e['loc'])) or 'input'}: {e['msg']}" for e in exc.errors()]
        return {"error": "briefing failed validation; fix and call publish_briefing again", "details": errs}, None
    return {"published": True}, briefing
