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

  // Two time windows: 24h at 1h resolution (live today count) + 7d at 1d resolution (sparkline)
  const oneDayAgo = new Date(now - 86400000);
  const sevenDaysAgo = new Date(now - 7 * 86400000);
  const fmt = d => d.toISOString().replace(/\.\d+Z/, 'Z');

  // Resolve slug → Sentry project ID
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
      const issues = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/issues/?query=is:unresolved&sort=date&limit=100`,
        headers
      );

      const projId = slugToId[p.slug];
      let dailyCounts = [];
      let totalRequests = 0;
      let requestsToday = 0;

      if (projId) {
        // 24h hourly — for accurate "today" count (no aggregation delay)
        const recent = await fetchJSON(
          `${SENTRY_BASE}/organizations/${SENTRY_ORG}/stats_v2/?field=sum(quantity)&category=transaction&project=${projId}&interval=1h&start=${fmt(oneDayAgo)}&end=${fmt(now)}`,
          headers
        );
        const hourly = recent.groups?.[0]?.series?.['sum(quantity)'] || [];
        requestsToday = hourly.reduce((a, b) => a + b, 0);

        // 7d daily — for sparkline shape + weekly total
        const weekly = await fetchJSON(
          `${SENTRY_BASE}/organizations/${SENTRY_ORG}/stats_v2/?field=sum(quantity)&category=transaction&project=${projId}&interval=1d&start=${fmt(sevenDaysAgo)}&end=${fmt(now)}`,
          headers
        );
        const weekGroup = weekly.groups?.[0];
        dailyCounts = weekGroup?.series?.['sum(quantity)'] || [];
        const weeklyTotal = weekGroup?.totals?.['sum(quantity)'] || 0;

        // Use the higher of: weekly total vs today's hourly sum
        // (daily aggregation lags, so today's bucket in the sparkline may be stale)
        totalRequests = Math.max(weeklyTotal, requestsToday);

        // Patch the last sparkline bar with the live hourly count if it's higher
        if (dailyCounts.length > 0 && requestsToday > dailyCounts[dailyCounts.length - 1]) {
          dailyCounts[dailyCounts.length - 1] = requestsToday;
        }
      }

      const unresolvedCount = issues.length;
      const lastSeen = unresolvedCount > 0 ? issues[0].lastSeen : null;
      const sdkActive = totalRequests > 0;

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
