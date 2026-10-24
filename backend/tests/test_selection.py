"""Forecast-selection rules on small hand-built fixtures (no snapshot, no I/O)."""

from datetime import date

import pytest

from app.selection import (
    Mode,
    actual_for_target,
    build_forecast_index,
    decision_time,
    format_ts,
    parse_ts,
    select_by_cutoff,
    select_by_horizon,
    select_forecast,
    target_grid,
)

T = parse_ts


def _index(*rows: tuple[str, str, float]):
    """rows = (publishTime, startTime, generation) as ISO strings."""
    return build_forecast_index((T(p), T(s), g) for p, s, g in rows)


TARGET = "2026-01-15T12:00:00Z"
# Three runs for the same target hour, deliberately given out of publish order.
FIXTURE = _index(
    ("2026-01-14T07:30:00Z", TARGET, 700.0),
    ("2026-01-14T02:30:00Z", TARGET, 200.0),
    ("2026-01-14T09:30:00Z", TARGET, 900.0),
)


def test_parse_and_format_roundtrip():
    assert format_ts(T("2026-01-15T00:30:00Z")) == "2026-01-15T00:30:00Z"
    assert T("2026-01-15T00:30:00+00:00") == T("2026-01-15T00:30:00Z")


class TestCutoffMode:
    def test_picks_latest_run_at_or_before_cutoff(self):
        sel = select_by_cutoff(FIXTURE, T(TARGET), T("2026-01-14T09:00:00Z"))
        assert sel is not None
        assert format_ts(sel.publish_ts) == "2026-01-14T07:30:00Z"
        assert sel.generation == 700.0
        assert sel.horizon_h == pytest.approx(28.5)

    def test_publish_time_equal_to_cutoff_is_eligible(self):
        sel = select_by_cutoff(FIXTURE, T(TARGET), T("2026-01-14T09:30:00Z"))
        assert sel is not None and sel.generation == 900.0

    def test_cutoff_before_any_run_returns_none(self):
        assert select_by_cutoff(FIXTURE, T(TARGET), T("2026-01-14T02:29:00Z")) is None

    def test_unknown_target_returns_none(self):
        assert select_by_cutoff(FIXTURE, T("2026-01-20T00:00:00Z"), T("2026-01-19T09:00:00Z")) is None

    def test_forecast_published_at_or_after_target_start_is_excluded(self):
        # Runs at/after the delivery hour itself have zero/negative horizon: they are nowcasts, not forecasts.
        idx = _index(
            ("2026-01-15T02:30:00Z", "2026-01-15T04:00:00Z", 1.0),
            ("2026-01-15T04:00:00Z", "2026-01-15T04:00:00Z", 2.0),  # publish == start
            ("2026-01-15T04:30:00Z", "2026-01-15T04:00:00Z", 3.0),  # negative horizon
        )
        sel = select_by_cutoff(idx, T("2026-01-15T04:00:00Z"), T("2026-01-15T09:00:00Z"))
        assert sel is not None and sel.generation == 1.0

    def test_only_negative_horizon_runs_returns_none(self):
        idx = _index(("2026-01-15T04:30:00Z", "2026-01-15T04:00:00Z", 3.0))
        assert select_by_cutoff(idx, T("2026-01-15T04:00:00Z"), T("2026-01-15T09:00:00Z")) is None


class TestHorizonMode:
    def test_lead_exactly_h_is_eligible(self):
        # 09:30 run has lead 26.5h on a 12:00 target.
        sel = select_by_horizon(FIXTURE, T(TARGET), 26.5)
        assert sel is not None and sel.generation == 900.0

    def test_lead_just_below_h_falls_back_to_older_run(self):
        sel = select_by_horizon(FIXTURE, T(TARGET), 27)
        assert sel is not None and sel.generation == 700.0  # 07:30 run, lead 28.5h

    def test_h_beyond_all_runs_returns_none(self):
        assert select_by_horizon(FIXTURE, T(TARGET), 48) is None

    def test_h_zero_still_requires_positive_lead(self):
        idx = _index(
            ("2026-01-15T02:30:00Z", "2026-01-15T04:00:00Z", 1.0),
            ("2026-01-15T04:00:00Z", "2026-01-15T04:00:00Z", 2.0),
        )
        sel = select_by_horizon(idx, T("2026-01-15T04:00:00Z"), 0)
        assert sel is not None and sel.generation == 1.0


class TestModeDispatch:
    def test_cutoff_mode_uses_decision_time_of_target_delivery_day(self):
        sel = select_forecast(FIXTURE, T(TARGET), Mode.for_cutoff("09:00"))
        assert sel is not None and sel.generation == 700.0

    def test_horizon_mode(self):
        sel = select_forecast(FIXTURE, T(TARGET), Mode.for_horizon(30))
        assert sel is not None and sel.generation == 200.0  # 02:30 run, lead 33.5h


def test_decision_time_is_previous_day_at_cutoff():
    assert format_ts(decision_time(date(2026, 1, 15), "09:00")) == "2026-01-14T09:00:00Z"
    assert format_ts(decision_time(date(2026, 1, 2), "23:59")) == "2026-01-01T23:59:00Z"


def test_target_grid_has_24_hourly_targets():
    grid = target_grid(date(2026, 1, 15))
    assert len(grid) == 24
    assert format_ts(grid[0]) == "2026-01-15T00:00:00Z"
    assert format_ts(grid[-1]) == "2026-01-15T23:00:00Z"
    assert all(b - a == 3600 for a, b in zip(grid, grid[1:], strict=False))


class TestActualAlignment:
    ACTUALS = {T("2026-01-15T04:00:00Z"): 100.0, T("2026-01-15T04:30:00Z"): 200.0, T("2026-01-15T05:00:00Z"): 50.0}

    def test_point_mode_uses_same_start_time(self):
        assert actual_for_target(self.ACTUALS, T("2026-01-15T04:00:00Z"), "point") == 100.0

    def test_hourly_mean_averages_both_half_hours(self):
        assert actual_for_target(self.ACTUALS, T("2026-01-15T04:00:00Z"), "hourly_mean") == 150.0

    def test_hourly_mean_with_missing_half_hour_is_none(self):
        # Averaging a single half-hour would silently mix resolutions; treat as missing instead.
        assert actual_for_target(self.ACTUALS, T("2026-01-15T05:00:00Z"), "hourly_mean") is None

    def test_missing_actual_is_none(self):
        assert actual_for_target(self.ACTUALS, T("2026-01-15T06:00:00Z"), "point") is None
