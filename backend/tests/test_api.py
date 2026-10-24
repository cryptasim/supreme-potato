"""End-to-end API tests against the committed January-2026 snapshot."""

import gzip
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import data_store, service
from app.elexon import Actual, Forecast
from app.main import app
from app.selection import HOUR, Mode

SNAPSHOT = Path(__file__).resolve().parents[1] / "data" / "snapshot_jan2026.json.gz"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta(client):
    meta = client.get("/api/meta").json()
    assert meta["forecast_runs"] == 272
    assert meta["actual_points"] == 1488
    assert meta["forecast_points"] == 19856
    assert meta["forecast_run_times_utc"] == ["02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30"]
    assert (meta["delivery_from"], meta["delivery_to"]) == ("2026-01-02", "2026-02-01")
    assert (meta["decision_from"], meta["decision_to"]) == ("2026-01-01", "2026-01-31")
    assert meta["default_cutoff"] == "09:00"
    assert meta["snapshot_created_at"].endswith("Z")
    assert meta["data_mode"] == "snapshot"


class TestDecision:
    @pytest.fixture(scope="class")
    def body(self, client):
        resp = client.get("/api/decision", params={"delivery_date": "2026-01-15", "cutoff": "09:00"})
        assert resp.status_code == 200
        return resp.json()

    def test_run_used_and_timing(self, body):
        assert body["decision_time"] == "2026-01-14T09:00:00Z"
        assert body["forecast_run"] == "2026-01-14T07:30:00Z"
        assert body["forecast_age_minutes"] == 90
        assert body["next_run_after_cutoff"] == "2026-01-14T09:30:00Z"

    def test_24_complete_points(self, body):
        pts = body["points"]
        assert len(pts) == 24
        assert pts[0]["start_time"] == "2026-01-15T00:00:00Z"
        assert all(p["forecast"] is not None and p["actual"] is not None for p in pts)
        assert all(p["publish_time"] == "2026-01-14T07:30:00Z" for p in pts)
        assert pts[0]["horizon_h"] == 16.5

    def test_error_sign_and_band(self, body):
        q10, q90 = body["band"]["q10"], body["band"]["q90"]
        assert q10 < 0 < q90
        for p in body["points"]:
            assert p["error"] == pytest.approx(p["forecast"] - p["actual"], abs=0.11)
            assert p["p10"] == pytest.approx(max(0.0, p["forecast"] + q10), abs=0.11)
            assert p["p90"] == pytest.approx(max(0.0, p["forecast"] + q90), abs=0.11)

    def test_summary(self, body):
        s, pts = body["summary"], body["points"]
        assert s["n"] == 24
        assert s["forecast_hours"] == 24
        assert s["forecast_mwh"] == pytest.approx(sum(p["forecast"] for p in pts), abs=1)
        assert s["extra_to_procure_mwh"] == pytest.approx(sum(p["forecast"] - p["p10"] for p in pts), abs=1)
        assert s["p10_mwh"] == pytest.approx(s["forecast_mwh"] - s["extra_to_procure_mwh"], abs=1)

    def test_band_matches_accuracy_quantiles(self, client, body):
        acc = client.get("/api/accuracy", params={"cutoff": "09:00"}).json()
        assert body["band"]["q10"] == acc["quantiles"]["q10"]
        assert body["band"]["q90"] == acc["quantiles"]["q90"]


def test_decision_hourly_mean_mode(client):
    body = client.get("/api/decision", params={"delivery_date": "2026-02-01", "actual_mode": "hourly_mean"}).json()
    assert len(body["points"]) == 24
    assert body["summary"]["n"] == 24


@pytest.mark.parametrize(
    "params",
    [
        {"delivery_date": "2026-01-01"},
        {"delivery_date": "2026-02-02"},
        {"delivery_date": "not-a-date"},
        {"delivery_date": "2026-01-15", "cutoff": "9am"},
        {"delivery_date": "2026-01-15", "cutoff": "24:00"},
        {"delivery_date": "2026-01-15", "actual_mode": "median"},
        {},
    ],
)
def test_decision_bad_params_422(client, params):
    assert client.get("/api/decision", params=params).status_code == 422


