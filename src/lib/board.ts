import { emptyAgent, type AgentHealth, type AgentSummary } from "./agents.ts";
import { emptyRoutine, TRACED_SINCE, type RoutineHealth, type RoutineSummary } from "./routines.ts";
import type { AppEntry, AppLink, AppRoutine } from "./apps";
import type { Health, Job, Jobs } from "./health";
import type { SentryApp, SentrySummary } from "./sentry";

export type Problem = "down" | "new error" | "late" | "agent failed" | "routine failed" | "routine late";
// A Managed Agent and the app it works for (none: seen in the traces, not in the registry).
export type AgentLine = { app?: string; repo?: string; url?: string; health: AgentHealth };
// A cloud routine and its app; late: no traced run within lateAfterHours (counted from TRACED_SINCE at the earliest).
// tracedLong: tracing is older than the 14-day window, so no last run means none in 14 days, not none traced yet.
export type RoutineLine = { app?: string; repo?: string; url?: string; label: string; trigger?: string; lateAfterHours?: number; late: boolean; tracedLong: boolean; health: RoutineHealth };
export type Row = {
  name: string;
  url?: string;
  repo?: string;
  links: AppLink[];
  sentry?: string;
  health?: Health;
  slow: boolean;
  errors?: SentryApp;
  late: Job[]; // scheduled jobs past their lateAfterHours
  jobsError?: string; // the last-ran page failed while the app is up: late jobs would go unseen
  agents: AgentLine[]; // the app's registered agents
  routines: RoutineLine[]; // the app's registered cloud routines
  problems: Problem[];
};
// watched: apps with a Sentry project; uptime: the rest, health check only.
export type Board = { problems: Row[]; watched: Row[]; uptime: Row[]; agents: AgentLine[]; routines: RoutineLine[]; dormant: AppEntry[]; checkedAt: string; sentryOk: boolean; agentsOk: boolean; routinesOk: boolean };

export const SLOW_MS = 3000;

const isLate = (j: Job, now: Date) => !j.lastRan || now.getTime() - Date.parse(j.lastRan) > j.lateAfterHours * 3600e3;

function row(a: { name: string; url?: string; repo?: string; links: AppLink[] }, sentry: string | undefined, health: Health | undefined, errors: SentryApp | undefined, jobs: Jobs | undefined, now: Date, agents: AgentLine[] = [], routines: RoutineLine[] = []): Row {
  const problems: Problem[] = [];
  if (health && !health.up) problems.push("down");
  if (errors?.newIssue24h) problems.push("new error");
  const late = jobs?.ok ? jobs.jobs.filter((j) => isLate(j, now)) : [];
  // A down app's last-ran page fails too; "down" already says it.
  const jobsError = jobs && !jobs.ok && health?.up !== false ? jobs.reason : undefined;
  if (late.length || jobsError) problems.push("late");
  if (agents.some((l) => l.health.failedNew)) problems.push("agent failed");
  if (routines.some((l) => l.health.failedNew)) problems.push("routine failed");
  if (routines.some((l) => l.late)) problems.push("routine late");
  return { name: a.name, url: a.url, repo: a.repo, links: a.links, sentry, health, slow: !!health?.up && health.ms > SLOW_MS, errors, late, jobsError, agents, routines, problems };
}

// An app's name as a Sentry slug: "Käsilane" → "kasilane", "Keila Leht Ultra" → "keila-leht-ultra".
export const slugOf = (name: string) =>
  name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Problems first, then apps with an open issue, then A–Z.
const rank = (r: Row) => (r.problems.length ? 0 : r.errors?.openCount ? 1 : 2);
const byRank = (a: Row, b: Row) => rank(a) - rank(b) || a.name.localeCompare(b.name, "et");

