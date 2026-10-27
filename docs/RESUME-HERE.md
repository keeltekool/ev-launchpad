# Launchpad + Sentry: RESUME HERE

> **28.10.2026: the six loose ends below are DONE and shipped** (record: plan "Loose ends", docs/reviews/2026-10-28-0005-finish.md). Open owner items: memory project_launchpad. Do not redo the "Undone" list.

> Fresh-session entry point. Read top to bottom, then the "Read next" files in order.
> Settled decisions are settled: do not re-ask, do not re-litigate. Updated 27.10.2026.

## State
- Prod: https://ev-launchpad.vercel.app (passcode: `LAUNCHPAD_PASSCODE` in `.env.local` and Vercel env; the owner knows it; it is compared after NFC normalisation; a `?key=` link or the form sets a one-year cookie). Repo keeltekool/ev-launchpad, branch `master`, last commit is the handoff commit on top of `2195c7c`. Tree clean, nothing unpushed in any of the 11 repos touched (checked 27.10).
- Gates: Gate 2 passed (production check-ui-flows 40/40 on 24.10). Task 2.10 ("the board for use") shipped and reviewed (`docs/reviews/2026-10-24-board-for-use.md`, every finding answered). Gate R2: 8 apps proven (see below).
- Where we stopped: the owner approved finishing the loose ends (below, "Next mission") and asked for this handover because the context was full. No loose-end code has been started.

## What this project is (30 seconds)
Launchpad is the owner's single passcode-gated page that answers "is anything of mine broken right now?" for 33 live web apps: a server-side health check per app merged with that app's Sentry errors, plus one-click open. The Sentry half makes Sentry catch the failures the apps used to swallow. The owner's goal now, verbatim 27.10: improving Sentry surveillance and monitoring "is the sole thing I'm interested in improving".

## Current state — done / undone

### Done
| Area | What |
|---|---|
| Launchpad page | Problems first (down, new error in 24 h, an error that came back), each with "Copy for Claude Code", Sentry, Open. "Watched by Sentry" ledger (15 apps): latest error in exact text, "N× · age · open/came back/resolved/archived · area", Sentry button to the app's issue list. "Uptime only" compact list (18), red when down, "slow" past 3 s. No ms column, no bare counts. |
| Copy for Claude Code | `src/lib/prompt.ts`: repo folder, issue, link, `sentry api …/events/latest/` line; error text fenced as data (prompt-injection guard); asks for a proposed fix, never a ship. |
| Data | `src/lib/sentry.ts`: 3 org calls (projects, all-status issues over 7 d with `lifetime.count`/`substatus`, area per issue from `events/`). `data/apps.json` has `repo` for every live app and explicit `sentry` slugs. Name-match fallback: a project named after the app (`slugOf`) attaches without a deploy. Junk slugs `javascript-nextjs`, `keeletark` hidden (`RETIRED`, ponytail). |
| Checks | `npm test` 12/12; `scripts/check-ui-flows.mjs` 68 locally (fixture board: fake Sentry, apps answering 500 / hanging / refusing, a came-back issue, copied prompts, Sentry URL) and 40 against prod. |
| Sentry real-failure reporting (R2) | Proven in production (issue arrived, showed on Launchpad): Keepr, Hinnavaht, Käsilane, Keila Leht Ultra, Mini Me, Livery, Market Watch, VAIB. Each has `report.ts` (envelope POST, Vercel production only, one event per failure kind per minute, `extra.kind` in the fingerprint), `onRequestError`, browser `instrumentation-client.ts` where no browser SDK exists. Per-app details and commit shas: plan, Reset → R2 lines. |
| Noise fixes | Käsilane `.invalid` queue host skipped; Mini Me flow check stubs Sentry, `.test` users not reported; both verified (zero events from their test runs on 24.10). |
| Emails | All 9 "New or regressed issue → email" rules deleted, 17 "high priority" defaults disabled (owner, 24.10). Two left that cannot email about errors: 662349 (no project), 1058340 (Seer PR notices; CLI token gets 403). |

