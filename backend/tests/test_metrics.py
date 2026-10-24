"""Metric functions checked against hand-computed numbers."""

import math

import pytest

from app.metrics import (
    bias,
    group_by,
    histogram,
    mae,
    mape_pct,
    max_abs,
    quantile,
    r2,
    rmse,
)

ERRORS = [1.0, -2.0, 3.0, -4.0]


def test_mae():
    assert mae(ERRORS) == pytest.approx(2.5)


def test_bias_is_signed_mean():
    assert bias(ERRORS) == pytest.approx(-0.5)


def test_rmse():
    assert rmse(ERRORS) == pytest.approx(math.sqrt(30 / 4))


def test_max_abs():
    assert max_abs(ERRORS) == 4.0


def test_empty_inputs_return_none():
    for fn in (mae, bias, rmse, max_abs):
        assert fn([]) is None
    assert quantile([], 0.5) is None


class TestQuantile:
    # Linear interpolation between closest ranks (numpy default / Hyndman-Fan type 7).
    def test_interpolates(self):
        assert quantile([4.0, 1.0, 3.0, 2.0], 0.1) == pytest.approx(1.3)
        assert quantile([4.0, 1.0, 3.0, 2.0], 0.9) == pytest.approx(3.7)

    def test_median_even(self):
        assert quantile([1.0, 2.0, 3.0, 4.0], 0.5) == pytest.approx(2.5)

    def test_extremes(self):
        assert quantile([5.0, 1.0, 9.0], 0.0) == 1.0
        assert quantile([5.0, 1.0, 9.0], 1.0) == 9.0

    def test_single_value(self):
        assert quantile([7.0], 0.9) == 7.0


def test_histogram_500mw_bins_are_contiguous_and_left_closed():
    bins = histogram([-600.0, -1.0, 0.0, 499.0, 500.0, 1250.0], width=500)
    assert bins == [
        (-1000, -500, 1),
        (-500, 0, 1),
        (0, 500, 2),
        (500, 1000, 1),
        (1000, 1500, 1),
    ]


def test_histogram_fills_empty_bins():
    assert histogram([0.0, 1600.0], width=500) == [(0, 500, 1), (500, 1000, 0), (1000, 1500, 0), (1500, 2000, 1)]


def test_histogram_empty():
    assert histogram([], width=500) == []


def test_r2():
    assert r2(forecasts=[1.0, 2.0, 4.0], actuals=[1.0, 2.0, 3.0]) == pytest.approx(0.5)


def test_r2_constant_actuals_is_none():
    assert r2(forecasts=[1.0, 2.0], actuals=[3.0, 3.0]) is None


def test_mape_skips_zero_actuals():
    assert mape_pct(forecasts=[110.0, 5.0, 90.0], actuals=[100.0, 0.0, 100.0]) == pytest.approx(10.0)


def test_group_by_preserves_insertion_order_of_items():
    assert group_by([1, 2, 3, 4, 5], key=lambda x: x % 2) == {1: [1, 3, 5], 0: [2, 4]}
