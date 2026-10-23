export type Health = { up: boolean; status: number | null; ms: number };

// 401/403 = the server answered (a login wall or a bot block), so the app is up.
export const isUp = (status: number) => status < 400 || status === 401 || status === 403;

// GET as a page load (Clerk answers non-page requests to protected routes with 404) and follow redirects
// by hand: Clerk's cookie handshake bounces forever without a cookie jar, so a redirect still going after
// 5 hops counts as answered.
export async function checkApp(url: string): Promise<Health> {
  const t0 = Date.now();
  const signal = AbortSignal.timeout(10_000);
  try {
    let target = url;
    let r: Response;
    for (let hop = 0; ; hop++) {
      r = await fetch(target, { redirect: "manual", signal, headers: { accept: "text/html", "user-agent": "Launchpad health check" } });
      await r.body?.cancel();
      const next = r.headers.get("location");
      if (r.status < 300 || r.status >= 400 || !next || hop === 4) break;
      target = new URL(next, target).href;
    }
    return { up: isUp(r.status), status: r.status, ms: Date.now() - t0 };
  } catch {
    return { up: false, status: null, ms: Date.now() - t0 };
  }
}
