# Launchpad: is anything of mine broken right now?

**Live:** https://ev-launchpad.vercel.app (passcode; a `?key=<passcode>` link sets a one-year cookie)
**Repo:** https://github.com/keeltekool/ev-launchpad (Vercel project `launchpad`, framework Next.js)
**Type:** Next.js 16.4.3 (App Router, Cache Components, Turbopack), Tailwind v4, Archivo
**Last updated:** 2026-10-23 (rebuilt from the old static tile wall; spec `SPEC.md`, product `PRODUCT.md`, look `DESIGN.md`, plan `docs/plans/2026-10-23-launchpad-rebuild-sentry.md`)

## Services

| Service | Purpose | Env vars |
|---------|---------|----------|
| Vercel | Hosting, auto-deploy from GitHub `master` | `SENTRY_AUTH_TOKEN` (org read token, production), `LAUNCHPAD_PASSCODE` (production + preview) |
| Sentry (org `bits-and-pixels-ou`, EU `de.sentry.io`) | Reads errors and issues for every project; Launchpad's own errors go to project `launchpad` (alert workflow 1410455) | DSN hardcoded in `src/lib/report.ts` |

No database. Local: `vercel env pull .env.local --environment production`.

## How it works
- `data/apps.json`: the registry, `{ name, url, sentry?, status: live|dormant, links[] }` (67 apps). `url` is what gets health-checked; `sentry` is the Sentry project slug.
- `src/app/page.tsx`: `getBoard()` is `'use cache'` with `cacheLife({ stale: 60, revalidate: 60, expire: 120 })`, streamed behind `<Suspense>`. It runs `getSentrySummary()` (`src/lib/sentry.ts`: project list, unresolved production issues over 7 d, error totals for 24 h and 7 d) and `checkApp()` (`src/lib/health.ts`) for every live app, then `buildBoard()` (`src/lib/board.ts`).
- `src/proxy.ts`: every route needs the cookie `lp_pass` (sha256 of the passcode). `/unlock` posts to `/api/unlock`. Fails closed without `LAUNCHPAD_PASSCODE`.
- `src/lib/report.ts`: Launchpad's own failures go to Sentry as a plain envelope POST (no SDK), from `src/instrumentation.ts` (`onRequestError`) and `src/app/global-error.tsx`.
- `scripts/sentry-proof.mjs <slug> <url>`: opens an app and waits for a production transaction in Sentry (PASS/FAIL).

## Checks
- `npm test`: board ordering and merge, 401/403 count as up, registry validity.
- `node scripts/check-ui-flows.mjs <url>`: passcode wrong/right, reload, entry, `/` search and Esc, Dormant, theme survives reload, a link chip matches the registry, no sideways scroll at 375, a 1920 screenshot. `ship.mjs` runs it.

## Gotchas
- A `use cache` lifetime under 5 minutes is runtime data in Next 16: it must sit inside `<Suspense>`, or the build fails at prerender.
- Health check: GET with `Accept: text/html`, following redirects by hand up to 5 hops. A still-redirecting answer counts as up, because Clerk apps answer 404 to non-page requests and loop their cookie handshake without a cookie jar. 401/403 count as up.
- Sentry `stats_v2` grouped by project returns totals only (no series), so 24 h and 7 d are separate calls.
- Production on Vercel reports as environment `vercel-production`; the board accepts it and `production`.
- `npm install` on this machine can fail with ENOTEMPTY while VS Code watches `node_modules`; install in a separate folder and move `node_modules` in.

## Smoke test
`node ~/.claude/scripts/ship.mjs /` (verify-deploy on `/` lands on `/unlock`, then check-ui-flows logs in).
