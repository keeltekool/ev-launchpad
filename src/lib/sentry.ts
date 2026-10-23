const API = "https://de.sentry.io/api/0/organizations/bits-and-pixels-ou";

export type SentryApp = {
  errors24h: number;
  errors7d: number;
  newIssue24h: boolean;
  newest?: { title: string; url: string; lastSeen: string };
};
export type SentrySummary = { ok: boolean; bySlug: Record<string, SentryApp> };

type Issue = { title: string; permalink: string; firstSeen: string; lastSeen: string; project: { slug: string } };
// Grouped by project, stats_v2 answers totals only (no series), so 24 h and 7 d are two calls.
type Stats = { groups: { by: { project: number }; totals: { "sum(quantity)": number } }[] };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Sentry ${r.status} on ${path.split("?")[0]}`);
  return r.json() as Promise<T>;
}

const errorTotals = (statsPeriod: string) =>
  get<Stats>(`stats_v2/?${new URLSearchParams({ field: "sum(quantity)", groupBy: "project", category: "error", outcome: "accepted", statsPeriod })}`);

// Four org-level calls. Any failure → { ok: false }: the page still shows health checks and says Sentry is unreachable.
export async function getSentrySummary(now = Date.now()): Promise<SentrySummary> {
  const issueQuery = new URLSearchParams({ query: "is:unresolved", statsPeriod: "7d", limit: "100", sort: "date" });
  issueQuery.append("environment", "production");
  issueQuery.append("environment", "vercel-production");
  try {
    const [projects, issues, day, week] = await Promise.all([
      get<{ id: string; slug: string }[]>("projects/"),
      get<Issue[]>(`issues/?${issueQuery}`),
      errorTotals("24h"),
      errorTotals("7d"),
    ]);
    const bySlug: Record<string, SentryApp> = {};
    const slugById = new Map(projects.map((p) => [Number(p.id), p.slug]));
    for (const p of projects) bySlug[p.slug] = { errors24h: 0, errors7d: 0, newIssue24h: false };
    const total = (stats: Stats, key: "errors24h" | "errors7d") => {
      for (const g of stats.groups) {
        const app = bySlug[slugById.get(g.by.project) ?? ""];
        if (app) app[key] = g.totals["sum(quantity)"];
      }
    };
    total(day, "errors24h");
    total(week, "errors7d");
    for (const i of issues) {
      const app = bySlug[i.project.slug];
      if (!app) continue;
      if (now - Date.parse(i.firstSeen) < 864e5) app.newIssue24h = true;
      // Issues come newest lastSeen first, so the first one per project is its newest.
      app.newest ??= { title: i.title, url: i.permalink, lastSeen: i.lastSeen };
    }
    return { ok: true, bySlug };
  } catch {
    return { ok: false, bySlug: {} };
  }
}
