# Launchpad — Personal Project Dashboard

**Live:** https://ev-launchpad.vercel.app
**Repo:** https://github.com/keeltekool/ev-launchpad
**Type:** Static HTML/CSS/JS (zero dependencies, no build step) + one Vercel function (`api/health.js`)
**Last updated:** 2026-08-16

## Services

| Service | Purpose | Env vars |
|---------|---------|----------|
| Vercel | Static hosting, auto-deploy from GitHub | `SENTRY_AUTH_TOKEN` (used by `api/health.js`) |
| GitHub | keeltekool/ev-launchpad | — |
| Sentry | Error/traffic data for `/monitor` (org `bits-and-pixels-ou`, EU) | token in Vercel only |
| Anthropic RemoteTrigger | Fleet Doctor cloud routine | — |

No database, no auth.

## Fleet Doctor (autonomous monitoring agent)

Cloud routine `trig_01YTjYDs3ZzsGbu3cxrNQzKL` — Mon/Wed/Fri 03:30 UTC, model pinned `claude-sonnet-5` (hard rule: never Fable/Opus). Checks the 5 apps in `data/fleet.json` (Sentry via `/api/health` + HTTP/marker checks), commits `data/fleet-report.json` → auto-deploy renders the pane on `monitor.html`. Read-only, no autofix (v2). Alerts: GitHub issue on this repo only when RED (app down / genuinely NEW issue; first-appearance baseline never alerts). Plan + diagram: `docs/plans/fleet-doctor-v1.md`. Manage: `/schedule` or claude.ai/code/routines.

**Smoke test:** `curl -s https://ev-launchpad.vercel.app/data/fleet-report.json | node -e "JSON.parse(require('fs').readFileSync(0))"` + pane visible on `/monitor.html`.

## What it does

Dense visual grid dashboard for quick-access to all 45+ live projects. Each tile shows a screenshot thumbnail, project name, and clickable link chips (App, Admin, Landing, etc.). Includes live search filtering, dark/light mode toggle, and keyboard shortcuts (`/` to search, `Escape` to clear).

## Data model

Single JSON file (`data/projects.json`) — array of `{ name, image, links: [{ label, url }] }`. Order in JSON = order in grid.

## Sync workflow

`/launchpad` skill: fetches portfolio (egertv.vercel.app PROJECTS tab), diffs against projects.json, adds new entries, captures screenshots via Puppeteer, deploys.

## Gotchas

- Vercel URL alias: `ev-launchpad.vercel.app` (configured as project domain, auto-tracks prod)
- Screenshots captured at 1280x800 via Puppeteer headless — some apps with Clerk auth show login pages
- SÕEL slug becomes `s-el.png` (special chars stripped)
- Puppeteer not committed — install temporarily when re-capturing: `npm i puppeteer`, run script, uninstall

## Next phase

Project health dashboard: GitHub analytics, error monitoring, API failure tracking per project.
