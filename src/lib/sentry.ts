// SENTRY_API is only set by check-ui-flows' fixture server.
const API = process.env.SENTRY_API ?? "https://de.sentry.io/api/0/organizations/bits-and-pixels-ou";
// ponytail: junk projects waiting for the owner's delete (plan Task 1.1); drop this line once they are gone.
const RETIRED = new Set(["javascript-nextjs", "keeletark"]);

export type SentryApp = {
  errors24h: number;
  errors7d: number;
  newIssue24h: boolean;
  newest?: { title: string; url: string; lastSeen: string };
};
export type SentrySummary = { ok: boolean; bySlug: Record<string, SentryApp> };

type Issue = { title: string; permalink: string; firstSeen: string; lastSeen: string; project: { slug: string } };
type Counts = { data: { project: string; "count()": number }[] };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Sentry ${r.status} on ${path.split("?")[0]}`);
  return r.json() as Promise<T>;
}

// Production events only, from every project.
const production = (params: [string, string][]) =>
  new URLSearchParams([...params, ["environment", "production"], ["environment", "vercel-production"], ["project", "-1"]]);

const errorCounts = (statsPeriod: string) =>
  get<Counts>(`events/?${production([["dataset", "errors"], ["field", "project"], ["field", "count()"], ["statsPeriod", statsPeriod], ["per_page", "100"]])}`);

// Four org-level calls. Any failure → { ok: false }: the page still shows health checks and says Sentry is unreachable.
export async function getSentrySummary(now = Date.now()): Promise<SentrySummary> {
  try {
    const [projects, issues, day, week] = await Promise.all([
      get<{ slug: string }[]>("projects/"),
      // ponytail: first 100 unresolved issues, newest lastSeen first; paginate if one week ever holds more.
      get<Issue[]>(`issues/?${production([["query", "is:unresolved"], ["statsPeriod", "7d"], ["limit", "100"], ["sort", "date"]])}`),
      errorCounts("24h"),
      errorCounts("7d"),
    ]);
    const bySlug: Record<string, SentryApp> = {};
    for (const p of projects) if (!RETIRED.has(p.slug)) bySlug[p.slug] = { errors24h: 0, errors7d: 0, newIssue24h: false };
    for (const c of day.data) if (bySlug[c.project]) bySlug[c.project].errors24h = c["count()"];
    for (const c of week.data) if (bySlug[c.project]) bySlug[c.project].errors7d = c["count()"];
    for (const i of issues) {
      const app = bySlug[i.project.slug];
      if (!app) continue;
      const issue = { title: i.title, url: i.permalink, lastSeen: i.lastSeen };
      // The issue shown is the first one that is new in 24 h, else the most recently seen one.
      if (!app.newIssue24h && now - Date.parse(i.firstSeen) < 864e5) {
        app.newIssue24h = true;
        app.newest = issue;
      } else app.newest ??= issue;
    }
    return { ok: true, bySlug };
  } catch {
    return { ok: false, bySlug: {} };
  }
}
