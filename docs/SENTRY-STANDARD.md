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

## Real failures (watched apps)
Init alone only sends crashes and timings. In the 14 days before 23.10, production sent no issues at all, because every failure the apps handle is caught. For each watched app:
- **Read the app's own decisions first** (`docs/DEVIATIONS.md`, `docs/SPEC.md`, `STACK.md`). Keepr and Hinnavaht ruled out the server SDK because its import breaks their cold-start budget.
- **`src/lib/report.ts`**: `report(area, err, extra?)` posts an event envelope straight to `https://<ingest host>/api/<project id>/envelope/?sentry_key=<public key>`. It uses no SDK, and the same code runs on the server and in the browser. The event carries `tags.area`, `fingerprint: [area, err.name, extra.kind?]` (one issue per failure kind; pass `extra.kind`, such as "all" vs "partial" or an HTTP status, so a full outage does not land in an issue a partial failure already opened), `environment: vercel-production` and the commit SHA. It is sent only when `VERCEL_ENV` (server) or `NEXT_PUBLIC_VERCEL_ENV` (browser) is `production`: `NODE_ENV` is `production` on previews and on a local `next start` too. Reference copy: `launchpad/src/lib/report.ts`.
- **Call `report()` where a failure is swallowed:** a `catch` that returns a fallback, a non-OK response from an outside API, a cron send that only counts failures, or a browser fetch that answers 5xx. Expected outcomes (not found, 4xx validation, the user denying permission, an expired link) are not reported.
- **With no server SDK, `instrumentation.ts` exports `onRequestError`, which calls `report()`.** Uncaught route errors are reported that way.
- **Under Turbopack the server SDK has no route wrappers, so nothing flushes manually captured events.** If an app keeps the server SDK, follow every manual `captureException` with `await Sentry.flush(2000)`.
- **Alert:** `sentry alert issues create bits-and-pixels-ou/<slug> --name "New or regressed issue → email" --condition '{"type":"first_seen_event","comparison":true,"conditionResult":true}' --condition '{"type":"regression_event","comparison":true,"conditionResult":true}' --action '{"type":"email","data":{},"config":{"targetType":"user","targetIdentifier":"4286511"}}' --frequency 5`. Fire history: `sentry api organizations/bits-and-pixels-ou/workflows/<id>/group-history/`.
- **Proof:** trigger one real failure in production without writing data, then see the issue and the workflow's fire history. Keepr: a malformed multipart `POST /api/upload` from a logged-in page produced KEEPR-3 within 1 s and the alert fired.
- **When every input is validated** (no safe server failure), prove the browser path: open the production page in Playwright, answer one of its API calls with `page.route(..., r => r.fulfill({ status: 503 }))`, and do the action. The request never reaches the server, and the production bundle's `report()` sends the event (Käsilane, KASILANE-2). This also proves `NEXT_PUBLIC_VERCEL_ENV` is set in the bundle.
- **Name the Sentry project after the app** (`slugOf(name)`: lowercase, no diacritics, hyphens). Launchpad then matches it without a registry edit.

## Per app, in order
1. Check `<repo>/.git/claude-lock` (repo lock), then `git pull`.
2. `sentry project create` (new apps only) and read the DSN from `sentry project view --json`.
3. Add or replace the files above, then `npm i @sentry/nextjs@10.76.2 --save-exact`.
4. `npm run build`, commit, push, `node ~/.claude/scripts/ship.mjs /`.
5. `node C:/Users/Kasutaja/Claude_Projects/launchpad/scripts/sentry-proof.mjs <slug> <url>` → PASS.
6. Alert rule: a new issue sends an email (see the plan, Task 1.6).
7. Set `sentry: "<slug>"` on the app's entry in Launchpad's `data/apps.json`.
