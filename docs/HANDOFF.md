# Handoff / project status (for continuing in a Claude Code cloud session)

**Product:** WindSight — day-ahead wind desk for a UK utility's DA power-buying team.
Take-home: React frontend + Python (FastAPI) backend, Docker, deployed on Vercel. Data: Elexon BMRS
FUELHH (WIND actuals, half-hourly) and WINDFOR (hourly wind forecasts) only.

## Key decisions (do not change without reason)
- Purchase decisions made on D-1 = 2026-01-01..31 → **delivery days 2026-01-02..2026-02-01**.
- Decision cut-off default **09:00 UK (= UTC in January) on D-1**, before EPEX GB DA gate (09:20) and
  N2EX (09:50). Configurable.
- Selection: per hourly target, latest forecast with `publishTime ≤ cutoff` and `publishTime < startTime`.
  Horizon mode: latest forecast with lead ≥ H hours (0–48).
- Compare on hourly targets; actual = FUELHH at same startTime (or mean of 2 half-hours).
- Error = forecast − actual. P10/P90 band from empirical January error distribution.
- Full rules + JSON shapes: [`API_CONTRACT.md`](API_CONTRACT.md). Single source of truth.

## Verified data facts
- 1488 actuals (31 days × 48), 19,856 forecast points, 272 runs (nominal schedule 02:30, 04:30, 07:30,
  09:30, 11:30, 15:30, 18:30, 22:30 UTC), horizons −14.5h..57.5h. At 09:00 cutoff all 744 delivery hours
  covered by the 07:30 D-1 run, lead 16.5–39.5h. Snapshot: `backend/data/snapshot_jan2026.json.gz`
  (regenerate: `cd backend && python -m scripts.ingest`).
- Headline numbers (09:00 cutoff, point alignment): MAE 2,022.5 MW, bias +1,745.9 MW, nMAE 17.92%,
  band q10/q50/q90 of (actual − forecast) = −4,154.4 / −1,581.5 / +426.4 MW. Bias is positive at every
  lead time 0–48h (≈ +1.47 to +1.87 GW); cause unverified (curtailment / fleet-coverage hypotheses, see README).

## Status
- [x] Plan, domain research, API contract, data snapshot, ingest script, Elexon client (retries + deadline)
- [x] Backend: selection.py, metrics.py, service.py, data_store.py, schemas.py, main.py; 78 pytest tests pass, ruff clean
- [x] Frontend: Decision Desk / Forecast Accuracy / Methodology pages; 37 Vitest tests pass, typecheck clean, build OK
- [x] Infra: vercel.json, api/index.py, Dockerfiles, docker-compose.yml, nginx.conf, CI, docs/DEPLOYMENT.md
- [x] Independent numeric verification (pandas recompute from raw Elexon vs API): 33/33 matched
- [x] Code review; fixes applied (backend hardening incl. token-guarded, deadline-bounded refresh; frontend polish)
- [x] Docs: README (layout, how to run, API, results, AI-tools disclosure, attribution), video scripts
      (docs/VIDEO_SCRIPT_PART1_CLIENT.md, docs/VIDEO_SCRIPT_PART2_TECH.md), docs/SUBMISSION_CHECKLIST.md
- [ ] Commit and push to https://github.com/cryptasim/supreme-potato (public)
- [ ] Docker smoke test: `docker compose up --build`, checks in docs/DEPLOYMENT.md §3
- [ ] Deploy to Vercel; make deployment public; verify URLs in incognito (docs/DEPLOYMENT.md §7)
- [ ] Fill README links (live app, video); add screenshots to docs/screenshots/
- [ ] Record both videos (≤5 min each), upload unlisted
- [ ] Submit the form (author does this): see docs/SUBMISSION_CHECKLIST.md

## Local dev
```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q && .venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && pnpm install && pnpm dev   # proxies /api → :8000
```
