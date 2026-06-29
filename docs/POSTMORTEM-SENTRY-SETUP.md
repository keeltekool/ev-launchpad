# Post-Mortem: Sentry Integration (2026-06-28 → 2026-06-29)

## What happened

Sentry error monitoring was added to 6 Next.js projects and a health dashboard was built in Launchpad. After deployment, all projects showed "dormant" (0 events) despite real user sessions. Three separate bugs compounded — each masked the next.

## Root causes

### Bug 1: Wrong client init filename (SDK never initialized)

**What:** All 6 projects used `sentry.client.config.ts` for client-side Sentry init.  
**Why it broke:** `@sentry/nextjs` v10 with Next.js 16 (Turbopack) requires `instrumentation-client.ts`. The old v7 filename is not auto-detected. The Sentry SDK library was bundled but `Sentry.init()` never executed on the client.  
**Evidence:** `grep -r "ingest.de.sentry" .next/static/` found 0 matches before rename, 1 match after.  
**Fix:** Rename `sentry.client.config.ts` → `instrumentation-client.ts` in all projects.

### Bug 2: Broken tunnel route (events silently dropped)

**What:** All 6 `next.config.ts` files had `tunnelRoute: "/sentry-tunnel"`.  
**Why it broke:** `tunnelRoute` creates a Next.js API route via a webpack plugin hook. Turbopack (Next.js 16 default) doesn't run webpack plugins — the route was never created. The SDK was configured to send events to `/sentry-tunnel`, which returned HTML (the app's fallback page). Events silently failed.  
**Evidence:** `curl keeletark.vercel.app/sentry-tunnel` returned the landing page HTML. No tunnel route in `.next/server/app/`.  
**Fix:** Remove `tunnelRoute` from `withSentryConfig`. SDK sends directly to `de.sentry.io`.

### Bug 3: Health API measured errors only (missed all transactions)

**What:** `/api/health` used `GET /projects/{slug}/stats/?stat=received` — the legacy stats endpoint.  
**Why it broke:** `stat=received` only counts **error events**. Sentry was receiving 258 spans and 69 transactions, but this endpoint returned 0 for all projects because no errors had occurred (which is correct — the apps work fine).  
**Evidence:** `stats_v2/?groupBy=category` showed `transaction: 69, span: 258`. Legacy `stats/?stat=received` showed 0.  
**Fix:** Switch to `stats_v2` API with `category=transaction`.

### Meta-bug: No Context7 pre-research

The original session installed Sentry from training-data knowledge (v7 patterns) without checking current docs. A single Context7 query would have shown `instrumentation-client.ts` is the correct filename. CLAUDE.md §5 requires Context7 pre-research before touching external libs.

## Collateral damage

- 2 projects (Travel-Assist-Poland, Athlon) had **no GitHub remote** — deployed via `vercel --prod` bypassing git entirely. Fixed: repos created, Vercel connected.
- Launchpad monitor feature (api/health.js, monitor.html, monitor.js) was deployed but **never committed to git**. Fixed: committed and pushed.
- ApplyKit commit swept in 90+ untracked test artifacts via `git add -A`. Cosmetic, not harmful.

## Timeline

| Time | Action |
|------|--------|
| Jun 28 ~20:00 | Sentry SDK added to 6 projects with wrong filename + tunnel |
| Jun 28 ~20:45 | HankeRadar partially fixed (client config renamed, but tunnel still broken) |
| Jun 29 11:05 | Post-mortem audit begins — all 6 showing dormant |
| Jun 29 11:15 | Tunnel route removed from all 6, committed, pushed |
| Jun 29 11:30 | Still 0 events after user session — tunnel wasn't the only bug |
| Jun 29 11:40 | Context7 docs confirm: `instrumentation-client.ts` required |
| Jun 29 11:42 | Client config renamed in all 6, committed, pushed |
| Jun 29 11:48 | Local build confirms DSN now in client bundle |
| Jun 29 11:50 | `stats_v2` shows 258 spans + 69 transactions — data WAS flowing |
| Jun 29 11:52 | Health API switched from legacy stats to stats_v2 |
| Jun 29 11:54 | Dashboard shows green: ApplyKit 44, HankeRadar 23, Keeletark 1 |

## Correct Sentry setup for Next.js 16 + @sentry/nextjs v10

### Required files (project root or src/)

| File | Purpose |
|------|---------|
| `instrumentation-client.ts` | Client-side `Sentry.init()` with DSN |
| `sentry.server.config.ts` | Server-side `Sentry.init()` with DSN |
| `sentry.edge.config.ts` | Edge runtime `Sentry.init()` with DSN |
| `instrumentation.ts` | Next.js instrumentation hook — imports server + edge configs |
| `app/global-error.tsx` (or `src/app/global-error.tsx`) | Global error boundary |

### next.config.ts

```typescript
import { withSentryConfig } from "@sentry/nextjs";

// Wrap existing config — DO NOT replace it
export default withSentryConfig(existingConfig, {
  org: "bits-and-pixels-ou",
  project: "<sentry-slug>",
  silent: !process.env.CI,
  // NO tunnelRoute — broken on Turbopack
});
```

### instrumentation-client.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "<project-dsn>",
  tracesSampleRate: 1.0,  // 100% for low-traffic personal projects
});
```

### instrumentation.ts

```typescript
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

### Sentry project creation

```bash
# Can't create via API on free plan — use dashboard:
# https://bits-and-pixels-ou.sentry.io/projects/new/
# Platform: Next.js, name: <project-slug>
# Copy the DSN from project settings
```

### Verification checklist

1. `npm run build` — completes without Sentry errors
2. `grep -r "ingest.de.sentry" .next/static/` — DSN appears in client bundle
3. Deploy to Vercel (via GitHub push)
4. Visit the app in browser
5. Check `stats_v2` API — transactions > 0 within minutes

### Sentry health API (Launchpad)

```
GET /api/0/organizations/{org}/stats_v2/
  ?field=sum(quantity)
  &groupBy=project
  &groupBy=category
  &category=transaction
  &interval=1d
  &start={7d_ago}&end={now}
```

This returns transactions per project per day. The legacy `stats/?stat=received` only counts errors — do NOT use it for activity monitoring.

### Environment

- Sentry org: `bits-and-pixels-ou` (EU region, `de.sentry.io`)
- Plan: Developer (free) — 5K errors + 5M spans + 10K transactions/month
- Auth token: `SENTRY_AUTH_TOKEN` in `~/.env` (scopes: event:read/write, org:read, project:admin/read/write, team:read/write)
- Auth token on Vercel: set in Launchpad project env vars (for health API)
