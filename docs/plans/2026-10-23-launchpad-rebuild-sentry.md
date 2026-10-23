# Launchpad rebuild + Sentry for every live app: build plan

**Goal:** one passcode-gated page that shows which live app is down or throwing new errors, fed by a clean Sentry org that every live app reports to.
**Spec:** `launchpad/SPEC.md` (all sections).
**Stack:** Next.js 16.4.3, Tailwind v4, `@sentry/nextjs` 10.76.2 (v10 dist-tag; v11 exists, but a major upgrade across 30 apps is out of scope), Playwright for proofs. Sentry access: CLI `sentry` 0.47.0 (logged in as the owner) for org work; Vercel env `SENTRY_AUTH_TOKEN` for the page.

## Global constraints
- Sentry org `bits-and-pixels-ou`, API `https://de.sentry.io/api/0`, platform `javascript-nextjs`.
- Health check: GET, follow redirects, 10 s timeout. Page data cached 60 s; client auto-refresh every 5 min.
- "New error" = Sentry issue `firstSeen` within 24 h. "Down" = no 2xx/3xx within 10 s.
- Passcode cookie lasts 365 days. Theme key `launchpad-theme` (carried over).
- Sentry only on in production. No Sentry on SK E-Seal Prototype, Allekirjoitus Sales Tool or Saku Tenniseklubi (uptime only). SongDrop personal: never touched.
- Repo lock (parallel windows): `<repo>/.git/claude-lock`. If it is younger than 2 h, skip the repo and come back later. Pull before work. Take the lock in one guarded step (age check, then a noclobber write); never a bare `echo >` (23.10: that overwrote another session's fresh lock in market-watch).
- Athlon deploys with `vercel --prod` (sanctioned, no git-integration deploy).
- songdrop-app has no Vercel git integration either (every deployment is a CLI deploy; the last one is from 18.06). It deploys with `vercel --prod` from `web/` after the commit is pushed. Its first deploy here also ships the undeployed 28.06–01.07 commits: the Sentry setup, a favicon set and a branded 404 page.

## Phase 1: clean Sentry, and the 9 existing projects verified working
- [ ] **Task 1.1: delete junk projects.** `sentry project delete bits-and-pixels-ou/javascript-nextjs -y` and the same for `keeletark`. Done when: `sentry project list bits-and-pixels-ou/ --json` shows neither.
- [x] **Task 1.2: write the standard.** `launchpad/docs/SENTRY-STANDARD.md` (create) holds the exact file set, `Sentry.init` options and `withSentryConfig` options, taken from the docs check (Context7, current `@sentry/nextjs`). It replaces the setup section of `POSTMORTEM-SENTRY-SETUP.md`, which stays as history. Done when: every later wiring task can be done by copying from it.
- [x] **Task 1.3: proof script.** `launchpad/scripts/sentry-proof.mjs <slug> <url>` (create).
  - Opens `<url>` in Playwright Chromium and records the visit time.
  - Polls `sentry api` (org events, project `<slug>`, environment `production` or `vercel-production`) until a transaction newer than the visit arrives, with a 180 s timeout.
  - Prints `PASS <slug> <ms>` or `FAIL <slug> <reason>`, exit code 0 or 1.
  - Deviation (23.10): transactions live in `dataset=spans` with `is_transaction:true`; `dataset=transactions` returns nothing. On Vercel the SDK names the environment `vercel-production`, so both names count as production. Ingest delay seen: ~90 s. Until Phase 2 adds a `package.json`, the script falls back to the Playwright in `~/.claude/scripts`.
- [ ] **Task 1.4: bring hinnavaht, keepr and market-watch to the standard.** Repos: `Claude_Projects/<repo>`. Hinnavaht and Keepr get `instrumentation.ts`, server and edge init. Market Watch gets its Sentry project (`sentry project create`) and a hardcoded DSN. All three become production-only. One repo at a time: lock, edit, build, commit, push, `ship.mjs /`, then `sentry-proof`.
  - 23.10: hinnavaht `cac33f2` PASS, keepr `5531855` PASS (both now send `http.server` transactions). market-watch: Sentry project created (DSN in `242356f`), but its `check-ui-flows` failed 4/141 with Sentry on (Top 10 not persisting, Pause and Run now timing out) and passed 141/141 after the revert `3bf5349`, so it is live without Sentry. Cause not found yet; find it before re-applying.
- [ ] **Task 1.5: production-only switch on the rest.** cv-tailor-plus (`applykit`; also delete its dead root-level init files, since `src/` ones win), category-pro, athlon, hankeradar, Travel-Assist-Poland, songdrop-app/web (`songdrop-app`). Same per-repo loop. Each app's init options become the standard's (hardcoded DSN, production only, `tracesSampleRate: 1.0`): at a lower rate one proof visit can send no transaction at all.
  - 23.10 PASS: applykit `d8e06df`, category-pro `fa6926f`, hankeradar `7410f5b` (its root init files were dead too; moved to `src/`), travel-assist-poland `1d9b0ea`, songdrop-app `a3c9504` (first Sentry data ever). Athlon not done (another session was running its tests). Still to do: hinnavaht, keepr and applykit import `withSentryConfig` from `@sentry/nextjs`, which is deprecated (see the standard); switch them to `@sentry/nextjs/config`.
  - 23.10 owner, after this: "the currrent list of sentry apps is not bible, I am not intetrtestred in volume ... i am intetrested in getting sentriy actually useful and the launchpad actually useful". Finding: in the last 14 d Sentry holds 3 unresolved issues, all from local dev (`javascript-nextjs`), and none from production. Proposed reset, waiting for the owner's go: a short app list chosen by real use; report the failures the apps swallow (API try/catch, crons, scrapers, outside APIs) and prove each one by triggering it and getting the email; alerts; then the Launchpad page. It would replace the rest of Phase 1 and all of Phase 3.
  - ApplyKit (23.10): `src/instrumentation.ts` imports the root `sentry.server/edge.config.ts`, so those are live; the dead ones are root `instrumentation.ts` and `instrumentation-client.ts`. All four root files go, the server and edge configs move to `src/`.
## Reset (owner go 23.10: "Yes yes to allll!")
Replaces Task 1.6, Gate 1 and Phase 3. Phase 2 (Launchpad) runs after Phase R2 and is built for the watched list. Tasks 1.1–1.5 stay as the record of what shipped.
- Deviation (23.10, recorded after the Gate 2 review): Phase 2 was built before R1.1 was confirmed and before R2 finished, following the owner's reset item "the Launchpad page before more wiring". The registry has no watched flag: an app counts as watched once its real failures reach Sentry with a proven alert (R2.1), and its row shows its Sentry errors. Overnight 23.10–24.10 the owner asked for work with "zero my involvement", so the proposed list in R1.1 is the working list until the owner edits it.

### Phase R1: the watched list
- [ ] **R1.1: propose the list from data, owner confirms or edits.** Signals: Vercel requests over the last 23 h without headless Chromium (`vercel metrics vercel.request.count -p <project> --since 23h --filter 'NOT clientUserAgent:*HeadlessChrome*'`; Hobby allows only ~24 h, one project per query), Sentry real-browser pageloads over 30 d, and what each app runs unattended (crons, agents, scrapers, outside APIs). Browser history is not used (blocked as personal data). Done when: the owner's confirmed list is written here.
  - Proposed 23.10, NOT yet confirmed by the owner (requests over 24 h without headless): Keepr 1415 (done), Käsilane 346, Keila Leht Ultra 193, Tube_Heureka 147, ApplyKit 139, Mini Me 131, Livery 85, Athlon 65, VAIB 47, Market Watch 36 (Sentry on, catch sites not done), Hinnavaht 13 (done; polls and digests run twice a day). Everything else gets uptime only on Launchpad. HOOG (`event-radar`, 151) and SOEL (101) are crawlers and crons (HOOG unchanged since March, SOEL dormant).

### Phase R2: real failures reach Sentry, per watched app
- [ ] **R2.1: per app, one repo at a time (repo lock as above).**
  1. Inventory where the app swallows failures: API route `catch` blocks that return an error response or only log, cron/poll/scrape jobs, outside API calls (AI, email, scrapers, payment).
  2. Report each one with `Sentry.captureException(err, { tags: { area: "<route or job>" } })` at that spot. Failures only; nothing else gets reported.
  3. The app's Sentry wiring follows the standard (projects that don't exist yet get created).
  4. Alert rule: new issue → email, regressed issue → email (`sentry alert issues create`, flags from `--help`).
  5. Proof: trigger one real handled failure in production without touching real data. The issue arrives with its `area` tag, and the rule's fire history (`sentry api projects/<org>/<slug>/rules/<id>/group-history/`) shows the email was sent.
  - [x] Keepr `5747c64`: 11 catch sites report (lost scans in `after()`, digest and push sends, Selver/OFF/Haiku/R2, a 5xx from `/api/scan`, the offline flush, push subscribe). Alert workflow 1410266. Proof: KEEPR-3 from a malformed upload, alert fired 19:02Z, then resolved. Server SDK removed again (it broke the locked scan benchmark, Keepr DEVIATIONS §10, which the 1.4 pass missed); replaced by `src/lib/report.ts` (see the standard).
  - [x] Hinnavaht `8fb6c03`: same server-SDK reversal (its SPEC §310 rules the server SDK out). Reports from the poll fetch and self-heal, Selver rows without a price (now skipped instead of written as 0.00), unreadable Barbora and Rimi PDPs (one report per run with counts; a 404 stays quiet), resolver errors, digest push and Resend failures or a missing key, scan `after()`, Haiku, and client 5xx/offline-flush/push-subscribe. Alert workflow 1410349. Proof: HINNAVAHT-1 from a NUL-byte theme PATCH as the Clerk test user (no write); alert fired 19:23Z; resolved.
  - market-watch: the 4/141 flow failures were the test's own `saved()` matcher catching Sentry's ingest POST (`…/api/<id>/envelope/`). Fixed in `7bb5040`; with Sentry re-applied, 141/141. Its catch sites are not done yet.
