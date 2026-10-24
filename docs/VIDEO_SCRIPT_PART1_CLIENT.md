# Video script, Part 1: pitch to the day-ahead trading team (target 4:45, hard limit 5:00)

Audience: the client utility's day-ahead power-buying desk. Goal: show that WindSight answers their
morning question ("how much wind can I count on tomorrow, and how much do I buy on top?") with numbers
from their own market, and leave them wanting a pilot.

Spoken lines are in quote blocks (about 670 words, roughly 4:40 at 145 words per minute). Every number
comes from the app on the January 2026 snapshot at the 09:00 cut-off.

## Before recording

- Open the live app in a clean browser window at 1440 px wide, light theme, zoom 100%.
- Pre-load `/?date=2026-01-15&cutoff=09:00` and `/accuracy` in two tabs so nothing loads on camera.
- Hide bookmarks bar and notifications. Camera bubble bottom-left, away from the KPI tiles.

## 0:00–0:30 · Their problem

**Screen:** Decision Desk, 15 January, scrolled to the top. No clicks.

> Every morning before nine, your desk has to commit to tomorrow's power. Wind is now one of the
> largest sources on the GB grid, and it moves by gigawatts from one day to the next. If you buy to the
> raw forecast and the wind comes in short, you are covering the gap in the intraday market or in
> imbalance, usually at the worst price of the day. So the real question is not "what is the
> forecast?" It is "how much of it can I actually rely on?"

## 0:30–1:00 · What we built

**Screen:** Slowly pan over the top of the Decision Desk: date stepper, cut-off control, run header.

> WindSight is a day-ahead wind desk built on public Elexon data: the national wind forecasts and the
> metered wind output. For any delivery day it shows you exactly the forecast you would have had at
> your decision time, how it turned out, and how much wind you can count on with ninety percent
> confidence. Everything here is January 2026, delivery days 2 January to 1 February.

## 1:00–2:15 · Live walkthrough: 15 January

**Screen:** Point at the run header, then the cut-off control (show the 09:00 preset and its "before
EPEX 09:20 gate" hint), then the four KPI tiles, then hover two or three hours on the chart.

> Here is delivery day 15 January. The default cut-off is 09:00 on the day before, which leaves time
> before the EPEX auction closes at 09:20 and N2EX at 09:50. At 09:00 the freshest forecast is the 07:30
> run, ninety minutes old. The next run lands at 09:30, after the EPEX gate, so it could not have
> helped.
>
> The forecast said 278.6 gigawatt-hours of wind for the day. The tile next to it is the one I would
> look at first: reliable wind at ninety percent, 178.9 gigawatt-hours. That leaves 99.7
> gigawatt-hours, about 4.2 gigawatts every hour, to cover from thermal or the market if you want that
> confidence.
>
> On the chart, the line is the forecast, the shaded band is the P10 to P90 range, and the dots are what
> actually happened. On this day wind came in at 254 gigawatt-hours, below forecast in every hour, but
> inside the band.

**Screen:** Click the date stepper forward to 28 January.

> Now 28 January. The forecast said 267 gigawatt-hours. Actual output was 139. That is the day that
> hurts if you bought to the forecast.

## 2:15–3:20 · What a month of data says

**Screen:** Switch to the Forecast Accuracy tab. Point at the KPI tiles, then the insight callouts,
then the "Error vs lead time" chart, then the daily MAE bars.

> Across all 744 delivery hours, at your 09:00 cut-off, the typical hourly miss was about 2 gigawatts,
> roughly 18 percent of average wind output. More important for you is the direction. The forecast was
> too high on average by 1.7 gigawatts. Over the month it forecast 9,695 gigawatt-hours and the meters
> recorded 8,396, about 15 percent less.
>
> The over-forecast is worst when it is windiest. In hours forecast at 20 gigawatts or more, every
> single hour came in short, by 4.6 gigawatts on average.
>
> And waiting does not rescue you before the gate. Moving your cut-off from 09:00 to 09:30 barely changes
> the error. Going from a day ahead to four hours ahead cuts it by about 11 percent, which is an intraday
> opportunity, not a day-ahead one.

## 3:20–4:10 · What this means for procurement

**Screen:** Back to the Decision Desk, 15 January. Point at "Reliable wind at 90%" and "Extra to
procure".

> Three takeaways for the desk. First, treat P10, not the forecast, as the wind you own. Second, plan
> for the forecast to run high, especially on windy days. Third, keep some flexibility for intraday,
> because that is where fresher forecasts pay off.
>
> On why the forecast runs high, I want to be careful. One likely contributor is wind turned down for
> grid constraints: the meters show what was generated after that, while the forecast estimates what
> the wind could produce. Another is that the forecast and the meters may not cover exactly the same
> wind farms. We have not proven either yet, and testing that is our first next step.

## 4:10–4:40 · Roadmap

**Screen:** Methodology page, scrolled to "Limitations & next steps".

> Today the band is one January-wide number, fitted with hindsight. Next we would fit it on past data
> only and make it depend on wind level and lead time, so you hold more cover on stormy days and less
> on calm ones. Then add solar, bring in prices to turn gigawatt-hours into pounds, and alert you when a
> new run moves the forecast by more than your cover before the gate.

## 4:40–4:55 · Call to action

**Screen:** Back to the Decision Desk. Static.

> I would like to run this alongside your desk for a month, using your cut-off and your volumes, and
> compare it with what you actually bought. Thank you.

## Check before publishing

- [ ] Total length at or under 5:00.
- [ ] Every number spoken matches what is on screen at that moment.
- [ ] The over-forecast cause is described as a hypothesis, never as fact.
