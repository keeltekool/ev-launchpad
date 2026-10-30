// SENTRY_API is only set by check-ui-flows' fixture server, and ignored in production so the token never leaves for another host.
const API = (process.env.VERCEL_ENV !== "production" && process.env.SENTRY_API) || "https://de.sentry.io/api/0/organizations/bits-and-pixels-ou";
const WEB = "https://bits-and-pixels-ou.sentry.io";
// ponytail: junk projects waiting for the owner's delete (plan Task 1.1); drop this line once they are gone.
const RETIRED = new Set(["javascript-nextjs", "keeletark"]);
// Managed Agents traces, read by agents.ts: no app errors, so no Watched row.
export const AGENTS_PROJECT = "claude-agents";
// Cloud routine traces (Claude Code OTel from the routines' cloud environment, 29.10): no Watched row either.
const TRACES_ONLY = new Set([AGENTS_PROJECT, "claude-routines"]);

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  url: string;
  count: number; // all-time events
  firstSeen: string;
  lastSeen: string;
  state: "open" | "resolved" | "archived";
  back: boolean; // open again after it was resolved (Sentry: regressed or escalating)
  area?: string; // the `area` tag report() sets: where in the app it failed
  culprit?: string; // Sentry's code location: the newest in-app stack frame, e.g. "load(/var/task/.next/server/chunks/x.js)"
};
export type SentryApp = {
  projectUrl: string; // the app's issue list in Sentry
  newIssue24h: boolean; // an open issue that is new, or came back, in the last 24 h: a problem
  openCount: number;
  latest?: SentryIssue; // the error to show: a problem first, then open, then closed; newest first
  // The app's newest event of any kind (error or timing span, any environment) in 14 days; null when there was none;
  // undefined when Sentry did not answer that query.
  lastHeard?: string | null;
  // Nothing in 14 days from an app that used to send timings (the full SDK sends them on every page load), so its
  // reporting likely broke. Apps on the light reporter send errors only: silence is normal for them.
  silent: boolean;
};
export type SentrySummary = { ok: boolean; bySlug: Record<string, SentryApp> };

type Issue = {
  id: string;
  shortId: string;
  title: string;
  permalink: string;
  count: string;
  lifetime?: { count: string };
  firstSeen: string;
  lastSeen: string;
  status: string;
  substatus: string | null;
  culprit?: string;
  project: { slug: string };
};
type Areas = { data: { "issue.id": number; area: string | null }[] };
type Newest = { data: { project: string; "max(timestamp)": number | string }[] }; // spans: epoch seconds; errors: ISO

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Sentry ${r.status} on ${path.split("?")[0]}`);
  return r.json() as Promise<T>;
}

// Production events only, from every project, over the last 7 days.
const production = (params: [string, string][]) =>
  new URLSearchParams([...params, ["statsPeriod", "7d"], ["environment", "production"], ["environment", "vercel-production"], ["project", "-1"]]);

const DAY = 864e5;
const STATE: Record<string, SentryIssue["state"]> = { unresolved: "open", resolved: "resolved", ignored: "archived" };

// Five org-level calls. Any failure (but the two optional "last heard" ones) → { ok: false }: the page still shows health checks and says Sentry is unreachable.
export async function getSentrySummary(now = Date.now()): Promise<SentrySummary> {
  try {
    const newest = (dataset: string) =>
      get<Newest>(`events/?${new URLSearchParams([["dataset", dataset], ["field", "project"], ["field", "max(timestamp)"], ["statsPeriod", "14d"], ["project", "-1"], ["per_page", "100"]])}`);
    const [projects, issues, areas, heardRows] = await Promise.all([
      get<{ id: string; slug: string; firstTransactionEvent: boolean }[]>("projects/"),
      // An empty query lists resolved issues too (the default is unresolved only).
      // ponytail: first 100 issues of the week, newest lastSeen first; paginate if one week ever holds more.
      get<Issue[]>(`issues/?${production([["query", ""], ["limit", "100"], ["sort", "date"]])}`),
      // The area tag of the 100 most recently seen issues.
      get<Areas>(`events/?${production([["dataset", "errors"], ["field", "issue.id"], ["field", "area"], ["field", "max(timestamp)"], ["sort", "-max(timestamp)"], ["per_page", "100"]])}`),
      // "Last heard from": the newest error and the newest timing span per project. Optional, and only both together:
      // with one missing, a quiet app could read as silent. Without them the board only loses that line.
      Promise.all([newest("errors"), newest("spans")]).then((r) => r.flatMap((d) => d.data), () => null),
    ]);
    const heard = new Map<string, string>();
    for (const h of heardRows ?? []) {
      const v = h["max(timestamp)"];
      const t = new Date(typeof v === "number" ? v * 1000 : (v ?? NaN)).getTime();
      if (Number.isNaN(t)) continue; // an unreadable row must not take the Sentry data down with it
      const at = new Date(t).toISOString();
      if (at > (heard.get(h.project) ?? "")) heard.set(h.project, at);
    }
    // Rows come newest first; reversed, the newest area of each issue is written last and wins.
    const areaOf = new Map(areas.data.filter((a) => a.area).reverse().map((a) => [String(a["issue.id"]), a.area!]));
    const bySlug: Record<string, SentryApp> = {};
    for (const p of projects) {
      if (RETIRED.has(p.slug) || TRACES_ONLY.has(p.slug)) continue;
      const lastHeard = heardRows ? (heard.get(p.slug) ?? null) : undefined;
      bySlug[p.slug] = { projectUrl: `${WEB}/issues/?project=${p.id}&statsPeriod=7d`, newIssue24h: false, openCount: 0, lastHeard, silent: lastHeard === null && p.firstTransactionEvent };
    }
    const fresh = (i: SentryIssue) => i.state === "open" && (now - Date.parse(i.firstSeen) < DAY || (i.back && now - Date.parse(i.lastSeen) < DAY));
    const rank = (i: SentryIssue) => (fresh(i) ? 0 : i.state === "open" ? 1 : 2);
    // Issues come newest lastSeen first, so the first one of each rank per app is its newest.
    for (const i of issues) {
      const app = bySlug[i.project.slug];
      if (!app) continue;
      const state = STATE[i.status] ?? "open";
      const issue: SentryIssue = {
        id: i.id,
        shortId: i.shortId,
        title: i.title,
        url: i.permalink,
        count: Number(i.lifetime?.count ?? i.count),
        firstSeen: i.firstSeen,
        lastSeen: i.lastSeen,
        state,
        back: state === "open" && (i.substatus === "regressed" || i.substatus === "escalating"),
        area: areaOf.get(i.id),
        culprit: i.culprit || undefined,
      };
      if (state === "open") app.openCount++;
      if (fresh(issue)) app.newIssue24h = true;
      if (!app.latest || rank(issue) < rank(app.latest)) app.latest = issue;
    }
    return { ok: true, bySlug };
  } catch {
    return { ok: false, bySlug: {} };
  }
}
