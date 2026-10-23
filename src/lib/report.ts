// Reports a failure to Sentry so its alert fires. A plain envelope POST, no SDK (docs/SENTRY-STANDARD.md,
// "Real failures"): nothing to install, and the same code runs on the server and in the browser.
const DSN = new URL("https://4d7808d147ff807e68c60d6c28255b6c@o4510963717439488.ingest.de.sentry.io/4512307393134672");
const ENDPOINT = `${DSN.origin}/api${DSN.pathname}/envelope/?sentry_version=7&sentry_key=${DSN.username}`;

export async function report(area: string, err: unknown, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") return;
  const e = err instanceof Error ? err : new Error(String(err));
  const vercelEnv = process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV;
  const event_id = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: vercelEnv ? `vercel-${vercelEnv}` : "production",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tags: { area, runtime: typeof window === "undefined" ? "server" : "browser" },
    extra: { ...extra, stack: e.stack },
    fingerprint: [area, e.name], // one issue per failure kind, whatever the message says
    exception: { values: [{ type: e.name, value: e.message }] },
  };
  const body = [JSON.stringify({ event_id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  try {
    await fetch(ENDPOINT, { method: "POST", body, keepalive: true, signal: AbortSignal.timeout(3000) });
  } catch {
    // Reporting must never break the caller.
  }
}
