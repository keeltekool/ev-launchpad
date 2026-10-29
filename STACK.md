# Launchpad: is anything of mine broken right now?

**Live:** https://ev-launchpad.vercel.app (passcode; a `?key=<passcode>` link sets a one-year cookie)
**Repo:** https://github.com/keeltekool/ev-launchpad (Vercel project `launchpad`, framework Next.js)
**Type:** Next.js 16.4.3 (App Router, Cache Components, Turbopack), Tailwind v4, Archivo
**Last updated:** 2026-10-30 (Cloud routines section, plan `docs/plans/2026-10-30-cloud-routines.md`; 2026-10-29: Web agents section, plan `docs/plans/2026-10-29-web-agents.md`; 2026-10-28: late scheduled jobs, last heard / silent, code locations in prompts; earlier: 2026-10-23 rebuilt from the old static tile wall; spec `SPEC.md`, product `PRODUCT.md`, look `DESIGN.md`, plan `docs/plans/2026-10-23-launchpad-rebuild-sentry.md`)

## Services

| Service | Purpose | Env vars |
|---------|---------|----------|
| Vercel | Hosting, auto-deploy from GitHub `master` | `SENTRY_AUTH_TOKEN` (org read token, production), `LAUNCHPAD_PASSCODE` (production + preview) |
| Sentry (org `bits-and-pixels-ou`, EU `de.sentry.io`) | Reads errors and issues for every project; Launchpad's own errors go to project `launchpad`; Managed Agents traces in project `claude-agents` (id 4512341431550032), fed by the Claude Console OTel destination "Sentry claude-agents" (metadata only, all workspaces) | DSN hardcoded in `src/lib/report.ts` |

No database. Local: `vercel env pull .env.local --environment production`.

