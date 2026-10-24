# Video script, Part 2: technical walkthrough for the tech lead (target 4:45, hard limit 5:00)

Audience: the tech lead who will review the code and may inherit it. Goal: make the codebase easy to
review and hand over. Show the architecture, the algorithm that matters, the agent design, how
correctness was established, and how it ships.

Spoken lines are in quote blocks (about 690 words, roughly 4:45 at 145 words per minute). Each section
lists the file or screen to show.

## Before recording

- Editor with the repo open, font size 16+, file tree visible. Close unrelated tabs.
- Pre-open, in this order: `README.md` (architecture, rendered), `backend/app/selection.py`,
  `backend/app/service.py`, `docs/API_CONTRACT.md`, `docs/AGENT.md`, `backend/app/agent/tools.py`,
  `backend/app/agent/runner.py`, `backend/app/agent/briefing.py`, `backend/tests/test_agent.py`,
  `backend/tests/test_agent_sdk.py`, `vercel.json`, `.github/workflows/ci.yml`.
- A terminal with `backend/.venv` ready for the test run.
- The live app open on the Decision Desk with a finished briefing and its trace expanded.

## 0:00–0:30 · Architecture

**Show:** `README.md`, rendered mermaid diagram.

> The architecture is deliberately small. An offline ingest pulls two Elexon datasets, WINDFOR
> forecasts and FUELHH outturn, into a gzipped snapshot committed to the repo, so numbers are
> reproducible and the app runs on a read-only serverless filesystem. FastAPI loads it into an
> immutable in-memory store. A pure selection module picks the forecast for each hour, a service layer
> builds payloads, React renders them. On top sits an agent layer that reuses the same service code.

## 0:30–1:10 · The core algorithm

**Show:** `backend/app/selection.py`: `_latest_at_or_before`, `select_by_cutoff`, `select_by_horizon`.

> The domain logic is one file of pure functions on epoch seconds, so no timezone ambiguity. Both
> selection rules reduce to "the latest run at or before a limit": 09:00 the day before for a cut-off,
> or the target minus H hours for a fixed lead. The limit is clamped to before the target starts,
> because WINDFOR includes runs published after the hour began, which you could never have traded on.
> Then it is one bisect per target. The service layer caches payloads keyed on data version and
> parameters, and metrics are standard-library Python, no numpy, to keep the function small.

## 1:10–1:30 · Contract first

**Show:** `docs/API_CONTRACT.md` (domain rules, then the agent event table).

> Before code, I wrote the API contract: domain rules and every JSON shape, including the agent's event
> stream. Pydantic schemas and TypeScript types both mirror it.

## 1:30–2:50 · The agent

**Show:** `docs/AGENT.md` principles, then `agent/tools.py` (the `TOOLS` registry and `execute`), then
`agent/runner.py` (the loop), then `agent/briefing.py`. End on the live app's expanded trace.

> The agent follows one principle: the model reasons, code computes. Claude never sees the data
> directly. It gets eight tools, each a pydantic-validated wrapper over the same service functions as
> the dashboard, so its numbers match the screens. Two design choices matter for this domain. First,
> decision time and hindsight are separate tools: the decision view has no actuals, and a test enforces
> that. Second, a walk-forward tool uses only hours metered before the decision, so the agent can
> challenge the in-sample band. For 15 January it says 132 gigawatt-hours of cover, not 99.7.
>
> The runner is a generator of typed events streamed as server-sent events. Every tool call goes back
> in one message; invalid input returns as an error the model can fix; a turn cut off or refused never
> runs its tools; runs are capped at eight turns and a deadline. The briefing has to be published
> through a schema-validated tool, so the UI renders a structured recommendation, not prose. Requests
> are rate limited, the client can only send text history, never tool results, and markdown is rendered
> without raw HTML.
>
> And it is auditable: every call, its timing and the exact JSON the model saw are shown beside the
> answer, with token usage and cache hits. The SDK sits behind one gateway module, using adaptive
> thinking, a cached static prompt, and a server-side refusal fallback.

## 2:50–3:45 · Testing strategy

**Show:** `backend/tests/test_selection.py` boundary tests briefly, `tests/test_agent.py`
(`ScriptedGateway`), `tests/test_agent_sdk.py` (the mocked transport), then run `.venv/bin/pytest -q`.

> Selection rules were written test first, focused on boundaries: a run exactly at the cut-off is
> eligible, a lead of exactly H counts, a run after the target starts never does. A brute-force
> recomputation in the suite, and a separate pandas check from raw Elexon data, matched 33 of 33 values.
>
> No test calls the model. A scripted gateway drives every branch of the agent loop. A second suite
> runs the real Anthropic SDK against a mocked HTTP transport replaying Anthropic event streams, which
> proves stream parsing, tool input split across deltas, and that thinking blocks are echoed back
> unchanged. On the frontend, the stream parser is fuzzed across every chunk boundary; that found a real
> bug, a line ending split between two chunks. 125 backend tests and 50 frontend tests, all passing.

## 3:45–4:15 · Deployment

**Show:** `vercel.json`, then `.github/workflows/ci.yml`.

> On Vercel the frontend is static and a small shim re-exports the FastAPI app as a Python function,
> with a 120-second limit for agent runs. Docker Compose gives nginx, with stream buffering off for the
> agent routes, in front of a non-root uvicorn container. Without an API key the analyst switches
> itself off and the dashboard is unaffected. CI runs ruff, pytest, an entrypoint smoke test, and the
> frontend typecheck, tests and build.

## 4:15–4:45 · Trade-offs and next steps

**Show:** `README.md`, "Limitations and next steps".

> Deliberate trade-offs: one month, in memory, no database, and an in-sample band. Next: a rolling,
> conditioned band; an eval set of desk questions with checkable answers so prompt or model changes are
> measured; persisting briefings to score the agent's cover against outturn; and shared rate limiting
> once there is more than one instance. Thanks for watching.

## Check before publishing

- [ ] Total length at or under 5:00.
- [ ] Test counts on screen match what is said (125 backend, 50 frontend).
- [ ] Code font readable at 1080p.
