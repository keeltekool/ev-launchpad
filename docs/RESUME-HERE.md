# Launchpad — Resume Here

## Current state (2026-06-29)

### Monitor page: LIVE at ev-launchpad.vercel.app/monitor
- 6 projects tracked with real Sentry data (requests, errors, sparklines)
- Auto-refreshes every 5 min
- Cards show "Requests this week" as hero number, not Sentry jargon

### Working projects (Sentry SDK installed + verified)
| Project | Slug | Status |
|---------|------|--------|
| Keeletark | `keeletark` | GREEN, data flowing |
| ApplyKit | `applykit` | GREEN, 44 requests/7d |
| HankeRadar | `hankeradar` | GREEN, 25 requests/7d |
| Travel-Assist-Poland | `travel-assist-poland` | GREEN, 6 requests |
| Athlon | `athlon` | GREEN, 6 requests |
| SongDrop-app | `songdrop-app` | Dormant (no visits yet) |

### What's left: add more projects to monitoring

**Blocker:** Can't create Sentry projects via API (free plan locks "Let Members Create Projects"). Must create manually in Sentry dashboard.

**Steps per project:**
1. Create project at https://bits-and-pixels-ou.sentry.io/projects/new/ (Platform: Next.js, Team: bits-and-pixels-ou)
2. Copy the DSN
3. Add these files to the project (see POSTMORTEM-SENTRY-SETUP.md for exact content):
   - `instrumentation-client.ts` — client init with DSN, `tracesSampleRate: 1.0`
   - `sentry.server.config.ts` — server init with DSN
   - `sentry.edge.config.ts` — edge init with DSN
   - `instrumentation.ts` — Next.js hook importing server + edge configs
   - `app/global-error.tsx` or `src/app/global-error.tsx` — error boundary
4. Wrap `next.config.ts` with `withSentryConfig` (NO `tunnelRoute`)
5. `npm install @sentry/nextjs`
6. Commit, push (GitHub auto-deploys to Vercel)
7. Add slug to `api/health.js` PROJECTS array in Launchpad

**24 projects ready to add** — full list with slugs in POSTMORTEM-SENTRY-SETUP.md cheat sheet and in the conversation from 2026-06-29.

### Correct Sentry setup (Next.js 16 + @sentry/nextjs v10)
- Client init: `instrumentation-client.ts` (NOT `sentry.client.config.ts` — that's v7)
- NO `tunnelRoute` in withSentryConfig (broken on Turbopack)
- `tracesSampleRate: 1.0` for low-traffic personal projects
- Health API uses dual-window: `interval=1h` (24h, live today) + `interval=1d` (7d, sparkline)
- Full details: `docs/POSTMORTEM-SENTRY-SETUP.md`

### Sentry org
- Org: `bits-and-pixels-ou` (EU, de.sentry.io)
- Plan: Developer (free) — 5K errors, 10K transactions, 5M spans/month
- Current usage: ~15 errors, ~350 transactions, ~1K spans (nowhere near limits)
- Auth token: `SENTRY_AUTH_TOKEN` in `~/.env` + Vercel Launchpad env vars
- Dashboard: https://bits-and-pixels-ou.sentry.io

### GitHub repos
All projects on GitHub with Vercel auto-deploy. Travel-Assist-Poland and Athlon repos were created this session (were missing before).
