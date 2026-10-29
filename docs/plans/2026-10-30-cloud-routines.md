# Cloud routines section (30.10.2026)

Owner's ask (29–30.10): hook the subscription cloud routines up to Sentry and show their health on Launchpad, in a section of their own (apart from Web agents and the apps). Only the active routines.

## Wiring (done 30.10)
- Claude Code OTel traces (beta) from the routines' cloud environments to Sentry project `claude-routines` (id 4512341673771088): `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`, `OTEL_TRACES_EXPORTER=otlp` (metrics/logs `none`), http/protobuf, header `x-sentry-auth` (public key). Prompts arrive `<REDACTED>`.
- One environment per active routine, a copy of `Egert_Testib_Claude_Code_Webi` (network unrestricted, no secrets, no setup script) plus `OTEL_RESOURCE_ATTRIBUTES=routine.name=<slug>`; each routine's `job_config.ccr.environment_id` points at its copy (prompt, tools, schedule unchanged, checked per routine). Proven with a throwaway routine: its spans carried `routine.name=otel-test` and `ccr.session.id` = the run's session (routine and its environment deleted/archived after).
- Not done (permission classifier refused "modify shared resource"): removing the trace variables from the shared environment. Interactive cloud sessions and disabled routines there send untagged spans; the board ignores spans without `routine.name`. Owner decides.

| Routine | slug | app | late after |
|---|---|---|---|
| Idea Radar Curation (Mon, Thu 04:00 UTC) | idea-radar-curation | Idea Radar | 120 h |
| Lonkero weekly scan (Mon 04:00) | lonkero-weekly-scan | Lonkero Cruise | 192 h |
| VAIB-X Weekly Brief (no cron: fired by API) | vaib-x-weekly-brief | VAIB-X | — |
| Prindipesa Avastaja (Fri 13:00) | prindipesa-avastaja | Prindipesa | 192 h |
| ApplyKit Top Picks (Mon, Wed, Fri 03:00) | applykit-top-picks | ApplyKit | 96 h |
| EUDI Pipeline (Wed 03:30) | eudi-pipeline | EUDI Wallet Tracker | 192 h |

## Rules
- A run = one `ccr.session.id`. Failed run = a `claude_code.interaction` or `claude_code.llm_request` span with status ERROR; a failed tool step shows in ink, never red.
- Late = no traced run within `lateAfterHours`, counted from the later of the last run and the tracing start (29.10.2026 22:30 UTC), so routines are not late before their first traced run is due.
- A failed run in 24 h or a late routine is a red problem of its app. Spans come with no token counts (Claude Code exports tokens as metrics): no tokens column.

## Tasks
- [x] 1. `src/lib/routines.ts`: span queries (runs per routine.name and session, failures) → per routine health; unit tests.
- [x] 2. `data/apps.json` `routines`; `board.ts` routine lines, problems "routine failed" / "routine late".
- [x] 3. Board UI: "Cloud routines" ledger below Web agents; trouble entry lines; Copy for Claude Code prompt.
- [x] 4. Fixture spans + checks in `check-ui-flows.mjs`.
- [x] 5. Gate: next build + start, flows 375/1440 + fixture, code-reviewer, ship.mjs.

## Gate review (code-reviewer, 30.10) and responses
- I1 queries do not filter on the tag (untagged interactive spans can crowd routines out of the 100-row page) → fixed: `has:routine.name` in both queries. Regression: the fixture Sentry now returns 100 newer untagged rows unless the query filters on the tag; the routine checks failed on the unfiltered build, pass on the fixed one.
- I2 prompt searched RemoteTrigger by the display label → fixed: registry `trigger` (the routine's id) and the `routine.name` tag go in the prompt (unit test + fixture check).
- I3 SPEC not updated → SPEC "Cloud routines" bullet and registry shape added.
- M "no traced run yet" wrong once tracing is older than 14 days → fixed: "no run in 14 days" then (unit test).
- M failed-run count 0 when the session is missing from the runs result → fixed: at least 1 (unit test).
- M wider name column also widened Web agents → fixed: own `ledger-routines` class; sideways scroll checked at 1280/1440/1920.
- M missing space in the fixture router → fixed.
- M `otel-test` exclusion → kept with its ponytail removal date (13.11).
