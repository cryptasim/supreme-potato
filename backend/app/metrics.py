"""Error statistics (pure, stdlib only - no numpy at runtime to keep the serverless bundle small).

Conventions: callers pass ``error = forecast - actual`` to the error helpers. All results are
unrounded; rounding for display happens when responses are built.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Hashable, Iterable, Sequence
from typing import TypeVar

T = TypeVar("T")
K = TypeVar("K", bound=Hashable)


def mae(errors: Sequence[float]) -> float | None:
    return sum(abs(e) for e in errors) / len(errors) if errors else None


def bias(errors: Sequence[float]) -> float | None:
    """Mean signed error; positive = over-forecast."""
    return sum(errors) / len(errors) if errors else None


def rmse(errors: Sequence[float]) -> float | None:
    return math.sqrt(sum(e * e for e in errors) / len(errors)) if errors else None


def max_abs(errors: Sequence[float]) -> float | None:
    return max(abs(e) for e in errors) if errors else None


def quantile(values: Sequence[float], q: float) -> float | None:
    """Sample quantile by linear interpolation between closest ranks.

    Same as numpy's default ("linear", Hyndman & Fan type 7): sort the n values, take the fractional
    rank h = (n - 1) * q and interpolate between x[floor(h)] and x[ceil(h)].
    """
    if not values:
        return None
    xs = sorted(values)
    h = (len(xs) - 1) * q
    lo = math.floor(h)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (h - lo) * (xs[hi] - xs[lo])


def histogram(values: Iterable[float], width: int) -> list[tuple[int, int, int]]:
    """Fixed-width bins aligned to multiples of ``width``, left-closed [start, end).

    Returns contiguous (bin_start, bin_end, count) from the lowest to the highest occupied bin, so
    empty bins in the middle show as zero rather than vanishing from the chart.
    """
    counts: dict[int, int] = {}
    for v in values:
        b = math.floor(v / width)
        counts[b] = counts.get(b, 0) + 1
    if not counts:
        return []
    return [(b * width, (b + 1) * width, counts.get(b, 0)) for b in range(min(counts), max(counts) + 1)]


def r2(forecasts: Sequence[float], actuals: Sequence[float]) -> float | None:
    """Coefficient of determination of the forecast as a predictor of the actual (1 - SS_res/SS_tot)."""
    if not actuals:
        return None
    mean_a = sum(actuals) / len(actuals)
    ss_tot = sum((a - mean_a) ** 2 for a in actuals)
    if ss_tot == 0:
        return None
    ss_res = sum((f - a) ** 2 for f, a in zip(forecasts, actuals, strict=True))
    return 1 - ss_res / ss_tot


def mape_pct(forecasts: Sequence[float], actuals: Sequence[float]) -> float | None:
    """Mean absolute percentage error; hours with zero actual are skipped (undefined ratio)."""
    ratios = [abs(f - a) / abs(a) for f, a in zip(forecasts, actuals, strict=True) if a != 0]
    return 100 * sum(ratios) / len(ratios) if ratios else None


def group_by(items: Iterable[T], key: Callable[[T], K]) -> dict[K, list[T]]:
    groups: dict[K, list[T]] = {}
    for item in items:
        groups.setdefault(key(item), []).append(item)
    return groups
