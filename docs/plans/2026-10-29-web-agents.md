# Web agents section (29.10.2026)

Owner's ask (29.10): connect the Managed Agents to Sentry and show their health on Launchpad in a separate "Web agents" section; Keila gets the spike; "you manage everything".

## Spike (done 29.10)
- Console → OpenTelemetry → destination "Sentry claude-agents" (Provider Sentry, DSN of the new Sentry project `claude-agents` id 4512341431550032, Metadata only, All workspaces). Test span passed and landed. The page exists on the Individual Org.
- Keila proov `sesn_01KguxXimm9m2aA6nTZVxheL` ($1.96, satisfied, nothing published): 135 spans. Turn spans carry `gen_ai.agent.name` (toimetaja, kirjutaja separate), `gen_ai.conversation.id`, `anthropic.session.id`; tool and model spans carry the thread id only, so they map to an agent through the turn rows.
- The free Developer plan answers spans queries through the API (grouping by Anthropic attributes, sums of `tags[gen_ai.usage.*,number]`). Numbers match the session record (turn time 540.8 s / 90.2 s; output tokens 75.4k vs 75.8k).
- Found on the first trace: `search_outlets` failed 10× (MCP input validation, `run_id` missing). Keila's own Sentry never saw it. Out of scope here; owner decides.

## Rules
- A failed session = a `anthropic.session.turn` span with status ERROR (a `session.error` ended the turn). New in 24 h → red problem on the app, in the trouble entry.
- Step errors (tool, MCP tool, model request) are shown with count and age in ink, never red: the agent usually recovers.
- Agents map to apps by `agents` in `data/apps.json`; an agent seen in spans but not registered shows by its name.
- The `claude-agents` project holds traces, not app errors: hidden from the Watched ledger.
- Deviation (29.10): Pocket Clone was `dormant` in the registry though it is live and used daily; set to `live` with `repo` so `pocket-sorter` maps to it (adds its health check and Uptime entry).

## Tasks
- [x] 1. `src/lib/agents.ts`: three 7-day span queries → per agent: last session, sessions, failed sessions, median agent time per session, tokens in/out, latest error; unit tests.
- [x] 2. `data/apps.json` `agents`; `board.ts` agent rows + problem "agent failed"; `sentry.ts` hides `claude-agents`.
- [x] 3. Board UI: "Web agents" ledger between Watched and Uptime; trouble entry line; Copy for Claude Code prompt.
- [x] 4. Fixture spans in `check-ui-flows.mjs` (a failed session, a tool error, an unregistered agent, a quiet registered agent).
- [ ] 5. Gate: next build + start, flows 375/1440 + fixture, code-reviewer, ship.mjs, verify-deploy.

## Gate review (code-reviewer, 29.10) and responses
- I1 status string unchecked → no change: the spike's live query returned `span.status: "error"` with `error.type: tool_error` for the 10 search_outlets spans, and `span.status:error` filtered them.
- I2 live step can't fail on empty data → fixed: live check "at least one agent had a traced session in 7 days".
- M iso() throws on a bad row → fixed: the row is skipped (unit test).
- M session failure count always 1 → fixed: count = failed sessions (unit test).
- M "Latest" header misleads → fixed: "Failure, 7 days", tooltip says a failed session outranks a step.
- M dormant apps' agents vanish → fixed: they show as strays (unit test).
- M Pocket deviation unrecorded → recorded above.
- M agent name outside the fence → fixed: names other than `[\w .-]{1,64}` read "unnamed agent" (unit test).
- M blank line at 375 for quiet agents → fixed: the cell stays empty and hides.
- M SPEC/STACK not updated → SPEC updated; STACK layers updated with stack-sync at the finish.
- M plan unticked → ticked.
