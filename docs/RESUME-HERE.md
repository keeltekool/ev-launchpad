# Launchpad Evolution: Project Health Dashboard

## What exists now
- Static HTML/CSS/JS dashboard at `ev-launchpad.vercel.app`
- Dense grid of ~45 projects with screenshots, search, dark/light mode
- Zero dependencies, deployed via `vercel --prod` (no GitHub remote)
- Source: `C:\Users\Kasutaja\Claude_Projects\launchpad`

## What needs to happen
Evolve Launchpad into a Next.js app that shows **project health** alongside the existing grid. Add a "Health" tab/page that pulls error data from Sentry and deploy data from Vercel, showing per-project status.

## Sentry setup (DONE — all wired and live)

### Organization
- **Org slug:** `bits-and-pixels-ou`
- **Region:** EU (`de.sentry.io`)
- **Plan:** Developer (free) — 5K errors/month
- **Dashboard:** https://bits-and-pixels-ou.sentry.io

### Auth token (for API calls)
- **Token name:** `claude-code-full`
- **Token value:** stored in `C:\Users\Kasutaja\.env` as `SENTRY_AUTH_TOKEN`
- **Scopes:** event:read, event:write, org:read, project:admin, project:read, project:releases, project:write, team:read, team:write
- **DO NOT commit this token. Use env vars.**

### Sentry API base URL
```
https://de.sentry.io/api/0/
```
All API calls require header: `Authorization: Bearer <SENTRY_AUTH_TOKEN>`

### Projects with Sentry (6 total)

| Project | Sentry slug | DSN | App URL |
|---------|------------|-----|---------|
| Travel-Assist-Poland | `travel-assist-poland` | `https://0ed4e9948d62bddacf651b5f3310daaa@o4510963717439488.ingest.de.sentry.io/4511643914993744` | travel-assist-poland.vercel.app |
| Keeletark | `keeletark` | `https://bbc7f254d644d199248b7160dce5ebf9@o4510963717439488.ingest.de.sentry.io/4511644097970256` | keeletark.vercel.app |
| ApplyKit | `applykit` | `https://63eaa67c0cea400ff041748541b7eb08@o4510963717439488.ingest.de.sentry.io/4511644099674192` | cv-tailor-plus.vercel.app |
| SongDrop-app | `songdrop-app` | `https://abd604477dca7809db90af4f81027055@o4510963717439488.ingest.de.sentry.io/4511644084994128` | songdrop-app.vercel.app |
| HankeRadar | `hankeradar` | `https://1f7f6f4db36aa7e423def2661a54998d@o4510963717439488.ingest.de.sentry.io/4511644087943248` | hankeradar-alpha.vercel.app |
| Athlon | `athlon` | `https://c6d893231f6218fec33749beef9bdd6a@o4510963717439488.ingest.de.sentry.io/4511644089385040` | athlon.vercel.app |

### Sentry SDK installed in each project
Each project has:
- `sentry.client.config.ts` — client-side init with DSN
- `sentry.server.config.ts` — server-side init
- `sentry.edge.config.ts` — edge runtime init
- `instrumentation.ts` — Next.js instrumentation hook
- `app/global-error.tsx` or `src/app/global-error.tsx` — catches unhandled errors
- `next.config.ts` wrapped with `withSentryConfig` (org: `bits-and-pixels-ou`, project slug, tunnelRoute: `/sentry-tunnel`)
- Trace sample rate: 100% in dev, 10% in prod

### Useful Sentry API endpoints

**List all projects:**
```
GET /api/0/organizations/bits-and-pixels-ou/projects/
```

**Get project issues (errors):**
```
GET /api/0/projects/bits-and-pixels-ou/{project_slug}/issues/?query=is:unresolved&sort=date
```

**Get issue stats (error counts over time):**
```
GET /api/0/organizations/bits-and-pixels-ou/issues-stats/?project={project_id}&stat=received&resolution=1d
```

**Get project stats (event counts):**
```
GET /api/0/projects/bits-and-pixels-ou/{project_slug}/stats/?stat=received&resolution=1d&since={unix_timestamp}
```

### Sentry MCP server (also installed)
Added to `~/.claude.json` as `sentry` MCP server:
```
URL: https://mcp.sentry.dev/mcp/bits-and-pixels-ou
Transport: HTTP
```
Available in future Claude Code sessions for direct Sentry queries.

### Sentry CLI
- Installed globally: `sentry-cli` v3.6.0
- Auth via `SENTRY_AUTH_TOKEN` env var
- Can list projects: `sentry-cli projects list --org bits-and-pixels-ou`
- Cannot create projects on free plan (org setting blocks member project creation via API)

## Vercel API (for deploy status)

Vercel API can provide:
- Latest deployment time and status
- Build pass/fail
- Domain info

Base URL: `https://api.vercel.com`
Auth: `Authorization: Bearer <VERCEL_TOKEN>` (token in user's Vercel CLI auth, or create one at vercel.com/account/tokens)

**Get deployments:**
```
GET /v6/deployments?projectId={id}&limit=1&target=production
```

## What the Health Dashboard should show

Per project card (in the existing grid or a separate /health page):

| Signal | Source | API |
|--------|--------|-----|
| Status dot (green/yellow/red) | Sentry error count last 24h | project stats endpoint |
| Unresolved error count | Sentry issues | issues endpoint with `is:unresolved` |
| Last error timestamp | Sentry issues | issues endpoint sorted by date |
| Last deploy time | Vercel API | deployments endpoint |
| Build status (pass/fail) | Vercel API | deployments endpoint |

### Health status logic
- **Green:** 0 unresolved errors in last 7d
- **Yellow:** 1-5 unresolved errors
- **Red:** 6+ unresolved errors OR any error in last 1h

## Architecture recommendation

1. Convert Launchpad from static HTML to Next.js (minimal — keep the existing design)
2. Add a `/health` page (or tab toggle on main page)
3. API route `/api/health` that fetches from Sentry + Vercel APIs, caches in Neon
4. Vercel cron (every 15min or hourly) to refresh health data
5. Each project card gets a colored dot indicator
6. Click a card to see error details

### Tech stack
- Next.js (same as all other projects)
- Neon DB for caching health data (don't hit Sentry API on every page load)
- Vercel cron for periodic refresh
- Tailwind (match existing dark/light design)
- No auth needed (it's a personal dashboard)

## Files touched in this session

### Global
- `~/.env` — added `SENTRY_AUTH_TOKEN`
- `~/.claude.json` — added Sentry MCP server
- `~/.git-hooks/pre-commit` — global secret scanner hook
- `~/.claude/CLAUDE.md` — added regression test rule, read-before-write, smallest-diff, check-consumers, rollback-first, Playwright for E2E

### Per-project Sentry files (same pattern in all 6)
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- `app/global-error.tsx` or `src/app/global-error.tsx`
- `next.config.ts` / `next.config.mjs` (wrapped with withSentryConfig)
- `package.json` + `package-lock.json` (@sentry/nextjs added)

## Cleanup TODO
- Revoke old Sentry token `claude-code` (limited scopes, superseded by `claude-code-full`)
- Delete default `javascript-nextjs` project in Sentry (unused)
