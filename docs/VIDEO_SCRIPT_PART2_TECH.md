# Video script, Part 2: technical walkthrough for the tech lead (target 4:45, hard limit 5:00)

Audience: the tech lead who will review the code and may inherit it. Goal: make the codebase easy to
review and hand over. Show the architecture, the one algorithm that matters, how correctness was
established, and how it ships.

Spoken lines are in quote blocks (about 670 words, roughly 4:40 at 145 words per minute). Each section
lists the file or screen to show.

## Before recording

- Editor with the repo open, font size 16+, file tree visible. Close unrelated tabs.
- Pre-open, in this order: `README.md` (architecture section, rendered preview), `backend/app/selection.py`,
  `backend/app/service.py`, `backend/app/metrics.py`, `docs/API_CONTRACT.md`, `backend/app/schemas.py`,
  `frontend/src/api/types.ts`, `frontend/src/pages/DecisionDesk.tsx`, `backend/tests/test_selection.py`,
  `backend/tests/test_api.py`, `vercel.json`, `api/index.py`, `docker-compose.yml`, `.github/workflows/ci.yml`.
- A terminal with `backend/.venv` ready for the test run at 3:05.

## 0:00–0:35 · Architecture

**Show:** `README.md`, rendered mermaid diagram.

> This is the technical half. The architecture is deliberately small. An offline ingest script pulls
> two Elexon datasets, WINDFOR forecasts and FUELHH wind outturn, into a gzipped JSON snapshot that is
> committed to the repo. At startup the FastAPI backend loads it into an immutable in-memory store. A
> pure selection module picks the right forecast for each hour, a service layer builds the payloads, and
> a React single-page app renders them. The same backend runs under uvicorn in Docker and as a Vercel
> Python function.

## 0:35–1:05 · Data pipeline and why a snapshot

**Show:** `backend/scripts/ingest.py`, then `backend/app/data_store.py` (the `DataStore` dataclass and
the refresh swap).

> Why a snapshot rather than calling Elexon per request? Three reasons. The numbers are reproducible, so
> a reviewer sees what I saw. Vercel's filesystem is read-only and functions are short-lived. And the app
> works if Elexon is slow. It is 1,488 half-hourly actuals and 19,856 forecast points from 272 runs. A
> token-protected refresh endpoint can pull live data, build a new store and swap the reference
> atomically. Nothing is written to disk.

## 1:05–1:50 · The core algorithm

**Show:** `backend/app/selection.py`: `build_forecast_index`, then `_latest_at_or_before`, then
`select_by_cutoff` and `select_by_horizon`.

> The domain logic lives in one file of pure functions on epoch seconds, so there is no timezone
> ambiguity. The index maps each target hour to its runs, sorted by publish time. Both selection rules
> reduce to "the latest run at or before some limit". For a cut-off, the limit is 09:00 the day before.
> For a fixed lead time, it is the target minus H hours. Either way I clamp the limit to one second
> before the target starts, because WINDFOR includes runs published after the hour began, which you
> could never have traded on. Then it is one bisect, so log of the number of runs per target.

## 1:50–2:20 · Metrics and caching

**Show:** `backend/app/metrics.py` (the `quantile` docstring), then `backend/app/service.py`
(`window_rows`, `decision`, the `lru_cache` decorators).

> Metrics are standard-library Python. No numpy at runtime, which keeps the serverless bundle small. The
> quantile function matches numpy's default interpolation, and a test pins that. The service layer caches
> each payload keyed on the data version and the request parameters, so a refresh cannot serve stale
> results.

## 2:20–2:50 · Contract first, and the frontend

**Show:** `docs/API_CONTRACT.md` (domain rules section), `backend/app/schemas.py`,
`frontend/src/api/types.ts`, then `frontend/src/pages/DecisionDesk.tsx` (URL state at the top).

> Before writing code I wrote the API contract: the domain rules and every JSON shape. The Pydantic
> schemas and the TypeScript types both mirror it, so frontend and backend could be built in parallel.
> The frontend is Vite, React, TypeScript, Tailwind, React Query and Recharts. Three pages: Decision
> Desk, Forecast Accuracy and Methodology. Page state lives in the URL, so any view can be shared as a
> link.

## 2:50–3:40 · Testing strategy

**Show:** `backend/tests/test_selection.py` (the cut-off and horizon boundary tests), then
`backend/tests/test_api.py` (`test_matches_independent_brute_force_recomputation`), then run
`.venv/bin/pytest -q` in the terminal.

> The selection rules were written test first, and the tests concentrate on boundaries. A run published
> exactly at the cut-off is eligible. A lead of exactly H hours counts, one just below falls back to an
> older run. A run at or after the target start is never used. API tests check every shape, the 422
> paths, CORS and the refresh token. Frontend tests run against fixtures that follow the contract.
>
> For the numbers themselves, I did not trust one implementation. In the repo, this test recomputes the
> accuracy figures by brute force. Separately, a pandas recomputation from raw Elexon data matched 33 of
> 33 values. In total there are 78 backend tests and
> 37 frontend tests, all passing.

## 3:40–4:15 · Deployment

**Show:** `vercel.json`, `api/index.py`, then `docker-compose.yml`.

> On Vercel, the frontend is static on the CDN and `api/index.py` is a tiny shim that re-exports the
> FastAPI app. Rewrites send `/api` to the function and everything else to the SPA. The snapshot is
> bundled with the function. Locally, `docker compose up` gives nginx on port 8080 proxying to a
> non-root uvicorn container with a health check, so the app starts with one command.

## 4:15–4:30 · Development practices

**Show:** `.github/workflows/ci.yml`.

> CI runs ruff and pytest, a smoke test that imports the Vercel entrypoint with only the production
> dependencies, and a frontend typecheck, test run and build. The contract doc is the place to start
> any change.

## 4:30–4:50 · Trade-offs and next steps

**Show:** `README.md`, "Limitations and next steps".

> The trade-offs are deliberate. One month, in memory, no database. The band is unconditional and fitted
> with hindsight, so the first change I would make is a rolling, conditioned band. After that: commit
> the cross-check as a regression test, test the curtailment hypothesis behind the over-forecast with
> constraint data, and move to a scheduled ingest into a small database once the window grows beyond a
> month. Thanks for watching.

## Check before publishing

- [ ] Total length at or under 5:00.
- [ ] Test counts on screen match what is said (78 backend, 37 frontend).
- [ ] Code font readable at 1080p.
