const SENTRY_ORG = 'bits-and-pixels-ou';
const SENTRY_BASE = 'https://de.sentry.io/api/0';

const PROJECTS = [
  { name: 'Travel-Assist-Poland', slug: 'travel-assist-poland', appUrl: 'https://travel-assist-poland.vercel.app' },
  { name: 'Keeletark', slug: 'keeletark', appUrl: 'https://keeletark.vercel.app' },
  { name: 'ApplyKit', slug: 'applykit', appUrl: 'https://cv-tailor-plus.vercel.app' },
  { name: 'SongDrop-app', slug: 'songdrop-app', appUrl: 'https://songdrop-app.vercel.app' },
  { name: 'HankeRadar', slug: 'hankeradar', appUrl: 'https://hankeradar-alpha.vercel.app' },
  { name: 'Athlon', slug: 'athlon', appUrl: 'https://athlon.vercel.app' },
];

async function fetchJSON(url, headers) {
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export default async function handler(req, res) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) return res.status(500).json({ error: 'Missing SENTRY_AUTH_TOKEN' });

  const headers = { Authorization: `Bearer ${token}` };
  const now = new Date();
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const startISO = sevenDaysAgo.toISOString().replace(/\.\d+Z/, 'Z');
  const endISO = now.toISOString().replace(/\.\d+Z/, 'Z');

  // ponytail: one org-level stats_v2 call for ALL projects (transactions + spans)
  // stats/?stat=received only counts errors — stats_v2 with category=transaction is what we need
  let orgStats;
  try {
    orgStats = await fetchJSON(
      `${SENTRY_BASE}/organizations/${SENTRY_ORG}/stats_v2/?field=sum(quantity)&groupBy=project&groupBy=category&category=transaction&interval=1d&start=${startISO}&end=${endISO}`,
      headers
    );
  } catch (err) {
    orgStats = { groups: [] };
  }

  // Build lookup: slug → { dailyCounts, total }
  const txByProject = {};
  for (const g of orgStats.groups || []) {
    const pid = g.by?.project;
    const series = g.series?.['sum(quantity)'] || [];
    const total = g.totals?.['sum(quantity)'] || 0;
    if (pid) txByProject[pid] = { dailyCounts: series, total };
  }

  // ponytail: sequential per-project for issues (can't batch)
  const results = [];
  for (const p of PROJECTS) {
    try {
      const issues = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/issues/?query=is:unresolved&sort=date&limit=100`,
        headers
      );

      const unresolvedCount = issues.length;
      const lastSeen = unresolvedCount > 0 ? issues[0].lastSeen : null;

      // Match org stats by project ID — need to resolve slug to ID
      // ponytail: match by iterating (6 projects, fine)
      const projInfo = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/`,
        headers
      );
      const projId = projInfo.id;
      const tx = txByProject[Number(projId)] || { dailyCounts: [], total: 0 };

      const dailyCounts = tx.dailyCounts;
      const totalEvents = tx.total;
      const eventsToday = dailyCounts.length > 0 ? dailyCounts[dailyCounts.length - 1] : 0;

      let status = 'green';
      if (unresolvedCount >= 6 || (lastSeen && Date.now() - new Date(lastSeen).getTime() < 3600000)) {
        status = 'red';
      } else if (unresolvedCount > 0) {
        status = 'yellow';
      }

      const sdkActive = totalEvents > 0;
      if (!sdkActive) status = 'dormant';

      results.push({
        ...p, status, unresolvedCount, lastSeen,
        totalEvents7d: totalEvents,
        eventsToday,
        dailyCounts,
        sdkActive,
      });
    } catch (err) {
      results.push({
        ...p, status: 'unknown', unresolvedCount: null, lastSeen: null,
        totalEvents7d: null, eventsToday: null, dailyCounts: [], sdkActive: null,
        error: err.message,
      });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.json({
    projects: results,
    updatedAt: new Date().toISOString(),
    sentryDashboard: `https://${SENTRY_ORG}.sentry.io`,
  });
}
