# Deployment guide

This guide covers running the app with Docker, publishing the repository to GitHub, and deploying to Vercel.
Run every command from the repo root. The path contains spaces, so keep the quotes:

```bash
cd "/Users/asimkumarhansda/Desktop/TAKE HOME ASSIGNMENTS/GRIDBRICKS"
```

## How the pieces fit

| Environment | Frontend | API | Snapshot data |
|---|---|---|---|
| Local dev | `pnpm dev` (Vite, :5173, proxies `/api`) | `uvicorn app.main:app` (:8000) | `backend/data/snapshot_jan2026.json.gz` |
| Docker | nginx :8080 serves `dist/`, proxies `/api/` → `backend:8000` | uvicorn in `python:3.12-slim`, non-root; port 8000 is only on the compose network (reach the API via `http://localhost:8080/api`) | copied to `/app/data/` |
| Vercel | static `frontend/dist` on the CDN | `api/index.py` (Python 3.12 function) re-exports `backend/app/main.py:app` | bundled via `functions.includeFiles` |

`vercel.json` has two rewrites, applied in order:

- `/api/(.*)` → `/api/index`. FastAPI still sees the original path, for example `/api/decision`.
- every other path → `/index.html`, so client-side routes keep working after a page reload.

Vercel serves a real static file in preference to a rewrite.

Environment variables:

- `SNAPSHOT_PATH` gives the absolute path of the snapshot. The Docker image and `api/index.py` set it
  automatically; you only need to set it yourself if you move the data file.
- `REFRESH_TOKEN` (optional) enables `POST /api/refresh`. Unset means the endpoint returns 403
  "refresh disabled". To enable it, set a long random value (Vercel → Settings → Environment Variables,
  or `REFRESH_TOKEN=... docker compose up`) and call:

  ```bash
  curl -s -X POST -H "X-Refresh-Token: $REFRESH_TOKEN" "$URL/api/refresh" | head -c 400
  ```

  The refresh finishes or fails (502, snapshot kept) within ~45 s, inside the function time limit.
  CORS allows only `GET`, so browsers on other origins cannot trigger it.
- `ANTHROPIC_API_KEY` turns on the AI desk analyst (chat panel and pre-gate briefing). Unset, the rest
  of the app works normally, `/api/agent/status` reports `"enabled": false` and the agent endpoints
  return 503. See "Enable the AI analyst" below.
