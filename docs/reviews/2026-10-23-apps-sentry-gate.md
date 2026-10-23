# Phase 1 / R2 gate review — code-reviewer, 23.10.2026 (Sentry commits across app repos)

Commits: keepr 5531855 5747c64 · hinnavaht cac33f2 8fb6c03 · market-watch 242356f 3bf5349 a5e29aa 7bb5040 · cv-tailor-plus d8e06df · category-pro 6dea95d 49d248a fa6926f · hankeradar 7410f5b · Travel-Assist-Poland 1d9b0ea · songdrop-app a3c9504.
Verdict: **not ready**. The Keepr and Hinnavaht code changes are sound.

## Critical
- Gate R2 not met: R1.1 (the watched list) is unconfirmed, so Gate R2 has no defined set. Only Keepr and Hinnavaht have a triggered issue and a fired alert. Market-watch catch sites are not done (`src/app/api/intake/route.ts:16` Anthropic, `src/app/api/runner/runs/[id]/finish/route.ts:59` prune). There is no R2 work on cv-tailor-plus, category-pro, hankeradar, Travel-Assist-Poland or songdrop-app, and athlon is not done.
- Junk projects not deleted (SPEC.md:47, Task 1.1, owner's).

## Important
- `report()` fingerprint `[area, e.name]` (keepr and hinnavaht `src/lib/report.ts:20`): an ongoing partial failure ("1 of 40 Barbora unreadable") keeps the issue open, and a later full outage lands in the same issue with no email (the alert fires on first-seen or regression only). Put the failure kind in the fingerprint (all vs partial, or HTTP status). Affects hinnavaht barbora.ts:110, rimi.ts:127, selver.ts:118.
- category-pro revert/re-apply (6dea95d → 49d248a → fa6926f) has no recorded cause.
- hankeradar 7410f5b and cv-tailor-plus d8e06df exist to make server init run, but `sentry-proof` passes on any transaction (a browser pageload alone). Prove with `span.op:http.server` (or a server error).
- Hinnavaht `src/lib/chains/selver.ts:111-114` now skips Selver rows with price 0 instead of writing them. That changes data, and no regression check covers it (CLAUDE.md §7).

## Minor
- `await report()` on the user request path (keepr oracles selver.ts:41, off.ts:25; hinnavaht chains/selver.ts:96 via /api/scan:55) adds up to 3 s during a Sentry outage. Use `after()` or don't await.
- Keepr digest `route.ts:97`: if `res.text()` throws in the `!res.ok` branch, the failure is counted and reported twice.
- Hinnavaht `selver.ts:96`: a scan lookup failure is tagged `scrape:selver`, the same area as the poll's no-price report (:118).
- Previews report and alert: the `NODE_ENV === "production"` gate is also true on preview builds (SPEC.md:45 says production only). Gate on `VERCEL_ENV === "production"` (the Launchpad review says the same).
- ApplyKit `next.config.ts:2` still imports `withSentryConfig` from `@sentry/nextjs` (deprecated).
- Stale docs: cv-tailor-plus STACK.md:20 (`NEXT_PUBLIC_SENTRY_DSN`, replay), category-pro STACK.md:26 (DSN env), market-watch SPEC.md:293 ("no-op until set").
- "SPEC §310" in hinnavaht 8fb6c03 and STACK.md:16 is a line number, not a section.
- `report.ts` sends the stack only as `extra.stack` text; `exception.values` has no `stacktrace`, so Sentry shows no frames.

## Unverified
- Keepr locked scan benchmark not re-run after 5747c64 (`scripts/check-perf.mjs` needs a fresh Clerk state and writes test scans into the owner's shelf; ask first).
- The server SDK is now live for the first time on hankeradar and ApplyKit: is the cold-start cost acceptable there?
- That each hardcoded DSN belongs to its intended project.
- Alert rules exist only for keepr (1410266), hinnavaht (1410349) and launchpad (1410455).
- The market-watch flow fix 7bb5040 was not re-run by the reviewer (the ship run passed 141/141 at 22:06).

## Responses
- category-pro revert cause (recorded 23.10, handoff): the failing check was 2 console errors at 1440 from the browser's Sentry envelope POST (CORS / ERR_FAILED). Sentry stats showed `client_discard / network_error` at 16:45Z and 16:50Z, before the 20:21 deploy, under the old code. The revert shipped clean (0 errors), and the unchanged re-apply then passed 0 errors at both widths, so the cause is an intermittent browser-to-ingest failure, not the change. The plan should say this.
- Everything else: open for the next session.
