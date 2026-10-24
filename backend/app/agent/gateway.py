"""The single seam between the agent loop and the Anthropic API.

``stream_turn`` is a generator: it yields ``("text" | "reasoning", delta)`` while the model
streams, and returns a ``Turn`` (via ``StopIteration.value``) once the message is complete, so the
runner can write ``turn = yield from gateway.stream_turn(...)``. Tests swap in a scripted gateway
with the same shape; nothing else in the app imports the SDK.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from dataclasses import dataclass, field
from typing import Any, Protocol

DEFAULT_MODEL = "claude-opus-5-5"
MAX_TOKENS = 16000
JSON_RETRIES = 2

Delta = tuple[str, str]


@dataclass
class ToolUse:
    id: str
    name: str
    input: Any


@dataclass
class Turn:
    content: list[Any]  # assistant content blocks, appended back unchanged
    tool_uses: list[ToolUse]
    stop_reason: str | None
    usage: dict[str, int] = field(default_factory=dict)
    model: str | None = None


class GatewayError(Exception):
    """An upstream failure the user should see, with a hint whether retrying could help."""

    def __init__(self, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class ModelGateway(Protocol):
    model: str

    def stream_turn(self, *, system: str, tools: list[dict], messages: list[dict]) -> Generator[Delta, None, Turn]: ...


class AnthropicGateway:
    """Streams one assistant turn from Claude with adaptive thinking and server-side refusal fallback."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        effort: str | None = None,
        http_client: Any = None,  # tests pass a client with a mock transport
    ) -> None:
        import anthropic  # imported lazily so the read-only API never pays for it

        self._anthropic = anthropic
        # One retry and a 60 s timeout keep a single stuck turn inside the run deadline and the
        # 120 s function limit; the stream read timeout applies between chunks, not to the whole turn.
        self._client = anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=60.0, http_client=http_client)
        self.model = model or os.environ.get("AGENT_MODEL", DEFAULT_MODEL)
        self.effort = effort or os.environ.get("AGENT_EFFORT", "medium")
        self.use_fallbacks = os.environ.get("AGENT_FALLBACKS", "on") != "off"

    def _params(self, system: str, tools: list[dict], messages: list[dict]) -> dict:
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            # Static prefix (tools + system) is cached; the conversation varies after it.
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "tools": tools,
            "messages": messages,
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {"effort": self.effort},
        }
        if self.use_fallbacks:
            params["betas"] = ["server-side-fallback-2026-07-01"]
            params["fallbacks"] = "default"
        return params

    def stream_turn(self, *, system: str, tools: list[dict], messages: list[dict]) -> Generator[Delta, None, Turn]:
        a = self._anthropic
        params = self._params(system, tools, messages)
        for attempt in range(JSON_RETRIES + 1):
            try:
                with self._client.beta.messages.stream(**params) as stream:
                    for event in stream:
                        if event.type == "content_block_delta":
                            if event.delta.type == "text_delta":
                                yield ("text", event.delta.text)
                            elif event.delta.type == "thinking_delta" and event.delta.thinking:
                                yield ("reasoning", event.delta.thinking)
                    msg = stream.get_final_message()
                break
            except ValueError:
                # Tool-input JSON the SDK could not parse at all (eager input streaming). There is no
                # tool_use id to answer, so re-issue the turn; API errors are not ValueError.
                if attempt == JSON_RETRIES:
                    raise GatewayError("The model produced an unreadable tool call. Please retry.", True) from None
            except a.AuthenticationError as exc:
                raise GatewayError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", False) from exc
            except a.PermissionDeniedError as exc:
                raise GatewayError("The API key is not allowed to use this model.", False) from exc
            except a.RateLimitError as exc:
                raise GatewayError("The model is rate limited right now. Try again in a minute.", True) from exc
            except a.BadRequestError as exc:
                raise GatewayError(f"The model rejected the request: {exc.message}", False) from exc
            except a.APIStatusError as exc:
                raise GatewayError(f"Model service error ({exc.status_code}). Try again shortly.", True) from exc
            except a.APIConnectionError as exc:
                raise GatewayError("Could not reach the model service.", True) from exc

        usage = msg.usage
        return Turn(
            content=list(msg.content),
            tool_uses=[ToolUse(b.id, b.name, b.input) for b in msg.content if b.type == "tool_use"],
            stop_reason=msg.stop_reason,
            usage={
                "input_tokens": usage.input_tokens or 0,
                "output_tokens": usage.output_tokens or 0,
                "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            },
            model=msg.model,
        )


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY")) and os.environ.get("AGENT_DISABLED") != "1"


def model_name() -> str:
    return os.environ.get("AGENT_MODEL", DEFAULT_MODEL)
