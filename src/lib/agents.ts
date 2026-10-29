import { AGENTS_PROJECT, plainName, spanIso as iso, spansOf } from "./sentry.ts";

// Managed Agents health, from the spans Claude Platform exports to the Sentry project `claude-agents` (Console →
// OpenTelemetry, metadata only; docs/plans/2026-10-29-web-agents.md). Turn spans name the agent; step spans (tools,
// model requests) carry only the thread id (gen_ai.conversation.id), so they reach an agent through the turn rows.
const TRACES = "https://bits-and-pixels-ou.sentry.io/explore/traces/?project=4512341431550032&statsPeriod=7d&query=";
const DAY = 864e5;

export type AgentFailure = {
  kind: "session" | "step"; // session: a session.error ended a turn; step: a tool or model request failed, the agent went on
  step: string; // the failed step: "turn", a tool name ("search_outlets"), "model_request"
  type: string | null; // error.type: tool_error, rate_limit_error, …
  count: number; // in 7 days
  at: string;
  sessionId: string | null;
};
export type AgentHealth = {
  name: string;
  sessions: number; // in 7 days
  failed: number; // sessions with a failed turn
  failedNew: boolean; // a failed turn in the last 24 h: a problem
  last?: { at: string; ok: boolean; sessionId: string };
  medianMs?: number; // the agent's own turn time per session
  tokensIn: number;
  tokensOut: number;
  failure?: AgentFailure; // the newest failed session, else the newest failed step
  tracesUrl: string;
};
export type AgentSummary = { ok: boolean; byName: Record<string, AgentHealth> };

type Turn = { "gen_ai.agent.name": string | null; "gen_ai.conversation.id": string | null; "anthropic.session.id": string | null; "span.status": string; "error.type": string | null; "max(timestamp)": number | string; "sum(span.duration)": number };
type Step = { "gen_ai.conversation.id": string | null; "anthropic.session.id": string | null; "span.name": string; "error.type": string | null; "max(timestamp)": number | string; "count()": number };
type Tokens = { "gen_ai.conversation.id": string | null; "sum(tags[gen_ai.usage.input_tokens,number])": number | null; "sum(tags[gen_ai.usage.output_tokens,number])": number | null };

const agentName = (n: string | null) => plainName(n, "unnamed agent");
export const emptyAgent = (name: string): AgentHealth => ({ name, sessions: 0, failed: 0, failedNew: false, tokensIn: 0, tokensOut: 0, tracesUrl: TRACES + encodeURIComponent(`gen_ai.agent.name:${name}`) });

export function summarize(turns: Turn[], steps: Step[], tokens: Tokens[], now = Date.now()): Record<string, AgentHealth> {
  const byName: Record<string, AgentHealth> = {};
  const threadAgent = new Map<string, AgentHealth>();
  const sessions = new Map<AgentHealth, Map<string, { ms: number; at: string; failed: boolean }>>();
  for (const t of turns) {
    const sid = t["anthropic.session.id"];
    const at = iso(t["max(timestamp)"]);
    if (!sid || !at) continue;
    const name = agentName(t["gen_ai.agent.name"]);
    const a = (byName[name] ??= emptyAgent(name));
    if (t["gen_ai.conversation.id"]) threadAgent.set(t["gen_ai.conversation.id"], a);
    const mine = sessions.get(a) ?? sessions.set(a, new Map()).get(a)!;
    const s = mine.get(sid) ?? { ms: 0, at: "", failed: false };
    s.ms += t["sum(span.duration)"] ?? 0;
    if (at > s.at) s.at = at;
    if (t["span.status"] === "error") {
      s.failed = true;
      if (now - Date.parse(at) < DAY) a.failedNew = true;
      if (a.failure?.kind !== "session" || at > a.failure.at) a.failure = { kind: "session", step: "turn", type: t["error.type"], count: 1, at, sessionId: sid };
    }
    mine.set(sid, s);
  }
  for (const [a, mine] of sessions) {
    const all = [...mine.entries()].sort(([, x], [, y]) => y.at.localeCompare(x.at));
    a.sessions = all.length;
    a.failed = all.filter(([, s]) => s.failed).length;
    if (a.failure) a.failure.count = a.failed; // failed sessions, not failed turns
    a.last = { at: all[0][1].at, ok: !all[0][1].failed, sessionId: all[0][0] };
    const ms = all.map(([, s]) => s.ms).sort((x, y) => x - y);
    a.medianMs = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
  }
  for (const s of steps) {
    const a = s["gen_ai.conversation.id"] ? threadAgent.get(s["gen_ai.conversation.id"]) : undefined;
    if (!a || a.failure?.kind === "session") continue; // a failed session outranks any failed step
    const at = iso(s["max(timestamp)"]);
    if (at && (!a.failure || at > a.failure.at))
      a.failure = { kind: "step", step: s["span.name"].replace(/^anthropic\.((mcp_|custom_)?tool_use )?/, ""), type: s["error.type"], count: s["count()"], at, sessionId: s["anthropic.session.id"] };
  }
  for (const t of tokens) {
    const a = t["gen_ai.conversation.id"] ? threadAgent.get(t["gen_ai.conversation.id"]) : undefined;
    if (!a) continue;
    a.tokensIn += t["sum(tags[gen_ai.usage.input_tokens,number])"] ?? 0;
    a.tokensOut += t["sum(tags[gen_ai.usage.output_tokens,number])"] ?? 0;
  }
  return byName;
}

const spans = <T>(fields: string[], query: string, sort?: string) => spansOf<T>(AGENTS_PROJECT, fields, query, sort);

// Three org-level calls; any failure → { ok: false }: the section says Sentry is unreachable, the rest of the board stands.
export async function getAgentSummary(now = Date.now()): Promise<AgentSummary> {
  try {
    const [turns, steps, tokens] = await Promise.all([
      spans<Turn>(["gen_ai.agent.name", "gen_ai.conversation.id", "anthropic.session.id", "span.status", "error.type", "max(timestamp)", "sum(span.duration)"], "span.name:anthropic.session.turn", "-max(timestamp)"),
      spans<Step>(["gen_ai.conversation.id", "anthropic.session.id", "span.name", "error.type", "max(timestamp)", "count()"], "span.status:error !span.name:anthropic.session.turn", "-max(timestamp)"),
      // Each token counted once: model requests plus grader iterations (Claude docs, "Counting tokens").
      spans<Tokens>(["gen_ai.conversation.id", "sum(tags[gen_ai.usage.input_tokens,number])", "sum(tags[gen_ai.usage.output_tokens,number])"], "span.name:[anthropic.model_request,anthropic.session.outcome_evaluation]"),
    ]);
    return { ok: true, byName: summarize(turns, steps, tokens, now) };
  } catch {
    return { ok: false, byName: {} };
  }
}