export function buildBoard(apps: AppEntry[], sentry: SentrySummary, health: Record<string, Health>, now = new Date(), jobs: Record<string, Jobs> = {}, agents: AgentSummary = { ok: true, byName: {} }, routines: RoutineSummary = { ok: true, byName: {} }): Board {
  // Without a `sentry` slug in the registry, a Sentry project named after the app is its project, so wiring an app
  // needs no Launchpad deploy.
  const slug = (a: AppEntry) => a.sentry ?? (sentry.bySlug[slugOf(a.name)] ? slugOf(a.name) : undefined);
  // Live apps only: a project matching a dormant app still shows, named by its slug.
  const registered = new Set(apps.filter((a) => a.status === "live").map(slug).filter(Boolean));
  // Registered agents with no session in 7 days still show (as quiet); agents only the traces know show by name.
  const agentLines = new Map<string, AgentLine[]>();
  for (const a of apps.filter((a) => a.status === "live" && a.agents))
    agentLines.set(a.name, a.agents!.map((n) => ({ app: a.name, repo: a.repo, url: a.url, health: agents.byName[n] ?? emptyAgent(n) })));
  // Agents of a dormant app that still run show as strays, like a Sentry project matching a dormant app.
  const known = new Set(apps.filter((a) => a.status === "live").flatMap((a) => a.agents ?? []));
  const strays: AgentLine[] = Object.values(agents.byName).filter((h) => !known.has(h.name)).map((health) => ({ health }));
  // Cloud routines the same way. Late only with Sentry answering: unknown is not late.
  const routineLine = (health: RoutineHealth, a?: AppEntry, r?: AppRoutine): RoutineLine => {
    const from = Math.max(Date.parse(health.last?.at ?? TRACED_SINCE), Date.parse(TRACED_SINCE));
    const late = routines.ok && r?.lateAfterHours != null && now.getTime() - from > r.lateAfterHours * 3600e3;
    const tracedLong = now.getTime() - Date.parse(TRACED_SINCE) > 14 * 864e5;
    return { app: a?.name, repo: a?.repo, url: a?.url, label: r?.label ?? health.name, trigger: r?.trigger, lateAfterHours: r?.lateAfterHours, late, tracedLong, health };
  };
  const routineLines = new Map<string, RoutineLine[]>();
  for (const a of apps.filter((a) => a.status === "live" && a.routines))
    routineLines.set(a.name, a.routines!.map((r) => routineLine(routines.byName[r.name] ?? emptyRoutine(r.name), a, r)));
  const knownRoutines = new Set(apps.filter((a) => a.status === "live").flatMap((a) => (a.routines ?? []).map((r) => r.name)));
  const strayRoutines = Object.values(routines.byName).filter((h) => !knownRoutines.has(h.name)).map((h) => routineLine(h));
  const live = [
    ...apps.filter((a) => a.status === "live").map((a) => row(a, slug(a), health[a.name], slug(a) ? sentry.bySlug[slug(a)!] : undefined, jobs[a.name], now, agentLines.get(a.name), routineLines.get(a.name))),
    // A Sentry project missing from the registry still shows, named by its slug.
    ...Object.keys(sentry.bySlug).filter((s) => !registered.has(s)).map((s) => row({ name: s, url: undefined, links: [] }, s, undefined, sentry.bySlug[s], undefined, now)),
  ].sort(byRank);
  return {
    problems: live.filter((r) => r.problems.length),
    watched: live.filter((r) => r.sentry),
    uptime: live.filter((r) => !r.sentry),
    // A failure in 24 h first, then by app (unregistered last) and agent.
    agents: [...[...agentLines.values()].flat(), ...strays].sort(
      (x, y) => +y.health.failedNew - +x.health.failedNew || +!x.app - +!y.app || (x.app ?? "").localeCompare(y.app ?? "", "et") || x.health.name.localeCompare(y.health.name),
    ),
    dormant: apps.filter((a) => a.status === "dormant").sort((a, b) => a.name.localeCompare(b.name, "et")),
    checkedAt: now.toISOString(),
    // A problem (failed in 24 h, or late) first, then by app (unregistered last).
    routines: [...[...routineLines.values()].flat(), ...strayRoutines].sort(
      (x, y) => +(y.health.failedNew || y.late) - +(x.health.failedNew || x.late) || +!x.app - +!y.app || (x.app ?? "").localeCompare(y.app ?? "", "et") || x.label.localeCompare(y.label),
    ),
    sentryOk: sentry.ok,
    agentsOk: agents.ok,
    routinesOk: routines.ok,
  };
}
