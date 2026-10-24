# Submission checklist

Work through this in order. Every URL check is done in a fresh incognito / private window, logged out of
GitHub, Vercel and YouTube, because that is what the reviewer will see.

## 1. Before pushing

- [ ] Backend checks pass: `(cd backend && .venv/bin/ruff check . && .venv/bin/pytest -q)` (expect 78 passed).
- [ ] Frontend checks pass: `(cd frontend && pnpm typecheck && pnpm test && pnpm build)` (expect 37 passed).
- [ ] The private challenge spec is not tracked: `git status --short` does not list it, and
      `git ls-files docs/` shows only the project docs.
- [ ] No tracked file names the hiring company. Run `git ls-files | xargs grep -il "<company name>"` and
      review every hit. At the time of writing, `.gitignore`, `.vercelignore` and `docs/DEPLOYMENT.md`
      mention the spec filename; decide whether to reword those lines (for example, ignore `*challenge*.md`
      instead) before the repo goes public.
- [ ] No secrets committed: no `.env` files, no `REFRESH_TOKEN` value anywhere in the repo.

## 2. Repository

- [ ] Pushed to https://github.com/cryptasim/supreme-potato on `main` (origin already points there:
      use `git push origin main` and skip the `gh repo create` step in `docs/DEPLOYMENT.md` §5).
- [ ] Repo visibility is **Public** (Settings → General → Danger Zone).
- [ ] Incognito: the repo URL opens, the README renders, the mermaid diagram draws, and the file tree
      matches the "Repository layout" section.
- [ ] GitHub Actions: the latest CI run on `main` is green (backend, Vercel entrypoint, frontend).

## 3. Docker smoke test

- [ ] `docker compose up --build` starts both containers and `docker compose ps` shows the backend healthy.
- [ ] http://localhost:8080 loads; `curl -s localhost:8080/api/health` returns `{"status":"ok"}`.

## 4. Live app (Vercel)

- [ ] `vercel --prod` succeeded; Deployment Protection is **Disabled** for Production.
- [ ] Incognito: the production URL loads with no login wall.
- [ ] Decision Desk for 15 Jan at 09:00 shows run 07:30, forecast 278.6 GWh, P10 178.9 GWh,
      extra to procure 99.7 GWh.
- [ ] Changing date and cut-off updates the chart, run header and KPI tiles.
- [ ] Forecast Accuracy at 09:00 shows MAE 2,022.5 MW (or 2.02 GW) and n = 744; the horizon slider works.
- [ ] Deep link reload works: `<URL>/accuracy` and `<URL>/methodology` return the app, not a 404.
- [ ] `<URL>/api/health` returns `{"status":"ok"}`; `<URL>/api/meta` shows 1488 actuals and 19856 forecast points.
- [ ] Browser console has no errors; Network tab has no failed `/api` calls.
- [ ] Run the curl checks in `docs/DEPLOYMENT.md` §7.

## 5. Videos

- [ ] Part 1 (client pitch) recorded from `docs/VIDEO_SCRIPT_PART1_CLIENT.md`, at most 5:00.
- [ ] Part 2 (tech lead) recorded from `docs/VIDEO_SCRIPT_PART2_TECH.md`, at most 5:00.
- [ ] Total at most 10:00 (one video with both parts, or two clearly labelled videos).
- [ ] Uploaded to YouTube as **Unlisted** (not Private, which reviewers cannot open).
- [ ] Incognito: each video link plays without signing in.

## 6. README links

- [ ] Replace `<link to unlisted youtube video>` with the video URL.
- [ ] Replace `<Link to the app (e.g., vercel/heroku)>` with the production URL.
- [ ] Repo link is https://github.com/cryptasim/supreme-potato.
- [ ] Screenshots added under `docs/screenshots/` and embedded, or the TODO line removed.
- [ ] Commit and push the README change, then recheck the rendered README in incognito.

## 7. Submit the form (author)

- [ ] Fill in the submission form with the repo URL, the live app URL and the video URL(s).
- [ ] Before sending, open each pasted link once more in incognito.
