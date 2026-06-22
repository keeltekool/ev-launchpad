# Launchpad — Personal Project Dashboard

**Live:** https://ev-launchpad.vercel.app
**Repo:** https://github.com/keeltekool/ev-launchpad
**Type:** Static HTML/CSS/JS (zero dependencies, no build step)
**Last updated:** 2026-06-22

## Services

| Service | Purpose |
|---------|---------|
| Vercel | Static hosting, auto-deploy from GitHub |
| GitHub | keeltekool/ev-launchpad |

No database, no auth, no API keys, no env vars.

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
