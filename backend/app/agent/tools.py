"""Tools the analyst agent can call. Each is a pure function of the in-memory store.

Design rules:
- Inputs are pydantic models. The model's tool input is validated before anything runs, and a
  validation failure goes back to the model as an ``is_error`` tool result so it can correct itself.
- Outputs are compact JSON (rounded, no per-half-hour dumps) to keep the context small.
- Decision-time tools never return actuals. Hindsight lives in ``get_outturn`` only, so the agent
  (and the reader) can always tell "what the desk knew at the cut-off" from "what happened".
- ``get_trailing_performance`` only uses hours whose outturn was already metered before the
  decision time: a walk-forward, out-of-sample view the January-wide band cannot give.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app import metrics as m
from app import service
from app.data_store import DEFAULT_CUTOFF, DELIVERY_FROM, DELIVERY_TO, DataStore
from app.selection import HOUR, Mode, decision_time, format_ts

CUTOFF_RE = r"^([01]\d|2[0-3]):[0-5]\d$"
HIGH_WIND_MW = 15000  # forecast level above which January errors were largest (see by_level)


def _gwh(mwh: float | None) -> float | None:
    return None if mwh is None else round(mwh / 1000, 1)


def _gw(mw: float | None) -> float | None:
    return None if mw is None else round(mw / 1000, 2)


class _Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _DateInput(_Input):
    delivery_date: date = Field(description="Delivery day D, YYYY-MM-DD, between 2026-01-02 and 2026-02-01")
    cutoff: str = Field(DEFAULT_CUTOFF, pattern=CUTOFF_RE, description="Decision cut-off on D-1, HH:MM UTC")

    @field_validator("delivery_date")
    @classmethod
    def _in_window(cls, d: date) -> date:
        if not DELIVERY_FROM <= d <= DELIVERY_TO:
            raise ValueError(f"delivery_date must be between {DELIVERY_FROM} and {DELIVERY_TO}")
        return d


class OverviewInput(_Input):
    pass


class DecisionViewInput(_DateInput):
    pass


class OutturnInput(_DateInput):
    pass


class AccuracyInput(_Input):
    cutoff: str | None = Field(None, pattern=CUTOFF_RE, description="Select by decision cut-off (HH:MM UTC)")
    horizon_h: int | None = Field(None, ge=0, le=48, description="Or select by minimum lead time in hours")

    def mode(self) -> Mode:
        """A cut-off wins; a lead time alone selects horizon mode; neither means the default cut-off."""
        if self.cutoff is None and self.horizon_h is not None:
            return Mode.for_horizon(self.horizon_h)
        return Mode.for_cutoff(self.cutoff or DEFAULT_CUTOFF)

    def describe(self) -> str:
        mode = self.mode()
        return f"lead ≥ {mode.horizon_h} h" if mode.kind == "horizon" else f"cut-off {mode.cutoff}"


class LeadTimeInput(_Input):
    pass


class TrailingInput(_DateInput):
    lookback_days: int = Field(7, ge=1, le=14, description="Days of already-metered history to use")


class CompareCutoffsInput(_Input):
    delivery_date: date
    cutoffs: list[str] = Field(min_length=2, max_length=6, description="Cut-offs to compare, HH:MM UTC")

    @field_validator("delivery_date")
    @classmethod
    def _in_window(cls, d: date) -> date:
        return _DateInput._in_window(d)

    @field_validator("cutoffs")
    @classmethod
    def _valid_cutoffs(cls, v: list[str]) -> list[str]:
        bad = [c for c in v if not re.match(CUTOFF_RE, c)]
        if bad:
            raise ValueError(f"cut-offs must be HH:MM, got {bad}")
        return sorted(set(v))


class RankDaysInput(_Input):
    cutoff: str = Field(DEFAULT_CUTOFF, pattern=CUTOFF_RE)
    order: Literal["worst", "best"] = "worst"
    n: int = Field(5, ge=1, le=31)


# ---------------------------------------------------------------- handlers


def overview(store: DataStore, _: OverviewInput) -> dict:
    meta = service.meta(store)
    acc = service.accuracy(store, Mode.for_cutoff(DEFAULT_CUTOFF), "point")
    return {
        "delivery_window": [meta["delivery_from"], meta["delivery_to"]],
        "decision_days": [meta["decision_from"], meta["decision_to"]],
        "default_cutoff_utc": meta["default_cutoff"],
        "forecast_run_schedule_utc": meta["forecast_run_times_utc"],
        "data": {"forecast_runs": meta["forecast_runs"], "actual_half_hours": meta["actual_points"]},
        "units": "MW for hourly power, GWh for daily energy; error = forecast - actual (positive = wind short)",
        "headline_at_default_cutoff": {
            "mae_gw": _gw(acc["kpis"]["mae"]),
            "bias_gw": _gw(acc["kpis"]["bias"]),
            "nmae_pct": acc["kpis"]["nmae_pct"],
            "hours": acc["n"],
        },
        "gates_utc": {"EPEX_GB_day_ahead": "09:20", "N2EX_day_ahead": "09:50"},
    }


def decision_view(store: DataStore, inp: DecisionViewInput) -> dict:
    d = service.decision(store, inp.delivery_date, inp.cutoff, "point")
    pts = d["points"]
    fc = [(p["start_time"][11:16], p["forecast"]) for p in pts if p["forecast"] is not None]
    peak = max(fc, key=lambda x: x[1]) if fc else None
    trough = min(fc, key=lambda x: x[1]) if fc else None
    s = d["summary"]
    return {
        "delivery_date": d["delivery_date"],
        "decision_time": d["decision_time"],
        "forecast_run_used": d["forecast_run"],
        "forecast_age_minutes": d["forecast_age_minutes"],
        "next_run_after_cutoff": d["next_run_after_cutoff"],
        "energy_gwh": {
            "forecast": _gwh(s["forecast_mwh"]),
            "reliable_p10": _gwh(s["p10_mwh"]),
            "extra_to_procure": _gwh(s["extra_to_procure_mwh"]),
        },
        "hours_with_forecast": s["forecast_hours"],
        "peak_hour": {"hour_utc": peak[0], "forecast_gw": _gw(peak[1])} if peak else None,
        "lowest_hour": {"hour_utc": trough[0], "forecast_gw": _gw(trough[1])} if trough else None,
        "high_wind_hours": sum(v >= HIGH_WIND_MW for _, v in fc),
        "high_wind_threshold_gw": HIGH_WIND_MW / 1000,
        "band_offsets_mw": d["band"],
        "band_note": "P10/P90 = forecast + January-wide quantiles of (actual - forecast); in-sample.",
        "hourly_gw": [
            {"h": p["start_time"][11:13], "f": _gw(p["forecast"]), "p10": _gw(p["p10"]), "p90": _gw(p["p90"])}
            for p in pts
        ],
    }


def outturn(store: DataStore, inp: OutturnInput) -> dict:
    d = service.decision(store, inp.delivery_date, inp.cutoff, "point")
    s = d["summary"]
    errs = [(p["start_time"][11:16], p["error"]) for p in d["points"] if p["error"] is not None]
    worst = sorted(errs, key=lambda x: abs(x[1]), reverse=True)[:3]
    below_p10 = sum(p["actual"] is not None and p["p10"] is not None and p["actual"] < p["p10"] for p in d["points"])
    return {
        "hindsight": True,
        "delivery_date": d["delivery_date"],
        "energy_gwh": {"forecast": _gwh(s["forecast_mwh"]), "actual": _gwh(s["actual_mwh"])},
        "mae_gw": _gw(s["mae"]),
        "bias_gw": _gw(s["bias"]),
        "max_abs_error_gw": _gw(s["max_abs_error"]),
        "hours_actual_below_p10": below_p10,
        "hours_compared": s["n"],
        "largest_misses": [{"hour_utc": h, "error_gw": _gw(e)} for h, e in worst],
    }


def accuracy(store: DataStore, inp: AccuracyInput) -> dict:
    a = service.accuracy(store, inp.mode(), "point")
    k = a["kpis"]
    by_hour = sorted(a["by_hour"], key=lambda r: r["mae"] or 0)
    return {
        "selection": {"mode": a["mode"], "cutoff": a["cutoff"], "horizon_h": a["horizon_h"]},
        "hours": a["n"],
        "kpis_gw": {
            "mae": _gw(k["mae"]),
            "rmse": _gw(k["rmse"]),
            "bias": _gw(k["bias"]),
            "p90_abs_error": _gw(k["p90_abs_error"]),
            "max_abs_error": _gw(k["max_abs_error"]),
            "mean_actual": _gw(k["mean_actual"]),
        },
        "nmae_pct": k["nmae_pct"],
        "r2": k["r2"],
        "shortfall_quantiles_gw": {q: _gw(a["quantiles"][q]) for q in ("q05", "q10", "q50", "q90", "q95")},
        "by_forecast_level": [
            {"level": r["bucket"], "mae_gw": _gw(r["mae"]), "bias_gw": _gw(r["bias"]), "hours": r["n"]}
            for r in a["by_level"]
        ],
        "calmest_hour_utc": by_hour[0]["hour"],
        "roughest_hour_utc": by_hour[-1]["hour"],
        "worst_hours": [
            {"start": w["start_time"][:16], "forecast_gw": _gw(w["forecast"]), "actual_gw": _gw(w["actual"])}
            for w in a["worst_hours"][:5]
        ],
    }


def lead_time_curve(store: DataStore, _: LeadTimeInput) -> dict:
    curve = service.horizon_curve(store, "point")
    keep = {0, 2, 4, 6, 8, 12, 16, 20, 24, 30, 36, 42, 48}
    return {
        "meaning": "Error of the latest forecast published at least H hours before each target hour",
        "points": [
            {
                "lead_h": p["horizon_h"],
                "mae_gw": _gw(p["mae"]),
                "bias_gw": _gw(p["bias"]),
                "p90_abs_gw": _gw(p["p90_abs_error"]),
            }
            for p in curve
            if p["horizon_h"] in keep
        ],
    }


def trailing_performance(store: DataStore, inp: TrailingInput) -> dict:
    """Walk-forward stats: only hours fully metered before this decision time, same cut-off rule."""
    decision_ts = decision_time(inp.delivery_date, inp.cutoff)
    lo = decision_ts - inp.lookback_days * 24 * HOUR
    rows = [
        r
        for r in service.window_rows(store, Mode.for_cutoff(inp.cutoff), "point")
        if r.matched and lo <= r.start_ts and r.start_ts + HOUR <= decision_ts
    ]
    errors = [r.error for r in rows]
    residuals = [-e for e in errors]  # actual - forecast
    n = len(rows)
    out: dict[str, Any] = {
        "as_of": format_ts(decision_ts),
        "lookback_days": inp.lookback_days,
        "hours_observed": n,
        "out_of_sample": True,
    }
    if n == 0:
        out["note"] = "No metered history before this decision time inside the snapshot window."
        return out
    q10 = m.quantile(residuals, 0.10)
    q90 = m.quantile(residuals, 0.90)
    out.update(
        {
            "first_hour": format_ts(rows[0].start_ts)[:16],
            "mae_gw": _gw(m.mae(errors)),
            "bias_gw": _gw(m.bias(errors)),
            "walk_forward_band_gw": {"q10": _gw(q10), "q90": _gw(q90)},
            "low_sample_warning": n < 48,
        }
    )
    d = service.decision(store, inp.delivery_date, inp.cutoff, "point")
    fcs = [p["forecast"] for p in d["points"] if p["forecast"] is not None]
    if fcs and q10 is not None:
        p10 = sum(max(0.0, f + q10) for f in fcs)
        out["walk_forward_energy_gwh"] = {"reliable_p10": _gwh(p10), "extra_to_procure": _gwh(sum(fcs) - p10)}
    return out


def compare_cutoffs(store: DataStore, inp: CompareCutoffsInput) -> dict:
    rows = []
    for c in inp.cutoffs:
        d = service.decision(store, inp.delivery_date, c, "point")
        s = d["summary"]
        rows.append(
            {
                "cutoff": c,
                "run_used": d["forecast_run"],
                "forecast_gwh": _gwh(s["forecast_mwh"]),
                "reliable_p10_gwh": _gwh(s["p10_mwh"]),
                "after_epex_gate": c > "09:20",
            }
        )
    return {"delivery_date": inp.delivery_date.isoformat(), "by_cutoff": rows}


def rank_days(store: DataStore, inp: RankDaysInput) -> dict:
    days = [r for r in service.accuracy(store, Mode.for_cutoff(inp.cutoff), "point")["by_day"] if r["mae"] is not None]
    days.sort(key=lambda r: r["mae"], reverse=inp.order == "worst")
    return {
        "cutoff": inp.cutoff,
        "order": inp.order,
        "days": [
            {
                "date": r["delivery_date"],
                "mae_gw": _gw(r["mae"]),
                "bias_gw": _gw(r["bias"]),
                "forecast_gwh": _gwh(r["forecast_mwh"]),
                "actual_gwh": _gwh(r["actual_mwh"]),
            }
            for r in days[: inp.n]
        ],
    }


# ---------------------------------------------------------------- registry


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_model: type[_Input]
    handler: Callable[[DataStore, Any], dict]
    label: Callable[[Any], str]  # short human description for the UI trace

    def schema(self) -> dict:
        s = self.input_model.model_json_schema()
        s.pop("title", None)
        for prop in s.get("properties", {}).values():
            prop.pop("title", None)
        s.setdefault("properties", {})
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": s,
            "eager_input_streaming": True,
        }


def _d(i: Any) -> str:
    return f"{i.delivery_date:%d %b}"


TOOLS: tuple[Tool, ...] = (
    Tool(
        "get_dataset_overview",
        "Window, run schedule, market gate times and the headline January accuracy at the default cut-off. "
        "Call first if you need orientation.",
        OverviewInput,
        overview,
        lambda i: "Read dataset overview",
    ),
    Tool(
        "get_decision_view",
        "What the desk could see at the cut-off for one delivery day: forecast run used and its age, daily "
        "forecast / reliable P10 / extra-to-procure energy, peak and high-wind hours, hourly forecast with "
        "P10/P90. Contains NO actuals.",
        DecisionViewInput,
        decision_view,
        lambda i: f"Decision view for {_d(i)} at {i.cutoff}",
    ),
    Tool(
        "get_outturn",
        "HINDSIGHT ONLY: metered wind for a delivery day vs the forecast used at the cut-off: MAE, bias, "
        "largest misses, hours below P10. Never present this as information available at decision time.",
        OutturnInput,
        outturn,
        lambda i: f"Hindsight outturn for {_d(i)}",
    ),
    Tool(
        "get_accuracy_summary",
        "January-wide accuracy for a selection (a cut-off, or a minimum lead time in hours): MAE, RMSE, "
        "bias, P90 error, shortfall quantiles, error by forecast level, calmest/roughest hour, worst hours.",
        AccuracyInput,
        accuracy,
        lambda i: f"January accuracy ({i.describe()})",
    ),
    Tool(
        "get_lead_time_curve",
        "How MAE, bias and P90 error change with forecast lead time from 0 to 48 h. Use to answer whether "
        "waiting for a fresher run helps.",
        LeadTimeInput,
        lead_time_curve,
        lambda i: "Error vs lead-time curve",
    ),
    Tool(
        "get_trailing_performance",
        "Out-of-sample check: forecast error over the last N days of hours already metered before this "
        "decision time, with a walk-forward P10 band and the extra-to-procure it implies.",
        TrailingInput,
        trailing_performance,
        lambda i: f"Trailing {i.lookback_days}-day performance before {_d(i)}",
    ),
    Tool(
        "compare_cutoffs",
        "For one delivery day, the forecast run, forecast energy and P10 at several cut-offs, flagging any "
        "cut-off after the EPEX 09:20 gate.",
        CompareCutoffsInput,
        compare_cutoffs,
        lambda i: f"Compare cut-offs {', '.join(i.cutoffs)} for {_d(i)}",
    ),
    Tool(
        "rank_days",
        "Delivery days ranked by daily MAE (worst or best first) at a cut-off, with forecast vs actual energy.",
        RankDaysInput,
        rank_days,
        lambda i: f"Rank {i.order} {i.n} days",
    ),
)

BY_NAME = {t.name: t for t in TOOLS}


def tool_schemas() -> list[dict]:
    return [t.schema() for t in TOOLS]


@dataclass(frozen=True)
class ToolOutcome:
    ok: bool
    content: dict
    label: str
    duration_ms: int


def execute(store: DataStore, name: str, raw_input: Any) -> ToolOutcome:
    """Validate and run one tool call. Never raises: failures become error results for the model."""
    t0 = time.perf_counter()
    tool = BY_NAME.get(name)
    if tool is None:
        return ToolOutcome(False, {"error": f"unknown tool {name!r}"}, name, 0)
    try:
        inp = tool.input_model.model_validate(raw_input if isinstance(raw_input, dict) else {})
    except ValidationError as exc:
        errs = [f"{'.'.join(map(str, e['loc'])) or 'input'}: {e['msg']}" for e in exc.errors()]
        return ToolOutcome(False, {"error": "invalid input", "details": errs}, tool.name, 0)
    label = tool.label(inp)
    try:
        content = tool.handler(store, inp)
    except Exception as exc:  # defensive: a bug in one tool must not kill the conversation
        return ToolOutcome(False, {"error": f"tool failed: {exc}"}, label, int((time.perf_counter() - t0) * 1000))
    return ToolOutcome(True, content, label, int((time.perf_counter() - t0) * 1000))