class TestAccuracy:
    @pytest.fixture(scope="class")
    def body(self, client):
        return client.get("/api/accuracy", params={"cutoff": "09:00"}).json()

    def test_counts(self, body):
        assert body["mode"] == "cutoff" and body["cutoff"] == "09:00" and body["horizon_h"] is None
        assert body["n"] == 744
        assert sum(b["count"] for b in body["histogram"]) == 744
        assert sum(b["n"] for b in body["by_horizon"]) == 744
        assert sum(b["n"] for b in body["by_level"]) == 744
        assert [b["hour"] for b in body["by_hour"]] == list(range(24))
        assert all(b["n"] == 31 for b in body["by_hour"])
        assert len(body["by_day"]) == 31
        assert len(body["worst_hours"]) == 10

    def test_horizon_buckets_within_cutoff_leads(self, body):
        # At a 09:00 cut-off the 07:30 run is used: leads 16.5h..39.5h.
        hs = [b["horizon_h"] for b in body["by_horizon"]]
        assert min(hs) == 16 and max(hs) == 39

    def test_kpis_consistent(self, body):
        k = body["kpis"]
        assert k["rmse"] >= k["mae"] > 0
        assert k["nmae_pct"] == pytest.approx(k["mae"] / k["mean_actual"] * 100, abs=0.02)
        assert body["quantiles"]["q10"] <= body["quantiles"]["q50"] <= body["quantiles"]["q90"]
        worst = body["worst_hours"][0]
        assert abs(worst["error"]) == pytest.approx(k["max_abs_error"], abs=0.11)

    def test_matches_independent_brute_force_recomputation(self, body):
        """Recompute MAE/bias straight from the raw snapshot with a naive linear scan."""
        with gzip.open(SNAPSHOT, "rt") as fh:
            raw = json.load(fh)
        actual = dict(raw["actuals"])
        errors = []
        day = datetime(2026, 1, 2)
        while day <= datetime(2026, 2, 1):
            decision = (day - timedelta(days=1)).replace(hour=9).strftime("%Y-%m-%dT%H:%M:%SZ")
            for h in range(24):
                start = (day + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
                cands = [f for f in raw["forecasts"] if f[1] == start and f[0] <= decision and f[0] < start]
                if cands and start in actual:
                    errors.append(max(cands)[2] - actual[start])
            day += timedelta(days=1)
        assert len(errors) == 744
        assert body["kpis"]["mae"] == pytest.approx(sum(map(abs, errors)) / 744, abs=0.06)
        assert body["kpis"]["bias"] == pytest.approx(sum(errors) / 744, abs=0.06)


def test_accuracy_defaults_to_horizon_4(client):
    body = client.get("/api/accuracy").json()
    assert body["mode"] == "horizon" and body["horizon_h"] == 4 and body["cutoff"] is None


def test_accuracy_cutoff_wins_over_horizon(client):
    body = client.get("/api/accuracy", params={"cutoff": "09:00", "horizon_h": 4}).json()
    assert body["mode"] == "cutoff"


@pytest.mark.parametrize("params", [{"horizon_h": 49}, {"horizon_h": -1}, {"horizon_h": "x"}, {"cutoff": "9:00"}])
def test_accuracy_bad_params_422(client, params):
    assert client.get("/api/accuracy", params=params).status_code == 422


class TestSeries:
    def test_default_horizon_mode_one_day(self, client):
        body = client.get("/api/series", params={"start": "2026-01-15", "end": "2026-01-15"}).json()
        assert body["mode"] == "horizon" and body["horizon_h"] == 4 and body["cutoff"] is None
        assert len(body["points"]) == 24
        assert all(p["horizon_h"] >= 4 for p in body["points"] if p["forecast"] is not None)
        assert len(body["actuals"]) == 48
        assert body["actuals"][1]["start_time"] == "2026-01-15T00:30:00Z"

    def test_cutoff_wins(self, client):
        params = {"start": "2026-01-15", "end": "2026-01-15", "cutoff": "09:00", "horizon_h": 4}
        body = client.get("/api/series", params=params).json()
        assert body["mode"] == "cutoff" and body["cutoff"] == "09:00" and body["horizon_h"] is None
        assert {p["publish_time"] for p in body["points"]} == {"2026-01-14T07:30:00Z"}

    def test_dates_clamped_to_window(self, client):
        body = client.get("/api/series", params={"start": "2025-12-01", "end": "2026-03-01"}).json()
        assert len(body["points"]) == 744
        assert len(body["actuals"]) == 1488

    def test_start_after_end_422(self, client):
        assert client.get("/api/series", params={"start": "2026-01-20", "end": "2026-01-10"}).status_code == 422


def test_horizon_curve(client):
    body = client.get("/api/horizon-curve").json()
    assert len(body) == 49
    assert [r["horizon_h"] for r in body] == list(range(49))
    assert all(r["n"] > 0 for r in body)
    # Fresher forecasts should be (much) better than 2-day-old ones.
    assert body[0]["mae"] < body[48]["mae"]


def test_horizon_mode_never_selects_stale_runs():
    """Regression: for every H the selected run is the latest one with lead >= H, so lead - H is below
    the largest gap between consecutive runs. A truncated publish window (e.g. ending at midnight of the
    last delivery day) breaks this for that day's hours."""
    store = data_store.get_store()
    pt = store.publish_times
    max_gap_h = max(b - a for a, b in zip(pt, pt[1:], strict=False)) / HOUR
    assert max_gap_h <= 4.5  # hourly-ish schedule: runs ~2-4h apart
    for h in range(49):
        rows = [r for r in service.window_rows(store, Mode.for_horizon(h), "point") if r.publish_ts is not None]
        assert rows
        worst = max(r.horizon_h - h for r in rows)
        assert 0 <= worst < max_gap_h, (h, worst)


def test_level_buckets_labelled_from_bucket_size(client):
    body = client.get("/api/accuracy", params={"cutoff": "09:00"}).json()
    gw = service.LEVEL_BUCKET_MW / 1000
    assert body["by_level"][0]["bucket"] == f"0-{gw:g} GW"


def test_cors_allows_any_origin(client):
    resp = client.get("/api/health", headers={"Origin": "https://example.com"})
    assert resp.headers["access-control-allow-origin"] == "*"


def test_cors_preflight_rejects_post(client):
    headers = {"Origin": "https://example.com", "Access-Control-Request-Method": "POST"}
    assert client.options("/api/refresh", headers=headers).status_code == 400


TOKEN = "s3cret-test-token"


def test_refresh_disabled_without_env_token(client, monkeypatch):
    monkeypatch.delenv("REFRESH_TOKEN", raising=False)
    resp = client.post("/api/refresh", headers={"X-Refresh-Token": "anything"})
    assert resp.status_code == 403
    assert resp.json()["detail"] == "refresh disabled"


@pytest.mark.parametrize("headers", [{}, {"X-Refresh-Token": "wrong"}])
def test_refresh_rejects_missing_or_wrong_token(client, monkeypatch, headers):
    monkeypatch.setenv("REFRESH_TOKEN", TOKEN)

    def must_not_be_called(*_args, **_kwargs):
        raise AssertionError("fetch must not run without a valid token")

    monkeypatch.setattr(data_store, "fetch_actuals", must_not_be_called)
    assert client.post("/api/refresh", headers=headers).status_code == 403


def test_refresh_failure_returns_502_and_keeps_snapshot(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("Elexon unavailable")

    monkeypatch.setenv("REFRESH_TOKEN", TOKEN)
    monkeypatch.setattr(data_store, "fetch_actuals", boom)
    resp = client.post("/api/refresh", headers={"X-Refresh-Token": TOKEN})
    assert resp.status_code == 502
    assert "Elexon unavailable" in resp.json()["detail"]
    assert client.get("/api/meta").json()["data_mode"] == "snapshot"


def test_refresh_success_swaps_data_and_invalidates_cache(client, monkeypatch):
    # Restore the snapshot store after this test so other tests are unaffected.
    monkeypatch.setenv("REFRESH_TOKEN", TOKEN)
    monkeypatch.setattr(data_store, "_current", data_store.get_store())
    monkeypatch.setattr(
        data_store,
        "fetch_actuals",
        lambda *_: [Actual("2026-01-15T12:00:00Z", 1000.0), Actual("2026-01-15T12:30:00Z", 1100.0)],
    )
    monkeypatch.setattr(
        data_store, "fetch_forecasts", lambda *_: [Forecast("2026-01-14T07:30:00Z", "2026-01-15T12:00:00Z", 1500.0)]
    )
    assert client.get("/api/accuracy", params={"cutoff": "09:00"}).json()["n"] == 744  # now cached
    assert service.accuracy.cache_info().currsize > 0

    resp = client.post("/api/refresh", headers={"X-Refresh-Token": TOKEN})
    assert resp.status_code == 200
    assert all(  # superseded dataset's payloads are dropped, not just orphaned
        fn.cache_info().currsize == 0
        for fn in (service.window_rows, service.decision, service.series, service.accuracy, service.horizon_curve)
    )
    assert resp.json()["data_mode"] == "live"
    assert resp.json()["forecast_points"] == 1

    after = client.get("/api/accuracy", params={"cutoff": "09:00"}).json()
    assert after["n"] == 1
    assert after["kpis"]["bias"] == 500.0
