# Video script, Part 1: pitch to the day-ahead trading team (target 4:45, hard limit 5:00)

Audience: the client utility's day-ahead power-buying desk. Goal: show that WindSight answers their
morning question ("how much wind can I count on tomorrow, and how much do I buy on top?") with numbers
from their own market, has an AI analyst that does the research for them, and leave them wanting a pilot.

Spoken lines are in quote blocks (about 550 words, roughly 3:50 at 145 words per minute, leaving about
50 s for the briefing to run on screen). Every fixed
number comes from the app on the January 2026 snapshot at the 09:00 cut-off. The AI's wording differs
run to run: read its headline and recommended cover off the screen rather than from this script.

## Before recording

- Open the live app in a clean browser window at 1440 px wide, light theme, zoom 100%.
- Confirm `/api/agent/status` shows `"enabled": true`.
- Pre-load `/?date=2026-01-15&cutoff=09:00` and `/accuracy` in two tabs so nothing loads on camera.
- **Do one dry run of "Generate briefing" for 15 Jan before recording**, so you know roughly what it
  will say and how long it takes (typically 20–60 s). On camera, keep talking while it works.
- Hide bookmarks bar and notifications. Camera bubble bottom-left, away from the KPI tiles.

## 0:00–0:25 · Their problem

**Screen:** Decision Desk, 15 January, scrolled to the top. No clicks.

> Every morning before nine, your desk commits to tomorrow's power. Wind moves by gigawatts from one
> day to the next. Buy to the raw forecast and the wind comes in short, and you cover the gap intraday
> or in imbalance, usually at a worse price. So the real question is not "what is the forecast?" It is
> "how much of it can I rely on?"

## 0:25–0:45 · What we built

**Screen:** Slowly pan over the top of the Decision Desk: date stepper, cut-off control, run header.

> WindSight is a day-ahead wind desk built on public Elexon data: national wind forecasts and metered
> wind output. For any delivery day it shows the forecast you had at your decision time, how much wind
> you can count on with ninety percent confidence, and an AI analyst that does the research for you.
> This pilot covers January 2026.

## 0:45–1:40 · Live walkthrough: 15 January

**Screen:** Point at the run header, the cut-off control (09:00 preset, "before EPEX 09:20 gate"), then
the four KPI tiles, then hover two hours on the chart.

> Delivery day 15 January. The cut-off is 09:00 the day before, ahead of the EPEX gate at 09:20. The
> freshest forecast then is the 07:30 run; the next one lands after the gate.
>
> The forecast said 278.6 gigawatt-hours of wind. Reliable wind at ninety percent is 178.9. That leaves
> 99.7 gigawatt-hours, about 4.2 gigawatts an hour, to cover from thermal or the market. On the chart,
> the shaded band is the likely range and the dots are what happened: 254 gigawatt-hours, short of the
> forecast in every hour, but inside the band.

## 1:40–2:35 · What a month of data says

**Screen:** Forecast Accuracy tab: KPI tiles, the insight callouts, then the "Error vs lead time" chart.

> Across all 744 delivery hours at your cut-off, the typical hourly miss was about 2 gigawatts, 18
> percent of average output. More important is the direction: the forecast ran high by 1.7 gigawatts
> on average, about 15 percent over the month. It is worst when it is windiest: above 20 gigawatts,
> every single hour came in short. And waiting does not rescue you before the gate; fresher forecasts
> help intraday, not day-ahead.

## 2:35–3:40 · The AI analyst

**Screen:** Back to the Decision Desk, 15 January. Click **Generate briefing**. While it runs, point at
the live steps in the trace. When it finishes, point at the risk badge, the recommended cover and its
comparison with the standard cover, then the evidence list. Open one step's "view data".

> That standard 99.7 is one January-wide number. So we built an analyst. One click, and an AI agent
> researches this day the way an analyst would: it pulls the decision view, checks how the forecast
> has performed over the past week using only data you would have had at nine o'clock, and looks at how
> risky high-wind hours are.
>
> *(when it finishes)* It comes back with a risk rating and a recommended cover, here *[read the figure
> on screen]* against the standard 99.7, and the evidence behind it. Every number is traceable: open any
> step and you see the exact data it used. It cannot invent figures; it can only report what the tools
> return.

**Screen:** Press **Ctrl K**, click the suggestion "What changes for Thu 15 Jan 2026 if we wait for the
next forecast run?". Let the answer stream; don't read it out in full.

> And you can just ask it questions, in plain English, about any day.

## 3:40–4:15 · What this means for procurement

**Screen:** Close the panel. Point at "Reliable wind at 90%" and "Extra to procure".

> Three takeaways. Treat P10, not the forecast, as the wind you own. Plan for the forecast to run high,
> especially on windy days, and let the briefing tell you when the standard cover is too thin. Keep
> flexibility for intraday. Why it runs high, we have not proven: wind curtailed for grid constraints is
> a likely contributor, and testing that is our first next step.

## 4:15–4:40 · Roadmap

**Screen:** Methodology page, "AI desk analyst", then "Limitations & next steps".

> Next: a band fitted on past data only and conditioned on wind level, solar, and prices to turn
> gigawatt-hours into pounds. And the analyst goes proactive: it re-runs the briefing when a new
> forecast lands before the gate and alerts you if your cover should move.

## 4:40–4:55 · Call to action

**Screen:** Back to the Decision Desk. Static.

> I would like to run this alongside your desk for a month, with your cut-off and volumes, and compare
> it with what you actually bought. Thank you.

## Check before publishing

- [ ] Total length at or under 5:00.
- [ ] Every number spoken matches what is on screen at that moment (especially the AI's figure).
- [ ] The over-forecast cause is described as a hypothesis, never as fact.
- [ ] If the briefing was slow, trim the wait in editing rather than re-recording.