### Undone (the approved next mission, in this order)
1. **ApplyKit (`cv-tailor-plus`) R2.** Most silent failure points of the remaining apps. Inventory in "Gotchas" below (from the 23.10 subagent scan, line refs may have moved: re-check). Has the server SDK; use `report.ts` for catch sites and `onRequestError` (SDK capture is never flushed under Turbopack). Check `.git/claude-lock` AND `git status`/recent commits first: on 23.10 another window was mid-work there without a lock.
2. **"Last ran" checks for scheduled jobs** (closes the biggest blind spot: a job that stops sends no error). Candidates: Keila editions (cron prune 01:00 UTC, source-health 09:00 UTC, deployment runs), Hinnavaht price poll (twice a day), Keepr digest/nudge crons, Market Watch hunts (manual LCC runner). Shape proposed to the owner: the app reports a missed run to Sentry, and Launchpad shows it red ("Keila: no edition for 9 days"). Design the lightest mechanism first (each app already has a DB with run timestamps; a Launchpad-side freshness read per app via a tiny authenticated endpoint, or the app's own cron reporting "late" for the job before it); propose the concrete mechanism in 5–10 plain lines before coding (it is new scope, approved in principle).
3. **"Last heard from" per app** on Launchpad: a silent app (broken reporting) must look different from a healthy one ("No errors in 7 days" today hides it). Idea: last event of any kind per project (Sentry `stats_v2` or the newest issue `lastSeen`), shown muted; flag when an app with real traffic has sent nothing for N days. Decide N with the owner only if unclear; default 14 d.
4. **Code locations in server errors:** `report.ts` sends the stack only as `extra.stack`; Sentry shows no frames. Parse `e.stack` into `exception.values[0].stacktrace.frames` (filename, function, lineno, colno; frames oldest first) in the reference copy `launchpad/src/lib/report.ts`, then the same edit in the 8 app copies (they differ only by DSN and header comment; diff them against the reference). Put file:line into the copied prompt if available.
5. **Athlon:** Next 14, `vercel --prod` (no remote, sanctioned). Its root `instrumentation.ts` is dead (app lives in `src/`, Next 14 needs `experimental.instrumentationHook`), `instrumentation-client.ts` is a Next 15.3+ file (Next 14 uses `sentry.client.config.ts`), init is not production-only. Read athlon STACK.md / CLAUDE.md first. Few failure points (no API routes; ingest runs locally).
6. **Finish:** `node ~/.claude/scripts/review.mjs` (independent review, report unedited in `docs/reviews/`), a response to every finding, fixes, `/simplify`, `ship.mjs`, §2 checks, `/wrap-up` (Launchpad STACK.md, global STACK.md, memory `project_launchpad`).

## Read next (in this order)
1. `docs/plans/2026-10-23-launchpad-rebuild-sentry.md` — every tick, deviation, commit sha; Reset (no-email reversal at its top), R2 lines per app, Task 2.10.
2. `docs/reviews/` — `2026-10-23-phase2-gate.md`, `2026-10-24-r2-apps-gate.md`, `2026-10-24-board-for-use.md`, all with responses.
3. `docs/SENTRY-STANDARD.md` — the wiring recipe: `report.ts`, proof methods (incl. the browser 503-intercept proof), project naming, no alert rules.
4. `SPEC.md`, `PRODUCT.md`, `DESIGN.md` (Bridge Watch Log), `STACK.md` (how the board works, checks, gotchas).

## Critical context that must not be lost
- **Owner's goal (27.10, verbatim):** "especially need to understand what work was done inside Launchpad and inside improving Sentry, and how you will finalize this assignment with maximum benefit to Sentry surveillance and monitoring. This is the sole thing I'm interested in improving".
- **Owner's go for this mission (27.10, verbatim):** "start working on what you described here with loose ends". What was described was items 1–6 above; the recommendation given was all six, with items 2 and 3 flagged as new scope ("add 2 and/or 3 if you want them"). Builder's reading: all six are approved; for 2 and 3, show the concrete mechanism in a few plain lines before building, then continue without waiting if the owner doesn't object (owner rule: defaults mean proceed).
- **No alert emails, ever** (owner 24.10, verbatim: "No emails to user fix or reverse this - my mailbox is convoluted as is - i have to manage this to come here and look and see visually the problems - not emails"). New Sentry projects get a default "high priority issues" email rule: disable it right after `sentry project create` (`sentry alert issues edit bits-and-pixels-ou/<slug>/<id> --status disabled`). An R2 proof = the issue arrives and shows on Launchpad.
- **The board's purpose** (owner 24.10, after using it): "what does this 59/59 say to me", "row apps to top that has sentry", "the UI should give more info about errors with the click/copy so the user can thake the sniippet sfraifht to claude code to investigate and fix". Exact error text is fine; bare numbers are not. No filter (replaced by the two lists in the approved proposal).
- **Watched list** (plan R1.1): the proposed list is the working list; the owner never edited it and said overnight work should need "zero my involvement".
- **Keepr and Hinnavaht never get the server Sentry SDK** (Keepr DEVIATIONS §10 perf gate; Hinnavaht docs/SPEC.md line 310). Read each app's own DEVIATIONS/SPEC/STACK before wiring.
- **Tube_Heureka** stays out: its docs/SPEC.md:395 excludes Sentry "until errors start to matter" (owner's decision).
- **Repo locks:** `<repo>/.git/claude-lock`; skip if younger than 2 h; take with an age check then a noclobber write (`set -C`); remove when done. Also look at `git status` and recent commits: other windows sometimes work without a lock.
- **Vercel Hobby cap:** 100 deploys per rolling 24 h across all windows. Count before shipping: `vercel api "/v6/deployments?teamId=team_kApO4aO1OelPx1r5i7iPQ5Jp&since=<ms 24h ago>&limit=100"`. A docs-only push is a deploy too.
- Sentry: org `bits-and-pixels-ou`, EU (`de.sentry.io`), CLI `sentry` 0.47.0 logged in; owner user id 4286511. The CLI token cannot delete issues or projects and gets 403 on org-level workflows.
- Communication: short status lines every few steps (owner runs several windows). Plain language; no jargon in owner-facing replies.

## Cherry-on-top ideas (builder's proposals, NOT owner-approved; offer, don't build)
1. **"Copy all problems for Claude Code":** one button on the trouble entry that copies every current problem as one prompt, for the morning sweep.
2. **Weekly "what broke" line on Launchpad:** under the all-clear, "This week: 3 errors in 2 apps, all resolved", so a quiet board still shows the watch is working.
3. **Proof button per app ("test the pipe"):** sends one harmless test event from the app (via an authenticated endpoint) and shows it arriving, so the owner can verify monitoring any time without Claude.
4. **Mark test issues** (the proof issues KEEPR-3, HINNAVAHT-1, KASILANE-1/2, KEILA-LEHT-ULTRA-1, MINI-ME-1/2/3, LIVERY-1, MARKET-WATCH-1, VAIB-1) as archived so they stop showing as "latest error" on quiet rows.

## Gotchas from this session
- **Report gate:** `report()` sends only when `VERCEL_ENV`/`NEXT_PUBLIC_VERCEL_ENV` is `production`. A pulled `.env.local` holds `VERCEL_ENV=production`: start local servers with `VERCEL_ENV=development` in the process env. Editing/copying `.env.local` wholesale is blocked by the permission classifier; targeted line edits for an owner-asked change worked.
- **MCP servers (mcp-handler / @modelcontextprotocol) turn a thrown tool error into an `isError` result**, so real MCP faults are invisible unless reported inside the tool wrapper.
- **Apps' own flow checks create deliberate failures** (fake queues, refused sockets, throwaway users). After wiring an app, run its `check-ui-flows` and confirm zero new Sentry events; stub Sentry in those steps or skip `.test`/`.invalid` fixtures.
- **Proof methods that write nothing:** browser 503-intercept (`page.route(...).fulfill({status:503})`, script pattern in the standard); a correctly signed webhook with a malformed body (Mini Me, Keila: delete the webhook log row after); a malformed authenticated request (Livery `null` body, now 400 instead).
- **Sentry API:** issues list defaults to unresolved; pass `query=` empty for all states. `lifetime.count` is all-time; `substatus` regressed/escalating marks "came back". Area per issue: `events/?dataset=errors&field=issue.id&field=area`.
- **Tailwind v4 utilities lose to unlayered custom classes** (`.form-label` uppercase beats `normal-case` on the same element).
- **Git Bash:** `MSYS_NO_PATHCONV=1` mangles `~/...` script paths; call ship as `node C:/Users/Kasutaja/.claude/scripts/ship.mjs`. Heredocs with backticks/`\\` break: write patch scripts with the Write tool.
- **ApplyKit inventory (23.10 scan, re-verify):** AI routes (`api/chat` stream + JSON, interview-prep compile, jobs analyze-fit, jobs parse, cv import, documents import/from-workspace, admin models), PDF export, Stripe verify returns 200 `{paid:false}` on any error, scrapers (cvkeskus, cvonline, tootukassa clients), jobs/add storage upload and silent PDF extract, `/api/loop` (Bearer `LOOP_TOKEN`; the queue Käsilane's apply-jobs agent reads) per-portal and per-item errors, many DB catch-500s, browser PDF export and chat fetches. Deploys: `ship.mjs` (git integration is on). Flow check logs in as `e2e-applykit@example.com` (see its scripts).
- **VAIB** home fails verify-deploy at 375 by design (desktop-only gallery, owner's exception); its own check-ui-flows is the gate.
- **The session's background wake-ups did not fire overnight** (machine idle); don't rely on long background waits for deploy slots.

## Pending owner items
- [ ] Delete junk Sentry projects `javascript-nextjs` and `keeletark` (CLI token can't).
- [ ] Optional: confirm or edit the watched-app list (plan R1.1).
- [ ] Optional: say yes/no to the cherry-on-top ideas above.

## The continuation prompt (paste into the fresh window)
```
Continue the Launchpad + Sentry finish. Read C:\Users\Kasutaja\Claude_Projects\launchpad\docs\RESUME-HERE.md first and follow it exactly — settled decisions are settled, do not re-ask them.
Mission: the six loose ends in "Undone", in order: (1) ApplyKit R2 real-failure reporting + production proof; (2) "last ran" checks for scheduled jobs (show the mechanism in a few plain lines first, then build); (3) "last heard from" per app on Launchpad; (4) code locations (stack frames) in report.ts, reference copy then the 8 app copies; (5) Athlon Next 14 Sentry fix (vercel --prod); (6) finish: review.mjs with responses, /simplify, ship.mjs, §2 checks, /wrap-up. Goal: maximum benefit to Sentry monitoring.
Sources: launchpad/docs/plans/2026-10-23-launchpad-rebuild-sentry.md, launchpad/docs/reviews/, launchpad/docs/SENTRY-STANDARD.md, launchpad/SPEC.md, STACK.md, each app's own STACK/SPEC/DEVIATIONS (all under C:\Users\Kasutaja\Claude_Projects\).
Gates: npm test, clean next build, the app's check-ui-flows green locally and on production via ship.mjs, a production proof per app (issue arrives and shows on Launchpad), zero Sentry noise from the app's own test run, code-reviewer on each diff. Standing rules: NO alert emails (disable the default rule on any new Sentry project); repo lock with age check + noclobber and a git status look; count Vercel deploys before shipping; Keepr/Hinnavaht never get the server SDK; short plain-language status lines to the owner every few steps. Go.
```
