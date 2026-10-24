"""The structured morning briefing, and the terminal tool the agent uses to publish it.

Forced tool choice is not available on the model we use, so the briefing task tells the agent to
finish by calling ``publish_briefing``. The input is validated like any other tool; a schema miss
goes back to the model as an error it can fix, and a valid call ends the run.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PUBLISH_TOOL = "publish_briefing"


class Briefing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    headline: str = Field(max_length=140, description="One sentence a trader can act on")
    risk_level: Literal["low", "elevated", "high"] = Field(
        description="Shortfall risk vs the raw forecast: low, elevated or high"
    )
    forecast_gwh: float = Field(ge=0, description="Forecast wind energy for the delivery day, GWh")
    reliable_wind_gwh: float = Field(ge=0, description="Wind to count on at 90% confidence, GWh")
    recommended_extra_gwh: float = Field(
        ge=0, description="Energy to procure beyond the reliable wind, versus the raw forecast, GWh"
    )
    recommendation: str = Field(max_length=400, description="What to do before the gate, in 1-2 sentences")
    drivers: list[str] = Field(min_length=2, max_length=4, description="Evidence behind the call, each with a number")
    watch_items: list[str] = Field(min_length=1, max_length=3, description="What could change the call")
    confidence_note: str = Field(max_length=300, description="Caveats: sample size, in-sample band, bias")
    hindsight: str | None = Field(
        None, max_length=300, description="Optional, clearly labelled: how the day actually turned out"
    )


def publish_tool_schema() -> dict:
    schema = Briefing.model_json_schema()
    schema.pop("title", None)
    for prop in schema["properties"].values():
        prop.pop("title", None)
    return {
        "name": PUBLISH_TOOL,
        "description": (
            "Publish the final structured briefing for the trading desk. Call exactly once, as your last "
            "action, after gathering evidence with the other tools."
        ),
        "input_schema": schema,
        "eager_input_streaming": True,
    }