## How it works
- `data/apps.json`: the registry, `{ name, url, sentry?, status: live|dormant, links[] }` (67 apps). `url` is what gets health-checked; `sentry` is the Sentry project slug. Without it, a Sentry project named after the app (`slugOf`: "Käsilane" → `kasilane`) is the app's project, so wiring an app needs no Launchpad deploy.
- `src/app/page.tsx`: `getBoard()` is `'use cache'` with `cacheLife({ stale: 60, revalidate: 60, expire: 120 })`, streamed behind `<Suspense>`. It runs `getSentrySummary()` (`src/lib/sentry.ts`: project list, every production issue over 7 d with an empty `query=` so resolved ones come too, and each issue's `area` tag from `events/?dataset=errors&field=issue.id&field=area`; the junk projects `javascript-nextjs` and `keeletark` are hidden until the owner deletes them) and `checkApp()` (`src/lib/health.ts`) for every live app, then `buildBoard()` (`src/lib/board.ts`).
- Late jobs (27.10): live apps with `jobs` in the registry (Keila Leht Ultra, Hinnavaht, Keepr) get `checkJobs()` (`src/lib/health.ts`) on the same pass. The answer is validated at that boundary; `isLate()` in `board.ts` makes a red "late" problem with its own copied prompt (`latePrompt`). Market Watch has none on purpose: its hunts are a manual loop, judged by runs, not days.
- Last heard from (27.10): `sentry.ts` also reads the newest error and the newest timing span per project over 14 d (`events/?dataset=errors|spans&field=project&field=max(timestamp)`, any environment; each optional). A watched app that has sent timings before (`firstTransactionEvent`) and nothing in 14 d reads "Silent". Apps on the light reporter send errors only, so for them silence is normal and only "last heard from" shows. Server-SDK apps get a span from Launchpad's own health check, so for them "last heard" proves the SDK pipe works, not that users came.
- Web agents (29.10): `src/lib/agents.ts` reads three 7-day span queries in `claude-agents` (turns by `gen_ai.agent.name`, failed steps by thread, tokens) on the same pass; registry `agents: [names]` maps agents to apps (Keila Leht Ultra, Pocket Clone). A failed turn in 24 h is a red "agent failed" problem with its own prompt (`agentPrompt`); failed tool/model steps show in ink. `claude-agents` is hidden from Watched.
- Cloud routines (30.10): each active routine runs in its own cloud environment `routine-<slug> (traced)` that exports Claude Code traces (beta env vars, `OTEL_RESOURCE_ATTRIBUTES=routine.name=<slug>`) to Sentry project `claude-routines` (id 4512341673771088). `src/lib/routines.ts` reads runs (`claude_code.interaction` per `ccr.session.id`, 14 d) and failures (`has:routine.name span.status:error`); registry `routines: [{ name, trigger, label, lateAfterHours? }]`. Red: a failed run in 24 h, or late past `lateAfterHours` (from `TRACED_SINCE` at the earliest). A new routine needs its own tagged environment (copy one via the web app's environment API, then point the routine's `job_config.ccr.environment_id` at it) plus a registry line.
- `src/proxy.ts`: every route needs the cookie `lp_pass` (sha256 of the passcode). `/unlock` posts to `/api/unlock`. Fails closed without `LAUNCHPAD_PASSCODE`.
- `src/lib/report.ts`: Launchpad's own failures go to Sentry as a plain envelope POST (no SDK), from `src/instrumentation.ts` (`onRequestError`) and `src/app/global-error.tsx`. It sends only when `VERCEL_ENV` is `production`.
- Test seams, never set on Vercel: `SENTRY_API` (Sentry API base) and `LAUNCHPAD_EXTRA_APPS` (JSON entries appended to the registry). Only the fixture board in `check-ui-flows.mjs` sets them, and both are ignored when `VERCEL_ENV` is `production`.
- `scripts/sentry-proof.mjs <slug> <url>`: opens an app and waits for a production transaction in Sentry (PASS/FAIL).

## Checks
- `npm test`: board ordering and merge, 401/403 count as up, registry validity, late jobs and the last-ran boundary, last heard / silent, stack frames.
- `node scripts/check-ui-flows.mjs <url>`: passcode wrong/right, render time under 15 s, reload, entry, Sentry reachable, Sentry and uptime-only apps apart, no ms column, a Sentry button per watched app, Copy for Claude Code (reads the clipboard), `/` search and Esc, Dormant, theme survives reload, a link chip matches the registry, no sideways scroll at 375, a 1920 screenshot. `ship.mjs` runs it.
- Against `http://localhost:4870` it also starts a fixture board from the local build (ports 4871 and 4872): a fake Sentry (a new open issue with an area, a resolved one, a junk project) and three broken apps (one answers 500, one hangs, one refuses the connection). It asserts the Problems block, the copied prompts for an error (with its `Code:` location) and a down app, a late job (and its prompt) next to an on-time one, a silent and a quiet app, the Sentry button URL, the resolved detail line, the 10 s cap on the render, junk projects hidden, and the "Sentry unreachable" line. Run `next build` first.
- `data/apps.json` `repo`: the folder under `C:\Users\Kasutaja\Claude_Projects\` that the copied prompt names; the unit test fails if a live app has none.

## Gotchas
- A `use cache` lifetime under 5 minutes is runtime data in Next 16: it must sit inside `<Suspense>`, or the build fails at prerender.
- Health check: GET with `Accept: text/html`, following redirects by hand up to 5 hops. A still-redirecting answer counts as up, because Clerk apps answer 404 to non-page requests and loop their cookie handshake without a cookie jar. 401/403 count as up.
- Sentry `stats_v2` with `groupBy=project` answers totals only, no time series (any interval): no use for "last heard". Use `events/?field=max(timestamp)` per dataset (spans: epoch seconds; errors: ISO).
- Sentry `stats_v2` cannot filter by environment. Per-project production error counts come from `events/?dataset=errors&field=project&field=count()&environment=production&environment=vercel-production&project=-1`, one call per period.
- A pulled `.env.local` holds `VERCEL_ENV=production`, so a local `next start` would report to Sentry. Start it with `VERCEL_ENV=development` in the process env (it wins over `.env.local`).
- Production on Vercel reports as environment `vercel-production`; the board accepts it and `production`.
- Two tables share the `ledger` class (Watched, Web agents): flow checks for one section select through `section[aria-labelledby=watched|agents]`, never bare `table.ledger`.
- A `next start` left on 4870 keeps serving the old build after a rebuild (stale chunks answer 500, flows fail oddly): stop the process on the port first; TaskStop on `npx` leaves the node child running.
- `npm install` on this machine can fail with ENOTEMPTY while VS Code watches `node_modules`; install in a separate folder and move `node_modules` in.

## Smoke test
`node ~/.claude/scripts/ship.mjs /` (verify-deploy on `/` lands on `/unlock`, then check-ui-flows logs in).
