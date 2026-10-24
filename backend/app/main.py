"""FastAPI app: thin HTTP layer over app.service. All routes live under /api."""

from __future__ import annotations

import hmac
import json
import os
from collections.abc import Iterator
from datetime import date, timedelta
from functools import lru_cache

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app import data_store, service
from app import schemas as s
from app.agent import gateway as agent_gateway
from app.agent import guard, prompts
from app.agent.runner import Limits, run_agent
from app.data_store import DEFAULT_CUTOFF, DELIVERY_FROM, DELIVERY_TO
from app.selection import ActualMode

CUTOFF_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"  # HH:MM, 00:00..23:59

app = FastAPI(
    title="GB Wind Forecast Decision Support",
    description="Day-ahead wind forecast vs outturn (Elexon BMRS WINDFOR / FUELHH), January 2026.",
    version="1.0.0",
)
# Read-only public data: any origin may read it. Cross-origin POST (refresh) is not allowed; the
# refresh endpoint is for operators (curl) and is additionally guarded by a shared token.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

CutoffQuery = Query(None, pattern=CUTOFF_PATTERN, description="Decision cut-off on D-1, HH:MM UTC")
HorizonQuery = Query(None, ge=0, le=48, description="Minimum forecast lead time in hours")
ActualModeQuery = Query("point", description="'point' = half-hour at startTime, 'hourly_mean' = mean of both")


def _in_window(d: date, name: str) -> date:
    if not DELIVERY_FROM <= d <= DELIVERY_TO:
        raise HTTPException(422, f"{name} must be a delivery date between {DELIVERY_FROM} and {DELIVERY_TO}")
    return d


@app.get("/api/health", response_model=s.Health)
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", response_model=s.Meta)
def meta() -> dict:
    return service.meta(data_store.get_store())


@app.get("/api/decision", response_model=s.Decision)
def decision(
    delivery_date: date = Query(..., description="Delivery day D (YYYY-MM-DD)"),
    cutoff: str = Query(DEFAULT_CUTOFF, pattern=CUTOFF_PATTERN, description="Decision cut-off on D-1, HH:MM UTC"),
    actual_mode: ActualMode = ActualModeQuery,
) -> dict:
    _in_window(delivery_date, "delivery_date")
    return service.decision(data_store.get_store(), delivery_date, cutoff, actual_mode)


@app.get("/api/series", response_model=s.Series)
def series(
    start: date = Query(DELIVERY_FROM, description="First delivery date (inclusive), clamped to window"),
    end: date = Query(DELIVERY_TO, description="Last delivery date (inclusive), clamped to window"),
    cutoff: str | None = CutoffQuery,
    horizon_h: int | None = HorizonQuery,
    actual_mode: ActualMode = ActualModeQuery,
) -> dict:
    if start > end:
        raise HTTPException(422, "start must be on or before end")
    start, end = max(start, DELIVERY_FROM), min(end, DELIVERY_TO)
    if start > end:  # range lies entirely outside the window
        raise HTTPException(422, f"range does not overlap the delivery window {DELIVERY_FROM}..{DELIVERY_TO}")
    mode = service.resolve_mode(cutoff, horizon_h)
    return service.series(data_store.get_store(), start, end, mode, actual_mode)


@app.get("/api/accuracy", response_model=s.Accuracy)
def accuracy(
    cutoff: str | None = CutoffQuery,
    horizon_h: int | None = HorizonQuery,
    actual_mode: ActualMode = ActualModeQuery,
) -> dict:
    mode = service.resolve_mode(cutoff, horizon_h)
    return service.accuracy(data_store.get_store(), mode, actual_mode)


@app.get("/api/horizon-curve", response_model=list[s.HorizonCurvePoint])
def horizon_curve(actual_mode: ActualMode = ActualModeQuery) -> list[dict]:
    return service.horizon_curve(data_store.get_store(), actual_mode)


