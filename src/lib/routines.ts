import { plainName, ROUTINES_PROJECT, spanIso as iso, spansOf } from "./sentry.ts";

// Cloud routine health, from the Claude Code traces the routines' cloud environments export to the Sentry project
// `claude-routines` (docs/plans/2026-10-30-cloud-routines.md). Each active routine runs in its own environment, tagged
// `routine.name=<slug>`; a run is one `ccr.session.id`. Spans carry no token counts (Claude Code exports those as metrics).
const TRACES = "https://bits-and-pixels-ou.sentry.io/explore/traces/?project=4512341673771088&statsPeriod=14d&query=";
// The routines got their tagged environments at 22:30 UTC on 29.10.2026: before a routine's first traced run is due, no run is not late.
export const TRACED_SINCE = "2026-10-29T22:30:00Z";
const DAY = 864e5;
const RUN_SPANS = new Set(["claude_code.interaction", "claude_code.llm_request"]);

export type RoutineFailure = {
  kind: "run" | "step"; // run: the run itself or a model request failed; step: a tool call failed, the run went on
  step: string; // "llm_request", "interaction", or the tool's name ("Bash")
  count: number; // failed runs (run) or failed calls (step) in 7 days
  at: string;
  sessionId: string | null;
};
export type RoutineHealth = {
  name: string; // the routine.name slug
  runs: number; // in 7 days
  failed: number; // runs in 7 days with a failed run span
  failedNew: boolean; // a failed run in the last 24 h: a problem
  last?: { at: string; ok: boolean; sessionId: string }; // newest run in 14 days
  medianMs?: number; // run time (its interaction spans) over the 7-day runs
  failure?: RoutineFailure; // the newest failed run, else the newest failed step
  tracesUrl: string;
};
export type RoutineSummary = { ok: boolean; byName: Record<string, RoutineHealth> };

type Run = { "routine.name": string | null; "ccr.session.id": string | null; "max(timestamp)": number | string; "sum(span.duration)": number };
type Fail = { "routine.name": string | null; "ccr.session.id": string | null; "span.name": string; tool_name: string | null; "max(timestamp)": number | string; "count()": number };

export const emptyRoutine = (name: string): RoutineHealth => ({ name, runs: 0, failed: 0, failedNew: false, tracesUrl: TRACES + encodeURIComponent(`routine.name:${name}`) });

export function summarizeRoutines(runs: Run[], fails: Fail[], now = Date.now()): Record<string, RoutineHealth> {
  const byName: Record<string, RoutineHealth> = {};
  const week = (at: string) => now - Date.parse(at) < 7 * DAY;
  const sessions = new Map<RoutineHealth, Map<string, { ms: number; at: string; failed: boolean }>>();
  for (const r of runs) {
    const sid = r["ccr.session.id"];
    const at = iso(r["max(timestamp)"]);
    if (!sid || !at || !r["routine.name"] || r["routine.name"] === "otel-test") continue; // untagged: an interactive session or a disabled routine
    // ponytail: "otel-test" is the deleted spike routine of 29.10; drop the check once its run leaves the 14-day window (13.11).
    const name = plainName(r["routine.name"], "unnamed routine");
    const h = (byName[name] ??= emptyRoutine(name));
    const mine = sessions.get(h) ?? sessions.set(h, new Map()).get(h)!;
    const s = mine.get(sid) ?? { ms: 0, at: "", failed: false };
    s.ms += r["sum(span.duration)"] ?? 0;
    if (at > s.at) s.at = at;
    mine.set(sid, s);
  }
  for (const f of fails) {
    const at = iso(f["max(timestamp)"]);
    const h = f["routine.name"] ? byName[plainName(f["routine.name"], "unnamed routine")] : undefined;
    if (!at || !h || !week(at)) continue;
    const run = RUN_SPANS.has(f["span.name"]);
    const sid = f["ccr.session.id"];
    if (run && sid) {
      const s = sessions.get(h)?.get(sid);
      if (s) s.failed = true;
      if (now - Date.parse(at) < DAY) h.failedNew = true;
    }
    // A failed run outranks any failed step; within a kind, the newest wins.
    if (!run && h.failure?.kind === "run") continue;
    if (!h.failure || (run && h.failure.kind === "step") || at > h.failure.at)
      h.failure = { kind: run ? "run" : "step", step: run ? f["span.name"].replace(/^claude_code\./, "") : plainName(f.tool_name, "tool"), count: f["count()"], at, sessionId: sid };
  }
  for (const [h, mine] of sessions) {
    const all = [...mine.entries()].sort(([, x], [, y]) => y.at.localeCompare(x.at));
    const recent = all.filter(([, s]) => week(s.at));
    h.runs = recent.length;
    h.failed = recent.filter(([, s]) => s.failed).length;
    h.last = { at: all[0][1].at, ok: !all[0][1].failed, sessionId: all[0][0] };
    const ms = recent.map(([, s]) => s.ms).sort((x, y) => x - y);
    if (ms.length) h.medianMs = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
    if (h.failure?.kind === "run") h.failure.count = Math.max(h.failed, 1); // failed runs, not failed spans (at least the one seen)
  }
  return byName;
}

// Two org-level calls; any failure → { ok: false }: the section says Sentry is unreachable, the rest of the board stands.
export async function getRoutineSummary(now = Date.now()): Promise<RoutineSummary> {
  try {
    const [runs, fails] = await Promise.all([
      // 14 days, so a weekly routine's last run is still known when its 7-day count is 0.
      spansOf<Run>(ROUTINES_PROJECT, ["routine.name", "ccr.session.id", "max(timestamp)", "sum(span.duration)"], "has:routine.name span.name:claude_code.interaction", "-max(timestamp)", "14d"),
      spansOf<Fail>(ROUTINES_PROJECT, ["routine.name", "ccr.session.id", "span.name", "tool_name", "max(timestamp)", "count()"], "has:routine.name span.status:error", "-max(timestamp)"),
    ]);
    return { ok: true, byName: summarizeRoutines(runs, fails, now) };
  } catch {
    return { ok: false, byName: {} };
  }
}
