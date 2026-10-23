// Reports a failure to Sentry so its alert fires. A plain envelope POST, no SDK (docs/SENTRY-STANDARD.md,
// "Real failures"): nothing to install, and the same code runs on the server and in the browser.
const DSN = new URL("https://4d7808d147ff807e68c60d6c28255b6c@o4510963717439488.ingest.de.sentry.io/4512307393134672");
const ENDPOINT = `${DSN.origin}/api${DSN.pathname}/envelope/?sentry_version=7&sentry_key=${DSN.username}`;

// extra.kind splits one area's failures into separate issues (e.g. "all" vs "partial", an HTTP status), so a
// full outage does not hide inside an issue that a partial failure already opened.
export async function report(area: string, err: unknown, extra?: Record<string, unknown>) {
  // Vercel production only: a local `next start` is NODE_ENV=production too, and previews must not alert.
  if ((process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) !== "production") return;
  const e = err instanceof Error ? err : new Error(String(err));
  const event_id = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: "vercel-production",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tags: { area, runtime: typeof window === "undefined" ? "server" : "browser" },
    extra: { ...extra, stack: e.stack },
    fingerprint: [area, e.name, ...(extra?.kind == null ? [] : [String(extra.kind)])], // one issue per failure kind, whatever the message says
    exception: { values: [{ type: e.name, value: e.message }] },
  };
  const body = [JSON.stringify({ event_id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  try {
    await fetch(ENDPOINT, { method: "POST", body, keepalive: true, signal: AbortSignal.timeout(3000) });
  } catch {
    // Reporting must never break the caller.
  }
}
