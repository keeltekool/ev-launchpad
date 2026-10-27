import type { AppEntry, AppLink } from "./apps";
import type { Health, Job, Jobs } from "./health";
import type { SentryApp, SentrySummary } from "./sentry";

export type Problem = "down" | "new error" | "late";
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
  problems: Problem[];
};
// watched: apps with a Sentry project; uptime: the rest, health check only.
export type Board = { problems: Row[]; watched: Row[]; uptime: Row[]; dormant: AppEntry[]; checkedAt: string; sentryOk: boolean };

export const SLOW_MS = 3000;

export const isLate = (j: Job, now: Date) => !j.lastRan || now.getTime() - Date.parse(j.lastRan) > j.lateAfterHours * 3600e3;

function row(a: { name: string; url?: string; repo?: string; links: AppLink[] }, sentry: string | undefined, health: Health | undefined, errors: SentryApp | undefined, jobs: Jobs | undefined, now: Date): Row {
  const problems: Problem[] = [];
  if (health && !health.up) problems.push("down");
  if (errors?.newIssue24h) problems.push("new error");
  const late = jobs?.ok ? jobs.jobs.filter((j) => isLate(j, now)) : [];
  // A down app's last-ran page fails too; "down" already says it.
  const jobsError = jobs && !jobs.ok && health?.up !== false ? jobs.reason : undefined;
  if (late.length || jobsError) problems.push("late");
  return { name: a.name, url: a.url, repo: a.repo, links: a.links, sentry, health, slow: !!health?.up && health.ms > SLOW_MS, errors, late, jobsError, problems };
}

// An app's name as a Sentry slug: "Käsilane" → "kasilane", "Keila Leht Ultra" → "keila-leht-ultra".
export const slugOf = (name: string) =>
  name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Problems first, then apps with an open issue, then A–Z.
const rank = (r: Row) => (r.problems.length ? 0 : r.errors?.openCount ? 1 : 2);
const byRank = (a: Row, b: Row) => rank(a) - rank(b) || a.name.localeCompare(b.name, "et");

export function buildBoard(apps: AppEntry[], sentry: SentrySummary, health: Record<string, Health>, now = new Date(), jobs: Record<string, Jobs> = {}): Board {
  // Without a `sentry` slug in the registry, a Sentry project named after the app is its project, so wiring an app
  // needs no Launchpad deploy.
  const slug = (a: AppEntry) => a.sentry ?? (sentry.bySlug[slugOf(a.name)] ? slugOf(a.name) : undefined);
  // Live apps only: a project matching a dormant app still shows, named by its slug.
  const registered = new Set(apps.filter((a) => a.status === "live").map(slug).filter(Boolean));
  const live = [
    ...apps.filter((a) => a.status === "live").map((a) => row(a, slug(a), health[a.name], slug(a) ? sentry.bySlug[slug(a)!] : undefined, jobs[a.name], now)),
    // A Sentry project missing from the registry still shows, named by its slug.
    ...Object.keys(sentry.bySlug).filter((s) => !registered.has(s)).map((s) => row({ name: s, url: undefined, links: [] }, s, undefined, sentry.bySlug[s], undefined, now)),
  ].sort(byRank);
  return {
    problems: live.filter((r) => r.problems.length),
    watched: live.filter((r) => r.sentry),
    uptime: live.filter((r) => !r.sentry),
    dormant: apps.filter((a) => a.status === "dormant").sort((a, b) => a.name.localeCompare(b.name, "et")),
    checkedAt: now.toISOString(),
    sentryOk: sentry.ok,
  };
}
