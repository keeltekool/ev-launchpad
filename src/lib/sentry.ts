// SENTRY_API is only set by check-ui-flows' fixture server, and ignored in production so the token never leaves for another host.
const API = (process.env.VERCEL_ENV !== "production" && process.env.SENTRY_API) || "https://de.sentry.io/api/0/organizations/bits-and-pixels-ou";
const WEB = "https://bits-and-pixels-ou.sentry.io";
// ponytail: junk projects waiting for the owner's delete (plan Task 1.1); drop this line once they are gone.
const RETIRED = new Set(["javascript-nextjs", "keeletark"]);

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  url: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  open: boolean;
  area?: string; // the `area` tag report() sets: where in the app it failed
};
export type SentryApp = {
  projectUrl: string; // the app's issue list in Sentry
  newIssue24h: boolean;
  openCount: number;
  latest?: SentryIssue; // the error to show: open before resolved, newest first
};
export type SentrySummary = { ok: boolean; bySlug: Record<string, SentryApp> };

type Issue = { id: string; shortId: string; title: string; permalink: string; count: string; firstSeen: string; lastSeen: string; status: string; project: { slug: string } };
type Areas = { data: { "issue.id": number; area: string | null }[] };

async function get<T>(path: string): Promise<T> {
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

// Three org-level calls. Any failure → { ok: false }: the page still shows health checks and says Sentry is unreachable.
export async function getSentrySummary(now = Date.now()): Promise<SentrySummary> {
  try {
    const [projects, issues, areas] = await Promise.all([
      get<{ id: string; slug: string }[]>("projects/"),
      // An empty query lists resolved issues too (the default is unresolved only).
      // ponytail: first 100 issues of the week, newest lastSeen first; paginate if one week ever holds more.
      get<Issue[]>(`issues/?${production([["query", ""], ["limit", "100"], ["sort", "date"]])}`),
      get<Areas>(`events/?${production([["dataset", "errors"], ["field", "issue.id"], ["field", "area"], ["field", "count()"], ["per_page", "100"]])}`),
    ]);
    const areaOf = new Map(areas.data.filter((a) => a.area).map((a) => [String(a["issue.id"]), a.area!]));
    const bySlug: Record<string, SentryApp> = {};
    for (const p of projects)
      if (!RETIRED.has(p.slug)) bySlug[p.slug] = { projectUrl: `${WEB}/issues/?project=${p.id}&statsPeriod=7d`, newIssue24h: false, openCount: 0 };
    // Issues come newest lastSeen first. The one shown per app is its first new open issue, else its newest open one,
    // else its newest resolved one.
    const rank = (i: SentryIssue) => (i.open ? (now - Date.parse(i.firstSeen) < 864e5 ? 0 : 1) : 2);
    for (const i of issues) {
      const app = bySlug[i.project.slug];
      if (!app) continue;
      const issue: SentryIssue = {
        id: i.id,
        shortId: i.shortId,
        title: i.title,
        url: i.permalink,
        count: Number(i.count),
        firstSeen: i.firstSeen,
        lastSeen: i.lastSeen,
        open: i.status === "unresolved",
        area: areaOf.get(i.id),
      };
      if (issue.open) app.openCount++;
      if (rank(issue) === 0) app.newIssue24h = true;
      if (!app.latest || rank(issue) < rank(app.latest)) app.latest = issue;
    }
    return { ok: true, bySlug };
  } catch {
    return { ok: false, bySlug: {} };
  }
}
