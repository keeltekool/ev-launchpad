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

const SEVEN_DAYS = 7 * 24 * 60 * 60;

async function fetchJSON(url, headers) {
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export default async function handler(req, res) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) return res.status(500).json({ error: 'Missing SENTRY_AUTH_TOKEN' });

  const headers = { Authorization: `Bearer ${token}` };
  const since = Math.floor(Date.now() / 1000) - SEVEN_DAYS;

  // ponytail: sequential to avoid Sentry 429 rate limits
  const results = [];
  for (const p of PROJECTS) {
    try {
      // 1. Unresolved issues
      const issues = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/issues/?query=is:unresolved&sort=date&limit=100`,
        headers
      );

      // 2. Event stats (last 7 days) — proves SDK is alive
      const stats = await fetchJSON(
        `${SENTRY_BASE}/projects/${SENTRY_ORG}/${p.slug}/stats/?stat=received&resolution=1d&since=${since}`,
        headers
      );

      const unresolvedCount = issues.length;
      const lastSeen = unresolvedCount > 0 ? issues[0].lastSeen : null;

      // stats is [[timestamp, count], ...] for each day
      const dailyCounts = Array.isArray(stats) ? stats.map(s => s[1]) : [];
      const totalEvents = dailyCounts.reduce((a, b) => a + b, 0);
      const eventsToday = dailyCounts.length > 0 ? dailyCounts[dailyCounts.length - 1] : 0;

      let status = 'green';
      if (unresolvedCount >= 6 || (lastSeen && Date.now() - new Date(lastSeen).getTime() < 3600000)) {
        status = 'red';
      } else if (unresolvedCount > 0) {
        status = 'yellow';
      }

      // If SDK has never sent any event, flag it
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

  res.setHeader('Cache-Control', 'no-cache');
  return res.json({
    projects: results,
    updatedAt: new Date().toISOString(),
    sentryDashboard: `https://${SENTRY_ORG}.sentry.io`,
  });
}
