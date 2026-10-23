# Sentry standard for the owner's Next.js apps

Checked 23.10.2026 against the Sentry Next.js manual-setup and build-options docs and the Next 16 docs (docs-agent report, sources in the plan's Phase 1). Replaces the setup section of `POSTMORTEM-SENTRY-SETUP.md`; the postmortem stays as history. One correction to it: no source shows `tunnelRoute` failing on Turbopack. We drop it for simplicity, not because it is broken.

## Org and tooling
- Org `bits-and-pixels-ou` (EU ingest `*.ingest.de.sentry.io`), Developer plan.
- CLI `sentry` 0.47.0 (logged in as the owner): `sentry project create bits-and-pixels-ou/<slug>:javascript-nextjs`, `sentry project view bits-and-pixels-ou/<slug> --json` (DSN), `sentry alert issues create`.
- SDK: `@sentry/nextjs@10.76.2` exact. v11 exists; moving every app to it is a separate job.

## Files
Put them where `app/` lives: in `src/` if the project has `src/app`, otherwise at the root.

| File | Content |
|---|---|
| `instrumentation-client.ts` | `Sentry.init(OPTIONS)` + `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;` |
| `sentry.server.config.ts` | `Sentry.init(OPTIONS)` |
| `sentry.edge.config.ts` | `Sentry.init(OPTIONS)` |
| `instrumentation.ts` | `register()` imports `./sentry.server.config` when `NEXT_RUNTIME === "nodejs"` and `./sentry.edge.config` when `"edge"`; `export const onRequestError = Sentry.captureRequestError;` |
| `app/global-error.tsx` | `"use client"`; `Sentry.captureException(error)` in `useEffect`; renders a plain fallback |

```ts
// OPTIONS, identical in all three init files
{
  dsn: "<project DSN>",              // public by design; hardcoded so no env setup is needed
  enabled: process.env.NODE_ENV === "production", // local dev sends nothing
  tracesSampleRate: 1.0,             // low-traffic personal apps; spans quota is 5M/month
}
```

```ts
// next.config.ts
import { withSentryConfig } from "@sentry/nextjs/config";
export default withSentryConfig(nextConfig, { org: "bits-and-pixels-ou", project: "<slug>", silent: !process.env.CI });
```
- Import `withSentryConfig` from `@sentry/nextjs/config`. In 10.76.2 the export from `@sentry/nextjs` is a deprecated wrapper (`build/cjs/config/deprecatedWithSentryConfig.js`) that prints a warning on every build and is removed in v11 (correction 23.10, found in the category-pro build log).
- No `tunnelRoute`. Source maps are not uploaded: that needs a Sentry token per Vercel project, a later step.
- Static-export apps (`output: "export"`, e.g. Fileshift) get only `instrumentation-client.ts` and `global-error.tsx`. There is no server.

## Per app, in order
1. Check `<repo>/.git/claude-lock` (repo lock), then `git pull`.
2. `sentry project create` (new apps only) and read the DSN from `sentry project view --json`.
3. Add or replace the files above, then `npm i @sentry/nextjs@10.76.2 --save-exact`.
4. `npm run build`, commit, push, `node ~/.claude/scripts/ship.mjs /`.
5. `node C:/Users/Kasutaja/Claude_Projects/launchpad/scripts/sentry-proof.mjs <slug> <url>` → PASS.
6. Alert rule: a new issue sends an email (see the plan, Task 1.6).
7. Set `sentry: "<slug>"` on the app's entry in Launchpad's `data/apps.json`.