def _check_refresh_token(supplied: str | None) -> None:
    expected = os.environ.get("REFRESH_TOKEN")
    if not expected:
        raise HTTPException(403, "refresh disabled")
    if supplied is None or not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(403, "invalid or missing X-Refresh-Token")


@app.post("/api/refresh", response_model=s.Meta)
def refresh(x_refresh_token: str | None = Header(None)) -> dict:
    """Re-pull the window from Elexon into memory. On any failure the current data is kept.

    Requires header ``X-Refresh-Token`` equal to env ``REFRESH_TOKEN``; disabled (403) when unset.
    """
    _check_refresh_token(x_refresh_token)
    try:
        store = data_store.refresh_from_elexon()
    except Exception as exc:  # any upstream failure (network, HTTP, bad payload) maps to 502
        raise HTTPException(502, f"Refresh from Elexon failed: {exc}") from exc
    service.clear_caches()
    return service.meta(store)


# ---------------------------------------------------------------- analyst agent


@lru_cache(maxsize=1)
def _anthropic_gateway() -> agent_gateway.ModelGateway:
    return agent_gateway.AnthropicGateway()


def get_gateway() -> agent_gateway.ModelGateway:
    """Dependency so tests can swap in a scripted model; 503 when no API key is configured."""
    if not agent_gateway.configured():
        raise HTTPException(503, "The analyst is not configured on this deployment (ANTHROPIC_API_KEY unset).")
    return _anthropic_gateway()


def _agent_limits() -> Limits:
    return Limits(deadline_s=float(os.environ.get("AGENT_DEADLINE_S", "100")))


def _rate_limit(request: Request) -> None:
    reason = guard.limiter.check(guard.client_key(request.headers, request.client.host if request.client else None))
    if reason:
        raise HTTPException(429, reason)


def _sse(events: Iterator[dict]) -> StreamingResponse:
    def body() -> Iterator[str]:
        for event in events:
            yield f"data: {json.dumps(event, separators=(',', ':'), default=str)}\n\n"

    # X-Accel-Buffering stops nginx buffering the stream; no-transform stops proxies re-encoding it.
    headers = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}
    return StreamingResponse(body(), media_type="text/event-stream", headers=headers)


@app.get("/api/agent/status", response_model=s.AgentStatus)
def agent_status() -> dict:
    enabled = agent_gateway.configured()
    return {
        "enabled": enabled,
        "model": agent_gateway.model_name(),
        "reason": None if enabled else "ANTHROPIC_API_KEY is not set on this deployment.",
    }


@app.post("/api/agent/chat")
def agent_chat(
    req: s.ChatRequest,
    request: Request,
    gateway: agent_gateway.ModelGateway = Depends(get_gateway),
) -> StreamingResponse:
    """Stream an analyst answer as server-sent events (see app/agent/runner.py for event types)."""
    _rate_limit(request)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    ctx = req.context
    note = prompts.ui_context(ctx.page, ctx.delivery_date, ctx.cutoff) if ctx else None
    if note:
        messages[-1] = {"role": "user", "content": f"{note}\n\n{messages[-1]['content']}"}
    return _sse(run_agent(gateway, data_store.get_store(), messages, kind="chat", limits=_agent_limits()))


@app.post("/api/agent/briefing")
def agent_briefing(
    req: s.BriefingRequest,
    request: Request,
    gateway: agent_gateway.ModelGateway = Depends(get_gateway),
) -> StreamingResponse:
    """Research a delivery day with the tools, then stream a validated structured briefing."""
    _in_window(req.delivery_date, "delivery_date")
    _rate_limit(request)
    task = prompts.briefing_task(req.delivery_date, req.cutoff, req.delivery_date - timedelta(days=1))
    messages = [{"role": "user", "content": task}]
    return _sse(run_agent(gateway, data_store.get_store(), messages, kind="briefing", limits=_agent_limits()))
