// Reports a failure to Sentry so its alert fires. A plain envelope POST, no SDK (docs/SENTRY-STANDARD.md,
// "Real failures"): nothing to install, and the same code runs on the server and in the browser.
const DSN = new URL("https://4d7808d147ff807e68c60d6c28255b6c@o4510963717439488.ingest.de.sentry.io/4512307393134672");
const ENDPOINT = `${DSN.origin}/api${DSN.pathname}/envelope/?sentry_version=7&sentry_key=${DSN.username}`;
const lastSent = new Map<string, number>();

// Code locations for Sentry's stack view: V8 "at fn (file:1:2)" / "at file:1:2" and Firefox/Safari "fn@file:1:2"
// lines, oldest call first as Sentry expects. Lines it cannot read are skipped.
export function frames(stack = "") {
  return stack
    .split("\n")
    .flatMap((line) => {
      const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/) ?? line.match(/^(.*?)@(.+?):(\d+):(\d+)$/);
      if (!m) return [];
      return [{ function: m[1] || "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|^node:/.test(m[2]) }];
    })
    .reverse();
}

// extra.kind splits one area's failures into separate issues (e.g. "all" vs "partial", an HTTP status), so a
// full outage does not hide inside an issue that a partial failure already opened.
export async function report(area: string, err: unknown, extra?: Record<string, unknown>) {
  // Vercel production only: a local `next start` is NODE_ENV=production too, and previews must not alert.
  if ((process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV) !== "production") return;
  const e = err instanceof Error ? err : new Error(String(err));
  const fingerprint = [area, e.name, ...(extra?.kind == null ? [] : [String(extra.kind)])]; // one issue per failure kind, whatever the message says
  // At most one event per failure kind per minute from one server instance or page: a failure on a hot path must not
  // use up the org's error quota. The alert still fires on the first.
  const key = fingerprint.join("|");
  if (Date.now() - (lastSent.get(key) ?? 0) < 60_000) return;
  lastSent.set(key, Date.now());
  const stack = frames(e.stack);
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
    fingerprint,
    exception: { values: [{ type: e.name, value: e.message, ...(stack.length ? { stacktrace: { frames: stack } } : {}) }] },
  };
  const body = [JSON.stringify({ event_id, sent_at: new Date().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  try {
    await fetch(ENDPOINT, { method: "POST", body, keepalive: true, signal: AbortSignal.timeout(3000) });
  } catch {
    // Reporting must never break the caller.
  }
}
