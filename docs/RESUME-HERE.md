# Launchpad + Sentry: RESUME HERE

> Fresh-session entry point. Read top to bottom, then the "Read next" files in order.
> Settled decisions are settled: do not re-ask, do not re-litigate. Updated 23.10.2026 ~23:45.

## State
- Prod: https://ev-launchpad.vercel.app still serves the OLD static tile wall (master). The new app is NOT deployed.
- Repo: keeltekool/ev-launchpad. Work is on branch **`rebuild`** (70915dd data layer, a07481a board UI, plus the handoff docs commit), pushed to origin as `rebuild`. `master` local = origin/master + 3 docs commits that are also contained in `rebuild`.
- **The Vercel project `launchpad` framework preset was switched to Next.js on 23.10.** Do NOT deploy `master` (static) any more; deploy only after `rebuild` is merged into `master`.
- Gates: Gate 2 **red**: the code review says not ready (6 Important, see `docs/reviews/2026-10-23-phase2-gate.md`). Gate R2 **red**: R1 list unconfirmed and R2 partial (`docs/reviews/2026-10-23-apps-sentry-gate.md`).
- Where we stopped: the Phase 2 code is built and passes locally (npm test 5/5, check-ui-flows 26/26 and the reviewer's run 29/29), but the gate review findings are not yet fixed.

## What this project is (30 seconds)
Launchpad is the owner's single passcode-gated page that answers "is anything of mine broken right now?" for ~33 live web apps, merging a server-side health check per app with that app's Sentry errors, and opens any app in one click. The Sentry half of the job makes Sentry actually catch real failures in the apps that matter and email the owner.

## Current state — done / undone

### Done (all shipped and verified unless noted)
| Item | Evidence |
|---|---|
| Task 1.2 Sentry standard | `docs/SENTRY-STANDARD.md` (now with a "Real failures" section: the no-SDK `report.ts` and the alert command) |
| Task 1.3 `scripts/sentry-proof.mjs` | PASS/FAIL proven; spans dataset, `vercel-production` env |
| Production-only + standard on hinnavaht, keepr, applykit (cv-tailor-plus), category-pro, hankeradar, Travel-Assist-Poland, songdrop-app, market-watch | sentry-proof PASS for each. Commit shas are in the plan, Tasks 1.4/1.5 |
| R2 Keepr | `5747c64`: 11 catch sites report; server SDK removed again (Keepr DEVIATIONS §10 perf gate); alert workflow 1410266; KEEPR-3 test issue → alert fired → resolved |
| R2 Hinnavaht | `8fb6c03`: poll, scrapers, digest, scan; server SDK removed (Hinnavaht docs/SPEC.md line 310); alert 1410349; HINNAVAHT-1 test → alert fired → resolved |
| market-watch 4/141 flow failures | Cause: its `saved()` test helper matched Sentry's ingest POST; fixed in `7bb5040`; 141/141 with Sentry on |
| Launchpad Phase 2 code (branch `rebuild`) | Tasks 2.1–2.9 ticked in the plan; Sentry project `launchpad` + alert 1410455; Vercel env `LAUNCHPAD_PASSCODE` (prod + preview) |
| DESIGN.md, STACK.md, README.md, PRODUCT.md for the new app | committed on `rebuild` |

### Undone (in this order)
1. **Fix Gate 2 Important findings** (`docs/reviews/2026-10-23-phase2-gate.md`):
   - The headline must not say "no new errors" when `sentryOk` is false.
   - Add `maxDuration` to the page, or confirm Fluid compute.
   - Hide or limit unregistered junk Sentry slugs until Task 1.1 is done; at minimum, don't let them create Problems.
   - Record the Phase 2 vs R1/R2 sequencing deviation in the plan.
   - check-ui-flows: add a bad-token step asserting the "Sentry unreachable" line, a render-time measure, and a real Problems-block assertion (for example a test registry entry pointing at a URL that answers 500, or a fixture route).
   - Also worth doing from the Minors: gate `report.ts` on `VERCEL_ENV === "production"` (applies to Keepr and Hinnavaht too), the focus colour to brand navy, and the 66/32 → 67/33 and main → master wording in the plan.
   - Write a "Responses" line per finding in the review file.
2. **Merge `rebuild` → `master`, ship** with `node ~/.claude/scripts/ship.mjs /` from the repo root. check-ui-flows runs against prod; it reads `LAUNCHPAD_PASSCODE` from `.env.local`. Then give the owner their one-year link, `https://ev-launchpad.vercel.app/?key=<LAUNCHPAD_PASSCODE from .env.local>`, in chat (owner-accepted practice for their own keys).
3. **Owner confirms the watched list** (proposal in the plan, R1.1). Then R2 per remaining listed app:
   - Käsilane, Keila Leht Ultra, Tube_Heureka, ApplyKit, Mini Me, Livery, Athlon, VAIB, Market Watch (catch sites).
   - Per app: map swallowed failures → `report()` → alert rule → one safe production trigger → issue plus fired alert.
   - Apply the apps-review fingerprint fix (failure kind in the fingerprint) to Keepr and Hinnavaht first.
4. Apps-review leftovers (`docs/reviews/2026-10-23-apps-sentry-gate.md`):
   - prove server transactions on hankeradar/ApplyKit with `span.op:http.server`;
   - a Hinnavaht regression check for the skipped price-0 Selver rows;
   - don't `await report()` on the scan request path;
   - the ApplyKit `/config` import;
   - stale STACK and SPEC lines;
   - athlon production-only switch (Task 1.5).
5. Phase 4: `node ~/.claude/scripts/review.mjs`, responses, `/simplify`, ship, §2, `/wrap-up` (global STACK.md, memory).

## Read next (in this order)
1. `docs/plans/2026-10-23-launchpad-rebuild-sentry.md`: the plan with every tick, deviation and commit sha; the "Reset" section is the current direction.
2. `docs/reviews/2026-10-23-phase2-gate.md`, then `docs/reviews/2026-10-23-apps-sentry-gate.md`: the open findings.
3. `SPEC.md`, `PRODUCT.md`, `DESIGN.md`: what the page must do, and its look.
4. `STACK.md`: how the new app is wired, its checks and gotchas.
5. `docs/SENTRY-STANDARD.md`: SDK wiring plus the real-failures pattern (`report.ts`, alert command, proof).

## Critical context that must not be lost
- **Owner's direction (verbatim, 23.10):** "the currrent list of sentry apps is not bible, I am not intetrtestred in volume as i stated in the beginning i am intetrested in getting sentriy actually useful and the launchpad actually useful not some shit Potemkin village as its currently is". The owner answered the reset proposal with "Yes yes to allll!". Settled reset:
  1. A short watched list chosen by real use (proposed from traffic; owner confirms or edits).
  2. Real swallowed failures reported per app, each proven by a triggered failure and a fired alert.
  3. Alert: email on a new and on a regressed issue.
  4. The Launchpad page before more wiring.
  It replaces the rest of Phase 1 and all of Phase 3. Do not go back to wiring apps for volume.
- **The finding behind it:** in the 14 days before 23.10, Sentry had zero production issues for any app; everything was caught and swallowed. Transactions arriving does not mean Sentry works; only a triggered failure plus a fired alert counts.
- **Keepr and Hinnavaht must not get the server Sentry SDK** (Keepr DEVIATIONS §10: it broke the locked scan benchmark; Hinnavaht docs/SPEC.md line 310). They use `src/lib/report.ts` (envelope POST). Read each app's own DEVIATIONS/SPEC/STACK before wiring it; the 23.10 session missed this once and reverted.
- **Visual direction: Bridge Watch Log** (impeccable seed 1cb1cdf8, assigned card). The owner was shown the decision page, asked "do i have to do or think someting of it?" and was told it was optional; they never picked, and it was built unattended. Treat it as settled unless the owner says otherwise. The contract sits in `src/app/layout.tsx`.
- Owner's original rules for this build (verbatim, session start): "Task 1.1 (deleting two Sentry projects) waits for me, don't retry it. The sentry CLI is logged in. I'm away; I only click OK on login screens."
- **Communication:** the owner runs ~6 Claude windows in parallel and got angry at long silence ("give me some heads up now for chrissst sake!!!!"). Give a short status line every few steps: what is done, what is next, what needs them.
- **Vercel deploy cap:** Hobby allows 100 deploys per rolling 24 h; the account was at ~90/100 at 23:00 on 23.10 (all windows). Count before deploying: `vercel api "/v6/deployments?teamId=team_kApO4aO1OelPx1r5i7iPQ5Jp&since=<ms 24h ago>&limit=100"`. Pushing a branch creates a preview deploy too.
- **Repo locks:** `<repo>/.git/claude-lock`. Skip the repo if the lock is younger than 2 h. Take the lock with an age check, then a noclobber write (`set -C`); never a bare `echo >` (23.10: that overwrote another window's lock in market-watch). Remove your lock when done.
- Owner Sentry user id for email alerts: `4286511`. Org `bits-and-pixels-ou`, EU (`de.sentry.io`).
- Test logins that need no owner:
  - Hinnavaht: Clerk test user `hinnavaht+clerk_test@example.com`, OTP 424242. The recipe is in `hinnavaht/scripts/check-ui-flows.mjs`.
  - Keepr: the owner's persistent profile `keepr/.pw-profile` (excluded via `.git/info/exclude`), logged in 23.10.

## Gotchas from this session
- **Sentry API:**
  - Transactions live in `dataset=spans` with `is_transaction:true`; `dataset=transactions` is empty.
  - The Vercel environment is `vercel-production`.
  - `stats_v2` grouped by project returns totals only.
  - Alert rules made by the CLI are workflows; fire history is at `organizations/<org>/workflows/<id>/group-history/`, not `projects/.../rules/`.
  - On an HTTP error the `sentry api` CLI prints the JSON body on stdout.
- **Turbopack builds get no Sentry route wrappers,** so a manual `captureException` on the server is never flushed. Use `report.ts`, or `await Sentry.flush()`.
- **`@sentry/nextjs` 10.76.2:** import `withSentryConfig` from `@sentry/nextjs/config`; the root export is deprecated.
- **Next 16 Cache Components:** a `use cache` lifetime under 5 minutes is runtime data, so the page needs `<Suspense>`.
- **Health checks vs Clerk:** Clerk apps answer 404 to non-page requests and loop their cookie handshake without a cookie jar. The fix is in `src/lib/health.ts`.
- **npm on this machine:** `npm install` / `npm ci` in launchpad failed with ENOTEMPTY (VS Code watching `node_modules`). Install in a scratch folder and `mv` `node_modules` in (same drive, a rename). Playwright for scripts is borrowed from `~/.claude/scripts/node_modules` (fallback import in both scripts).
- **Git Bash mangles `/route` arguments:** prefix `MSYS_NO_PATHCONV=1`.
- **Bash heredocs with backticks in `node -e` break:** write scripts to a file.
- **category-pro:**
  - Its local build once failed on `next/font/google` downloads (transient; the retry passed).
  - Every build flips `next-env.d.ts`, so `git checkout -- next-env.d.ts`.
  - Its check-ui-flows rewrites tracked PNGs in `scripts/`, so `git checkout -- scripts/` after a ship.
  - It is desktop-only (owner decision).
- **songdrop-app** has no Vercel git integration: deploy with `vercel --prod` from `web/` after pushing (recorded in the plan constraints).
- **Traffic data:** Vercel metrics on Hobby are free only for the last ~24 h, per project, filter `NOT clientUserAgent:*HeadlessChrome*`. Reading Chrome history was blocked by the permission classifier as personal data; do not retry.
- **Impeccable decision page:** `serve-question` exits 4 ("page closed") even while the tab looks open; don't wait on it. The finish reviewer and documenter were not run (CLAUDE.md caps verification at one bounded round); DESIGN.md was hand-written from the build.
- **Local server:** `next start -p 4870` may still hold port 4870. Stop it with PowerShell: `Get-NetTCPConnection -LocalPort 4870 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.

## Pending owner items
- [ ] Confirm or edit the watched-app list (plan, R1.1).
- [ ] Delete the junk Sentry projects `javascript-nextjs` and `keeletark` (Task 1.1, owner's).
- [ ] Glance at the two Sentry alert emails from 23.10 (KEEPR-3 at ~22:02, HINNAVAHT-1 at ~22:23 Tallinn) to confirm email delivery.
- [ ] Decide on the plaintext Keepr password committed in `keepr/scripts/login-visible.mjs` (private repo).

## The continuation prompt (paste into the fresh window)
```
Continue the Launchpad + Sentry build. Read C:\Users\Kasutaja\Claude_Projects\launchpad\docs\RESUME-HERE.md first and follow it exactly — settled decisions are settled, do not re-ask them.
Mission: on branch `rebuild` in C:\Users\Kasutaja\Claude_Projects\launchpad, fix the Important findings in docs/reviews/2026-10-23-phase2-gate.md (Sentry-unreachable headline, maxDuration, junk Sentry rows, plan deviation note, check-ui-flows: unreachable step + render time + a real Problems-block assertion), write a Responses line for each, then merge rebuild into master and ship with `node ~/.claude/scripts/ship.mjs /` (count Vercel deploys first; ~90/100 used on 23.10), and give the owner the one-year ?key= link from .env.local. After that: ask the owner to confirm the watched list (plan R1.1) and continue R2 per app.
Sources: the plan docs/plans/2026-10-23-launchpad-rebuild-sentry.md, both files in docs/reviews/, SPEC.md, PRODUCT.md, DESIGN.md, STACK.md, docs/SENTRY-STANDARD.md.
Gates: npm test, a clean next build, scripts/check-ui-flows.mjs green locally and against production via ship.mjs, code-reviewer on the fix diff. Standing rules: repo lock with age check + noclobber; read each app's DEVIATIONS/SPEC before wiring Sentry (Keepr and Hinnavaht: no server SDK); short status line to the owner every few steps; the owner deletes the junk Sentry projects, not you. Go.
```