- Optional agent tuning: `AGENT_MODEL` (default `claude-opus-5-5`), `AGENT_EFFORT` (`medium`),
  `AGENT_DEADLINE_S` (100, must stay below the function's `maxDuration` of 120 s), `AGENT_FALLBACKS`
  (`on`; set `off` to drop the server-side refusal fallback beta), `AGENT_RATE_PER_MIN` (6),
  `AGENT_RATE_PER_HOUR` (40), `AGENT_DAILY_CAP` (500), `AGENT_DISABLED=1` (kill switch).

### Enable the AI analyst

1. Create a key at <https://console.anthropic.com> → API Keys. Use a dedicated workspace for this app.
2. **Set a monthly spend limit on that workspace** (Console → Settings → Limits). The agent endpoints are
   public; the in-app rate limits are per instance and only a brake. A briefing costs roughly
   $0.05–0.30 depending on how much the agent researches; every run reports its token usage in the UI.
3. Vercel → Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` for Production
   (and Preview if wanted), then redeploy (`vercel --prod`). Env changes apply only to new deployments.
4. Check: `curl -s "$URL/api/agent/status"` returns `{"enabled":true,"model":"claude-opus-5-5",...}`, and
   "Generate briefing" on the Decision Desk streams tool calls and ends in a risk-rated briefing.

Docker: `ANTHROPIC_API_KEY=sk-ant-... docker compose up --build`.

## 1. Install tooling (once)

```bash
brew install --cask docker      # then open Docker.app once so the engine starts
brew install gh
npm i -g vercel
docker --version && docker compose version && gh --version && vercel --version
```

## 2. Log in (once)

```bash
gh auth login        # GitHub.com → HTTPS → "Login with a web browser"
vercel login         # pick the same GitHub account (or email)
gh auth status && vercel whoami
```

## 3. Run the full stack in Docker

```bash
docker compose up --build
```

In a second terminal:

```bash
curl -s localhost:8080/api/health                          # {"status":"ok"}
curl -s localhost:8080/api/meta | head -c 400              # the backend is reachable only via nginx
curl -s "localhost:8080/api/decision?delivery_date=2026-01-15&cutoff=09:00" | head -c 400
open http://localhost:8080                                 # UI
docker compose ps                                          # backend should be "healthy"
```

Stop the stack with `Ctrl-C`, then run `docker compose down`.

## 4. Run the checks the same way CI does (optional but recommended)

```bash
(cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q)
(cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build)
```

## 5. Create the public GitHub repo (random name) and push

The challenge asks for a repository name that does not identify the company. Generate one:

```bash
REPO="$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 8)"; echo "$REPO"
```

Before committing, confirm that the private challenge spec is ignored:

```bash
git status --short          # the private challenge spec (*challenge*.md) must NOT appear
git check-ignore -v "<spec filename>.md"
```

Then commit, create the repo, and push:

```bash
git add -A
git commit -m "Wind forecast decision-support app"
gh repo create "$REPO" --public --source=. --remote=origin --push
gh repo view --web
```

## 6. Deploy to Vercel

```bash
vercel link --yes --project "$REPO"   # creates/links the Vercel project; writes .vercel/ (git-ignored)
vercel --prod
```

The root `vercel.json` sets the framework, install, build and output settings. Do not change them in the dashboard. In summary:

- `framework: null`: stops the FastAPI preset from taking over the project.
- install and build: `pnpm@10.32.1 --dir frontend`.
- output directory: `frontend/dist`.
- Python version: 3.12, from `.python-version`.
- Python dependencies: root `requirements.txt`.

Optionally, connect the GitHub repo so every push deploys automatically:

```bash
vercel git connect
```

What to look for in the build log:

- The frontend build finishes with `vite build ... built in`.
- A Python function is built for `api/index.py`.
- Neither step fails because the bundle is too large. The limit is 500 MB uncompressed; ours is a few MB, because `.venv`, `node_modules`, tests and the frontend are excluded.

Make the deployment public:

- Vercel → Project → Settings → **Deployment Protection**.
- Set "Vercel Authentication" to **Disabled**, at least for Production.
- Otherwise visitors who are not logged in get a Vercel login wall.

## 7. Verification checklist (fresh incognito / private window)

Set `URL` to the production URL that `vercel --prod` printed, for example `https://<repo>.vercel.app`.

```bash
URL=https://<your-project>.vercel.app
curl -s  "$URL/api/health"                                              # {"status":"ok"}
curl -s  "$URL/api/meta" | head -c 400                                  # actual_points 1488, forecast_points 19856
curl -s  "$URL/api/decision?delivery_date=2026-01-15&cutoff=09:00" | head -c 400   # forecast_run 2026-01-14T07:30:00Z
curl -s  "$URL/api/accuracy?cutoff=09:00" | head -c 300                 # "n": 744
curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/decision?delivery_date=2025-12-01"   # 422
curl -s -o /dev/null -w "%{http_code}\n" "$URL/accuracy"                # 200 (SPA fallback)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL/api/refresh"     # 403 (no/invalid token)
```

In an incognito window, without being logged in to Vercel or GitHub, check each of the following:

- [ ] `$URL` loads the app with no login wall, and the Decision view chart renders.
- [ ] Change the delivery date and the cut-off. The chart, the forecast-run badge and the P10/P90 band update.
- [ ] The Accuracy view's KPI tiles, histogram and error-by-horizon chart render. Moving the horizon slider updates them.
- [ ] Methodology page loads; reloading on a deep link (e.g. `$URL/accuracy`) still works.
- [ ] `$URL/api/health` returns `{"status":"ok"}`.
- [ ] `$URL/api/agent/status` shows `"enabled": true`; "Generate briefing" and "Ask the analyst" both stream and finish.
- [ ] The browser dev tools Console shows no errors, and the Network tab shows no failed `/api` calls.
- [ ] The GitHub repo URL opens while logged out, its name is random, and the README renders.
- [ ] The README contains the live URL, the repo URL and the video link.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Every `/api/*` returns 404 or the SPA HTML | The FastAPI preset was auto-detected. Check that `vercel.json` has `"framework": null` and that Project Settings → Framework Preset is "Other". Then redeploy. |
| `ModuleNotFoundError: app` in function logs | `api/index.py` could not find `backend/`. Check the `includeFiles` glob `backend/{app,data}/**` in `vercel.json`. |
| `FileNotFoundError` for the snapshot | Set `SNAPSHOT_PATH` in Vercel → Settings → Environment Variables to `/var/task/backend/data/snapshot_jan2026.json.gz`, then redeploy. |
| `ERR_PNPM_OUTDATED_LOCKFILE` | Run `pnpm install` in `frontend/` locally, commit `pnpm-lock.yaml`, then push again. |
| Docker: frontend waits forever | The backend is unhealthy. Run `docker compose logs backend`; the cause is usually a startup import error. |
| Analyst says "not configured" | `ANTHROPIC_API_KEY` is missing from the deployment. Add it in Vercel → Settings → Environment Variables and **redeploy**. |
| Analyst error "API key was rejected" / "not allowed to use this model" | Wrong or revoked key, or the workspace cannot use `claude-opus-5-5`. Fix the key, or set `AGENT_MODEL` to a model the workspace can use. |
| Analyst error "rejected the request" mentioning fallbacks | Set `AGENT_FALLBACKS=off` and redeploy. |
| Briefing stops with "connection closed" | The function hit its time limit. Lower `AGENT_DEADLINE_S` (keep it ~20 s under `maxDuration`) or `AGENT_EFFORT=low`. If your Vercel plan caps functions at 60 s, set `maxDuration` to 60 in `vercel.json` and `AGENT_DEADLINE_S=50`. |
| The trace and answer appear all at once instead of streaming | A proxy or platform is buffering the response. It still works; for nginx, keep the `/api/agent/` block with `proxy_buffering off`. |
| Port 8080 is already in use | Stop the other process, or change the left-hand port of the frontend in `docker-compose.yml`. The backend publishes no host port; use `http://localhost:8080/api` (or `docker compose exec backend ...`). |

Fallback if the `api/` function approach ever fails on Vercel: use [Vercel Services](https://vercel.com/docs/services), which is in beta. Define two services:

- `frontend/`
- `backend/` with `"entrypoint": "app.main:app"`

Add the rewrites `/api/(.*)` → backend and `/(.*)` → frontend. Move `installCommand`, `buildCommand`, `outputDirectory`, `framework` and `functions` into the matching service entries.
