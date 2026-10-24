"""Retry / deadline behaviour of the Elexon client (no network: httpx.get is stubbed)."""

import time

import httpx
import pytest

from app import elexon


@pytest.fixture
def calls(monkeypatch):
    seen: list[float] = []

    def fake_get(*_args, timeout, **_kwargs):
        seen.append(timeout.read)
        raise httpx.ConnectError("down")

    monkeypatch.setattr(elexon.httpx, "get", fake_get)
    monkeypatch.setattr(elexon.time, "sleep", lambda _s: None)
    return seen


def test_retries_then_raises(calls):
    with pytest.raises(RuntimeError, match="FUELHH"):
        elexon.fetch_actuals("2026-01-02", "2026-02-01")
    assert calls == [elexon.TIMEOUT_S] * elexon.RETRIES


def test_deadline_caps_per_call_timeout(calls):
    deadline = time.monotonic() + 5.0
    with pytest.raises(RuntimeError):
        elexon.fetch_forecasts("2025-12-30T00:00:00Z", "2026-02-01T23:00:00Z", deadline)
    assert calls and all(t <= 5.0 for t in calls)


def test_expired_deadline_makes_no_call(calls):
    with pytest.raises(RuntimeError, match="deadline"):
        elexon.fetch_actuals("2026-01-02", "2026-02-01", time.monotonic())
    assert calls == []


def test_worst_case_budget_fits_vercel_max_duration():
    from app.data_store import REFRESH_DEADLINE_S

    assert REFRESH_DEADLINE_S <= 50  # vercel.json maxDuration is 60s
    assert elexon.DEADLINE_CALL_TIMEOUT_S < REFRESH_DEADLINE_S
