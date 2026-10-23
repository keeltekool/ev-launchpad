import type { AppEntry, AppLink } from "./apps";
import type { Health } from "./health";
import type { SentryApp, SentrySummary } from "./sentry";

export type Problem = "down" | "new error";
export type Row = {
  name: string;
  url?: string;
  links: AppLink[];
  sentry?: string;
  health?: Health;
  errors?: SentryApp;
  problems: Problem[];
};
export type Board = { problems: Row[]; live: Row[]; dormant: AppEntry[]; checkedAt: string; sentryOk: boolean };

function row(name: string, links: AppLink[], url: string | undefined, sentry: string | undefined, health: Health | undefined, errors: SentryApp | undefined): Row {
  const problems: Problem[] = [];
  if (health && !health.up) problems.push("down");
  if (errors?.newIssue24h) problems.push("new error");
  return { name, url, links, sentry, health, errors, problems };
}

// Problems first, then apps with an unresolved issue in the last 7 days, then A–Z.
const rank = (r: Row) => (r.problems.length ? 0 : r.errors?.newest ? 1 : 2);

export function buildBoard(apps: AppEntry[], sentry: SentrySummary, health: Record<string, Health>, now = new Date()): Board {
  const registered = new Set(apps.map((a) => a.sentry).filter(Boolean));
  const live = [
    ...apps.filter((a) => a.status === "live").map((a) => row(a.name, a.links, a.url, a.sentry, health[a.name], a.sentry ? sentry.bySlug[a.sentry] : undefined)),
    // A Sentry project missing from the registry still shows, named by its slug.
    ...Object.keys(sentry.bySlug).filter((s) => !registered.has(s)).map((s) => row(s, [], undefined, s, undefined, sentry.bySlug[s])),
  ].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "et"));
  return {
    problems: live.filter((r) => r.problems.length),
    live,
    dormant: apps.filter((a) => a.status === "dormant").sort((a, b) => a.name.localeCompare(b.name, "et")),
    checkedAt: now.toISOString(),
    sentryOk: sentry.ok,
  };
}
