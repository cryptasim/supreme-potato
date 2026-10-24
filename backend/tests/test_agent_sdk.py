"""The real AnthropicGateway against a mocked HTTP transport.

Replays Anthropic-format server-sent events, so the SDK's own stream parsing, tool-input
accumulation and request serialisation (including echoing typed content blocks back on the next
turn) are exercised end to end without network access.
"""

from __future__ import annotations

import json

import anthropic
import httpx2
import pytest

from app import data_store
from app.agent.gateway import AnthropicGateway, GatewayError
from app.agent.runner import run_agent


def sse(*events: dict) -> bytes:
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def message(*blocks: list[dict], stop_reason: str) -> bytes:
    events = [
        {
            "type": "message_start",
            "message": {
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": [],
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 120, "output_tokens": 1},
            },
        },
    ]
    for i, (start, deltas) in enumerate(blocks):
        events.append({"type": "content_block_start", "index": i, "content_block": start})
        events += [{"type": "content_block_delta", "index": i, "delta": d} for d in deltas]
        events.append({"type": "content_block_stop", "index": i})
    events += [
        {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": {"output_tokens": 42},
        },
        {"type": "message_stop"},
    ]
    return sse(*events)


TOOL_TURN = message(
    (
        {"type": "thinking", "thinking": "", "signature": ""},
        [
            {"type": "thinking_delta", "thinking": "Need the decision view."},
            {"type": "signature_delta", "signature": "sig"},
        ],
    ),
    (
        {"type": "tool_use", "id": "toolu_1", "name": "get_decision_view", "input": {}},
        [
            {"type": "input_json_delta", "partial_json": '{"delivery_'},
            {"type": "input_json_delta", "partial_json": 'date": "2026-01-15"}'},
        ],
    ),
    stop_reason="tool_use",
)
TEXT_TURN = message(
    (
        {"type": "text", "text": ""},
        [{"type": "text_delta", "text": "Hold "}, {"type": "text_delta", "text": "99.7 GWh."}],
    ),
    stop_reason="end_turn",
)


def gateway_with(responses: list[httpx2.Response], seen: list[httpx2.Request]) -> AnthropicGateway:
    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return responses.pop(0)

    http = anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler))
    return AnthropicGateway(api_key="sk-test", http_client=http)


def stream_response(body: bytes) -> httpx2.Response:
    return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=body)


def test_full_loop_through_the_sdk():
    seen: list[httpx2.Request] = []
    gw = gateway_with([stream_response(TOOL_TURN), stream_response(TEXT_TURN)], seen)
    events = list(run_agent(gw, data_store.get_store(), [{"role": "user", "content": "15 Jan?"}]))

    kinds = [e["type"] for e in events]
    assert kinds == ["start", "reasoning", "tool_call", "tool_result", "text", "text", "done"]
    call = events[2]
    assert call["input"] == {"delivery_date": "2026-01-15"} and call["label"] == "Decision view for 15 Jan at 09:00"
    assert events[3]["ok"] is True
    assert "".join(e["delta"] for e in events if e["type"] == "text") == "Hold 99.7 GWh."
    assert events[-1]["usage"]["output_tokens"] == 84 and events[-1]["model"] == "claude-opus-5-5"

    first = json.loads(seen[0].content)
    assert seen[0].headers["anthropic-beta"] == "server-side-fallback-2026-07-01"
    assert first["fallbacks"] == "default" and first["stream"] is True
    assert first["thinking"] == {"type": "adaptive", "display": "summarized"}
    assert {t["name"] for t in first["tools"]} >= {"get_decision_view", "get_trailing_performance"}

    # Turn 2 echoes the assistant blocks unchanged (thinking with signature, tool_use) and answers the call.
    second = json.loads(seen[1].content)["messages"]
    assert [m["role"] for m in second] == ["user", "assistant", "user"]
    thinking, tool_use = second[1]["content"]
    assert thinking["type"] == "thinking" and thinking["signature"] == "sig"
    assert tool_use == {
        "type": "tool_use",
        "id": "toolu_1",
        "name": "get_decision_view",
        "input": {"delivery_date": "2026-01-15"},
    }
    result = second[2]["content"][0]
    assert result["tool_use_id"] == "toolu_1"
    assert json.loads(result["content"])["energy_gwh"]["extra_to_procure"] == 99.7


@pytest.mark.parametrize(
    ("status", "retryable", "fragment"),
    [(401, False, "API key was rejected"), (400, False, "rejected the request"), (529, True, "service error")],
)
def test_api_errors_map_to_gateway_errors(status, retryable, fragment):
    body = {"type": "error", "error": {"type": "x", "message": "nope"}}
    responses = [httpx2.Response(status, json=body) for _ in range(3)]  # SDK retries 5xx twice
    gw = gateway_with(responses, [])
    with pytest.raises(GatewayError) as exc:
        list(gw.stream_turn(system="s", tools=[], messages=[{"role": "user", "content": "x"}]))
    assert exc.value.retryable is retryable and fragment in str(exc.value)