- **Gate R2:** every watched app has a triggered issue and a fired alert on record; build, `ship.mjs`, and `code-reviewer` on each app's diff.

- [ ] **Task 1.6 (superseded by R2.1 step 4): alert rules.** For each project: if `sentry alert issues list` shows no rule, create one: `sentry alert issues create bits-and-pixels-ou/<slug> --name "New issue → email"` with the first-seen condition and an email action to the owner (exact flags from `sentry alert issues create --help`).

**Gate 1:** `sentry-proof` PASS for all 9 projects. `sentry project list` shows only real apps, and each one lists exactly one alert rule. Every repo builds and is shipped and verified by `ship.mjs`. `code-reviewer` runs on the phase's commits per repo (inputs: repo paths, SPEC.md, this plan, commit ranges). Owner sees: Sentry with only real apps and data from production only.

## Phase 2: Launchpad rebuilt
- [x] **Task 2.1: scaffold in place on branch `rebuild`.** Installed: `next` 16.4.3, react 19.3.0 (23.10). `create-next-app` (TypeScript, App Router, Tailwind v4, `src/`). Delete the old static app: `index.html`, `monitor.html`, `js/`, `css/`, `api/`, `screenshots/`, `data/fleet*.json`, `data/projects.json` (after 2.2). Pin the exact `next` version in this plan line once installed.
- [x] **Task 2.2: registry.** 67 apps, 33 live, 10 with Sentry (23.10, Launchpad included). `data/apps.json` (create): `AppEntry = { name: string; url: string; sentry?: string; status: "live" | "dormant"; links: { label: string; url: string }[] }`. Seed it from the old `projects.json` (47 entries, links unchanged), add the live apps missing from it (global STACK.md Projects table), and set `status` from MEMORY.md "Active projects" versus Dormant. Unit check: every entry has a valid `url`, and slugs are unique.
- Caching: a fresh Next 16 app has Cache Components on, so `export const revalidate` errors at build. Use `'use cache'` + `cacheLife({ stale: 60, revalidate: 60, expire: 120 })` (deviation: the `minutes` preset expires after 1 h, so a rare visitor would get hour-old status).
- [x] **Task 2.3: Sentry data.** Deviations (23.10): returns `{ ok, bySlug }`; four calls, because `stats_v2` grouped by project answers totals only, so 24 h and 7 d are separate calls. Real call verified. `src/lib/sentry.ts`: `getSentrySummary(): Promise<Record<string, { errors24h: number; errors7d: number; newIssue24h: boolean; newest?: { title: string; url: string; lastSeen: string } }>>`. It makes three org-level calls: project list, unresolved issues over 7 d across all projects, and `stats_v2` errors grouped by project. A failure returns `{}` and sets a "Sentry unreachable" banner flag; the page still renders.
- [x] **Task 2.4: health check.** `src/lib/health.ts`: `checkApp(url: string): Promise<{ up: boolean; status: number | null; ms: number }>`, run in parallel for live apps only.
- [x] **Task 2.5: board logic.** `node --test src/lib/board.test.mts` 5/5 (also covers 401/403 = up and the registry check). `src/lib/board.ts`: `buildBoard(apps: AppEntry[], sentry, health): { problems: Row[]; live: Row[]; dormant: AppEntry[]; checkedAt: string }` with the spec's ordering, and with Sentry projects missing from the registry added as live rows. Unit test (pure ordering and merge logic): `src/lib/board.test.ts`, run with `node --test`.
- [x] **Task 2.6: the page.** Direction (impeccable, seed 1cb1cdf8): Bridge Watch Log, the assigned card; the decision page closed unanswered twice, so it was built unattended. The board streams behind `<Suspense>`, since a cache lifetime under 5 min is runtime data in Next 16. Health check deviation: GET as a page load (`Accept: text/html`), redirects followed by hand up to 5 hops; a still-redirecting answer counts as up. Clerk apps answer 404 to non-page requests and loop their cookie handshake without a cookie jar (Category PRO showed a false "down"). `src/app/page.tsx` (server, 60 s cache) plus `src/app/board-client.tsx` (search with `/` and Esc, Dormant collapse, theme toggle, 5-min refresh). **Design:** run the `impeccable` skill's design path first (CLAUDE.md §4). Mobile first, with real desktop composition at 1440 and 1920.
- [x] **Task 2.7: passcode.** The cookie holds sha256 of the passcode; it fails closed when `LAUNCHPAD_PASSCODE` is unset. Env set in Vercel production and preview plus `.env.local`. `src/proxy.ts` (Next 16 name; confirmed by the docs check) plus `src/app/unlock/page.tsx`. It reads env `LAUNCHPAD_PASSCODE`; a matching form post or `?key=` sets an httpOnly cookie for 365 d. Without the cookie, every route redirects to `/unlock`.
- [x] **Task 2.8: Sentry on Launchpad itself.** Project `launchpad` with alert workflow 1410455. The no-SDK reporter (`src/lib/report.ts`) is wired to `onRequestError` and `global-error.tsx`, so there is no npm install (npm reify fails on this machine while files are watched). Launchpad is in the registry.
- [x] **Task 2.9: `scripts/check-ui-flows.mjs`** (create). 26/26 locally (23.10), plus the logged-out journey and the `?key=` link. Runs at 375 and 1440:
  - a wrong passcode is rejected, and the right one unlocks
  - after a reload the page is still unlocked
  - the Problems block or the all-clear line renders
  - `/` focuses search, typing filters the rows, and Esc clears it
  - Dormant expands
  - the theme toggle survives a reload
  - a link chip's href matches the registry
  - there is no horizontal scroll at 375
  - a 1920 screenshot is taken

