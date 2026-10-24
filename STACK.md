# Launchpad: is anything of mine broken right now?

**Live:** https://ev-launchpad.vercel.app (passcode; a `?key=<passcode>` link sets a one-year cookie)
**Repo:** https://github.com/keeltekool/ev-launchpad (Vercel project `launchpad`, framework Next.js)
**Type:** Next.js 16.4.3 (App Router, Cache Components, Turbopack), Tailwind v4, Archivo
**Last updated:** 2026-10-23 (rebuilt from the old static tile wall; spec `SPEC.md`, product `PRODUCT.md`, look `DESIGN.md`, plan `docs/plans/2026-10-23-launchpad-rebuild-sentry.md`)

## Services

| Service | Purpose | Env vars |
|---------|---------|----------|
| Vercel | Hosting, auto-deploy from GitHub `master` | `SENTRY_AUTH_TOKEN` (org read token, production), `LAUNCHPAD_PASSCODE` (production + preview) |
| Sentry (org `bits-and-pixels-ou`, EU `de.sentry.io`) | Reads errors and issues for every project; Launchpad's own errors go to project `launchpad` | DSN hardcoded in `src/lib/report.ts` |

No database. Local: `vercel env pull .env.local --environment production`.

## How it works
- `data/apps.json`: the registry, `{ name, url, sentry?, status: live|dormant, links[] }` (67 apps). `url` is what gets health-checked; `sentry` is the Sentry project slug. Without it, a Sentry project named after the app (`slugOf`: "Käsilane" → `kasilane`) is the app's project, so wiring an app needs no Launchpad deploy.
- `src/app/page.tsx`: `getBoard()` is `'use cache'` with `cacheLife({ stale: 60, revalidate: 60, expire: 120 })`, streamed behind `<Suspense>`. It runs `getSentrySummary()` (`src/lib/sentry.ts`: project list, unresolved production issues over 7 d, production error counts for 24 h and 7 d; the junk projects `javascript-nextjs` and `keeletark` are hidden until the owner deletes them) and `checkApp()` (`src/lib/health.ts`) for every live app, then `buildBoard()` (`src/lib/board.ts`).
- `src/proxy.ts`: every route needs the cookie `lp_pass` (sha256 of the passcode). `/unlock` posts to `/api/unlock`. Fails closed without `LAUNCHPAD_PASSCODE`.
- `src/lib/report.ts`: Launchpad's own failures go to Sentry as a plain envelope POST (no SDK), from `src/instrumentation.ts` (`onRequestError`) and `src/app/global-error.tsx`. It sends only when `VERCEL_ENV` is `production`.
- Test seams, never set on Vercel: `SENTRY_API` (Sentry API base) and `LAUNCHPAD_EXTRA_APPS` (JSON entries appended to the registry). Only the fixture board in `check-ui-flows.mjs` sets them, and both are ignored when `VERCEL_ENV` is `production`.
- `scripts/sentry-proof.mjs <slug> <url>`: opens an app and waits for a production transaction in Sentry (PASS/FAIL).

## Checks
- `npm test`: board ordering and merge, 401/403 count as up, registry validity.
- `node scripts/check-ui-flows.mjs <url>`: passcode wrong/right, render time under 15 s, reload, entry, Sentry reachable, `/` search and Esc, Dormant, theme survives reload, a link chip matches the registry, no sideways scroll at 375, a 1920 screenshot. `ship.mjs` runs it.
- Against `http://localhost:4870` it also starts a fixture board from the local build (ports 4871 and 4872): a fake Sentry and three broken apps (one answers 500, one hangs, one refuses the connection). It asserts the Problems block, the 10 s cap on the render, junk projects hidden, and the "Sentry unreachable" line. Run `next build` first.

## Gotchas
- A `use cache` lifetime under 5 minutes is runtime data in Next 16: it must sit inside `<Suspense>`, or the build fails at prerender.
- Health check: GET with `Accept: text/html`, following redirects by hand up to 5 hops. A still-redirecting answer counts as up, because Clerk apps answer 404 to non-page requests and loop their cookie handshake without a cookie jar. 401/403 count as up.
- Sentry `stats_v2` cannot filter by environment. Per-project production error counts come from `events/?dataset=errors&field=project&field=count()&environment=production&environment=vercel-production&project=-1`, one call per period.
- A pulled `.env.local` holds `VERCEL_ENV=production`, so a local `next start` would report to Sentry. Start it with `VERCEL_ENV=development` in the process env (it wins over `.env.local`).
- Production on Vercel reports as environment `vercel-production`; the board accepts it and `production`.
- `npm install` on this machine can fail with ENOTEMPTY while VS Code watches `node_modules`; install in a separate folder and move `node_modules` in.

## Smoke test
`node ~/.claude/scripts/ship.mjs /` (verify-deploy on `/` lands on `/unlock`, then check-ui-flows logs in).
