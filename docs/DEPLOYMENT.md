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
| Docker | nginx :8080 serves `dist/`, proxies `/api/` → `backend:8000` | uvicorn in `python:3.12-slim`, non-root | copied to `/app/data/` |
| Vercel | static `frontend/dist` on the CDN | `api/index.py` (Python 3.12 function) re-exports `backend/app/main.py:app` | bundled via `functions.includeFiles` |

`vercel.json` has two rewrites, applied in order:

- `/api/(.*)` → `/api/index`. FastAPI still sees the original path, for example `/api/decision`.
- every other path → `/index.html`, so client-side routes keep working after a page reload.

Vercel serves a real static file in preference to a rewrite.

Environment variable: `SNAPSHOT_PATH` gives the absolute path of the snapshot.

- The Docker image and `api/index.py` set it automatically.
- You only need to set it yourself if you move the data file.

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
curl -s localhost:8000/api/health                          # {"status":"ok"}
curl -s localhost:8080/api/meta | head -c 400              # same API, via nginx
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
git status --short          # the "REint Full Stack SWE challenge v4 Shared.md" file must NOT appear
git check-ignore -v "REint Full Stack SWE challenge v4 Shared.md"
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
curl -s  "$URL/api/meta" | head -c 400                                  # actual_points 1488, forecast_points 19272
curl -s  "$URL/api/decision?delivery_date=2026-01-15&cutoff=09:00" | head -c 400   # forecast_run 2026-01-14T07:30:00Z
curl -s  "$URL/api/accuracy?cutoff=09:00" | head -c 300                 # "n": 744
curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/decision?delivery_date=2025-12-01"   # 422
curl -s -o /dev/null -w "%{http_code}\n" "$URL/accuracy"                # 200 (SPA fallback)
```

In an incognito window, without being logged in to Vercel or GitHub, check each of the following:

- [ ] `$URL` loads the app with no login wall, and the Decision view chart renders.
- [ ] Change the delivery date and the cut-off. The chart, the forecast-run badge and the P10/P90 band update.
- [ ] The Accuracy view's KPI tiles, histogram and error-by-horizon chart render. Moving the horizon slider updates them.
- [ ] Methodology page loads; reloading on a deep link (e.g. `$URL/accuracy`) still works.
- [ ] `$URL/api/health` returns `{"status":"ok"}`.
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
| Port 8000 or 8080 is already in use | Stop the other process, or change the left-hand port in `docker-compose.yml`. |

Fallback if the `api/` function approach ever fails on Vercel: use [Vercel Services](https://vercel.com/docs/services), which is in beta. Define two services:

- `frontend/`
- `backend/` with `"entrypoint": "app.main:app"`

Add the rewrites `/api/(.*)` → backend and `/(.*)` → frontend. Move `installCommand`, `buildCommand`, `outputDirectory`, `framework` and `functions` into the matching service entries.