**Gate 2:** clean build; `node --test` for board logic; `check-ui-flows.mjs` passes against the production URL after `ship.mjs`; `code-reviewer` on the `rebuild` branch diff. The branch merges to `master` and ships.
- Gate 2 fixes (23.10, review `docs/reviews/2026-10-23-phase2-gate.md`): honest headline when Sentry is unreachable; junk Sentry projects hidden; production-only error counts (`events/` with `dataset=errors`, since `stats_v2` cannot filter by environment); `report()` gated on `VERCEL_ENV`; a timeout vs a failed connection told apart. `check-ui-flows.mjs` now measures the render time, checks that Sentry is reachable, and on a local run starts a fixture board (fake Sentry plus an app answering 500 and one that hangs) that asserts the Problems block, the 10 s cap and the "Sentry unreachable" line: 46/46 locally. Owner sees: the new Launchpad at ev-launchpad.vercel.app.

## Phase 3: every other live app reports to Sentry (dropped by the 23.10 reset; apps off the watched list get uptime only)
- [ ] **Task 3.1:** for each of these: prindipesa, mindloop, idea-radar, livery, vaib, vaib-x, skill4win, build-in-sight, spordipaev, career-recall-standard (`career-recall`), radar-check, eudi-wallet-tracker, scrapyard, lonkero-cruise-hki, loop-control-center, keila-leht-ultra, tube-heureka, iphone-converter (`fileshift`, static export: client init only), kasilane, mini-me.
  1. Lock the repo.
  2. `sentry project create bits-and-pixels-ou/<slug>:javascript-nextjs`.
  3. Wire it per the standard, build, commit, push, `ship.mjs /`.
  4. `sentry-proof` the app, create its alert rule, and set the `sentry` field in `apps.json`.

  Tick each app here as it passes.

**Gate 3:** `sentry-proof` PASS for every app in 3.1. Launchpad shows each one with Sentry numbers and none marked "no Sentry". `code-reviewer` on the union of the phase's commits. Owner sees: every live app on Launchpad with live status and errors.

## Phase 4: finish
`node ~/.claude/scripts/review.mjs` with a response to every finding; `/simplify`; ship; CLAUDE.md §2 verification; `/wrap-up` (Launchpad STACK.md, global STACK.md, memory `project_launchpad`).

## Review focus
- Sentry API down or token expired: the page must still show health checks and say Sentry is unreachable (Task 2.3 flag; check-ui-flows covers it by running against a bad token in a preview env).
- A slow app holding up the whole page: the parallel 10 s timeout caps the render (Task 2.4). Check the total render time in Gate 2.
- An app that blocks bots or needs a login returns 401/403. A 401/403 counts as "up" (the server answered). This is decided in `checkApp`, covered by the unit test.
- Error titles holding personal data are behind the passcode (Task 2.7 flow).
- Sentry quota: production-only plus a transaction sample rate from the standard. Check usage on the billing page after Phase 3.

## Out of scope
Fleet Doctor, screenshots, Vercel deploy status, GitHub stats, paid Sentry features, Sentry uptime monitors.
