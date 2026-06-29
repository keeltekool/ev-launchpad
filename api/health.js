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

  // Resolve slug → Sentry project ID (needed for stats_v2 filtering)
  const slugToId = {};
  for (const p of PROJECTS) {
    try {
      const info = await fetchJSON(`${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/`, headers);
      slugToId[p.slug] = info.id;
    } catch { /* skip */ }
  }

  const results = [];
  for (const p of PROJECTS) {
    try {
      // 1. Unresolved issues (errors)
      const issues = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/issues/?query=is:unresolved&sort=date&limit=100`,
        headers
      );

      // 2. Request activity — hourly resolution (daily has aggregation delay), bucketed to days
      const projId = slugToId[p.slug];
      let dailyCounts = [];
      let totalRequests = 0;
      let requestsToday = 0;

      if (projId) {
        const stats = await fetchJSON(
          `${SENTRY_BASE}/organizations/${SENTRY_ORG}/stats_v2/?field=sum(quantity)&category=transaction&project=${projId}&interval=1h&start=${startISO}&end=${endISO}`,
          headers
        );
        const hourly = stats.groups?.[0]?.series?.['sum(quantity)'] || [];
        const intervals = stats.intervals || [];

        // Bucket hourly data into days
        const dayBuckets = {};
        for (let i = 0; i < intervals.length; i++) {
          const day = intervals[i].slice(0, 10);
          dayBuckets[day] = (dayBuckets[day] || 0) + (hourly[i] || 0);
        }
        const sortedDays = Object.keys(dayBuckets).sort();
        dailyCounts = sortedDays.map(d => dayBuckets[d]);
        totalRequests = hourly.reduce((a, b) => a + b, 0);
        requestsToday = dailyCounts.length > 0 ? dailyCounts[dailyCounts.length - 1] : 0;
      }

      const unresolvedCount = issues.length;
      const lastSeen = unresolvedCount > 0 ? issues[0].lastSeen : null;
      const sdkActive = totalRequests > 0;

      // Status: activity-first, errors as overlay
      let status = 'green';
      if (unresolvedCount >= 6 || (lastSeen && Date.now() - new Date(lastSeen).getTime() < 3600000)) {
        status = 'red';
      } else if (unresolvedCount > 0) {
        status = 'yellow';
      }
      if (!sdkActive) status = 'dormant';

      results.push({
        ...p, status, unresolvedCount, lastSeen,
        requests7d: totalRequests,
        requestsToday,
        dailyCounts,
        sdkActive,
      });
    } catch (err) {
      results.push({
        ...p, status: 'unknown', unresolvedCount: null, lastSeen: null,
        requests7d: null, requestsToday: null, dailyCounts: [], sdkActive: null,
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
