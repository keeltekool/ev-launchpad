export type Health = { up: boolean; status: number | null; ms: number };

// 401/403 = the server answered (a login wall or a bot block), so the app is up.
export const isUp = (status: number) => status < 400 || status === 401 || status === 403;

export async function checkApp(url: string): Promise<Health> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Launchpad health check" } });
    await r.body?.cancel();
    return { up: isUp(r.status), status: r.status, ms: Date.now() - t0 };
  } catch {
    return { up: false, status: null, ms: Date.now() - t0 };
  }
}
