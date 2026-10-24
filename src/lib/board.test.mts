// node --test src/lib/board.test.mts  (Node 24 strips the types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBoard } from "./board.ts";
import { isUp } from "./health.ts";
import type { AppEntry } from "./apps.ts";
import { getSentrySummary, type SentryApp } from "./sentry.ts";

const app = (name: string, extra: Partial<AppEntry> = {}): AppEntry => ({ name, url: `https://${name.toLowerCase()}.test`, status: "live", links: [], ...extra });
const up = { up: true, status: 200, ms: 100 };
const quiet: SentryApp = { errors24h: 0, errors7d: 0, newIssue24h: false };
const issue = (newIssue24h: boolean): SentryApp => ({ errors24h: 1, errors7d: 3, newIssue24h, newest: { title: "Boom", url: "https://sentry.test/1", lastSeen: "2026-10-23T10:00:00Z" } });

test("order: problems, then apps with an unresolved issue, then A–Z; dormant apart", () => {
  const apps = [app("Zeta"), app("Alpha"), app("Mid", { sentry: "mid" }), app("Down"), app("Fresh", { sentry: "fresh" }), app("Old", { status: "dormant" })];
  const board = buildBoard(
    apps,
    { ok: true, bySlug: { mid: issue(false), fresh: issue(true) } },
    { Zeta: up, Alpha: up, Mid: up, Fresh: up, Down: { up: false, status: null, ms: 10000 } },
  );
  assert.deepEqual(board.live.map((r) => r.name), ["Down", "Fresh", "Mid", "Alpha", "Zeta"]);
  assert.deepEqual(board.problems.map((r) => [r.name, r.problems]), [["Down", ["down"]], ["Fresh", ["new error"]]]);
  assert.deepEqual(board.dormant.map((a) => a.name), ["Old"]);
});

test("a Sentry project missing from the registry shows as a live row named by its slug", () => {
  const board = buildBoard([app("Known", { sentry: "known" })], { ok: true, bySlug: { known: quiet, "new-app": quiet } }, { Known: up });
  assert.deepEqual(board.live.map((r) => [r.name, r.sentry, r.url]), [["Known", "known", "https://known.test"], ["new-app", "new-app", undefined]]);
});

test("an app without a registry slug takes the Sentry project named after it (no second row)", () => {
  const board = buildBoard([app("Käsilane"), app("Keila Leht Ultra")], { ok: true, bySlug: { kasilane: issue(true), "keila-leht-ultra": quiet } }, { Käsilane: up, "Keila Leht Ultra": up });
  assert.deepEqual(board.live.map((r) => [r.name, r.sentry, r.errors?.newIssue24h]), [["Käsilane", "kasilane", true], ["Keila Leht Ultra", "keila-leht-ultra", false]]);
  assert.deepEqual(board.problems.map((r) => r.name), ["Käsilane"]);
});

test("Sentry unreachable: health still decides, the flag is off", () => {
  const board = buildBoard([app("A", { sentry: "a" })], { ok: false, bySlug: {} }, { A: up });
  assert.equal(board.sentryOk, false);
  assert.deepEqual(board.live.map((r) => [r.name, r.problems, r.errors]), [["A", [], undefined]]);
});

test("401/403 count as up (login wall or bot block); 5xx and 404 do not", () => {
  for (const s of [200, 301, 401, 403]) assert.equal(isUp(s), true, String(s));
  for (const s of [404, 500, 503]) assert.equal(isUp(s), false, String(s));
});

test("registry: every url is https, names and Sentry slugs are unique", () => {
  const apps: AppEntry[] = JSON.parse(readFileSync(new URL("../../data/apps.json", import.meta.url), "utf8"));
  for (const a of apps) {
    assert.equal(new URL(a.url).protocol, "https:", a.name);
    for (const l of a.links) assert.equal(new URL(l.url).protocol, "https:", `${a.name} ${l.label}`);
  }
  const names = apps.map((a) => a.name);
  const slugs = apps.flatMap((a) => (a.sentry ? [a.sentry] : []));
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(slugs).size, slugs.length);
});

// Sentry calls answered from a table keyed by path (projects/, issues/, events/).
const sentryAnswers = (answers: Record<string, unknown>) => {
  globalThis.fetch = (async (url: string) => {
    const path = new URL(url).pathname.split("/").at(-2)!;
    return path in answers ? Response.json(answers[path]) : new Response("{}", { status: 401 });
  }) as typeof fetch;
};

test("Sentry: a bad token leaves no data and the flag off", async () => {
  sentryAnswers({});
  assert.deepEqual(await getSentrySummary(), { ok: false, bySlug: {} });
});

test("Sentry: junk projects are dropped; a new issue is the one shown, not the latest seen", async () => {
  const now = Date.parse("2026-10-24T00:00:00Z");
  const issue = (slug: string, title: string, firstSeen: string) => ({ title, permalink: `https://sentry.test/${title}`, firstSeen, lastSeen: "2026-10-23T23:00:00Z", project: { slug } });
  sentryAnswers({
    projects: [{ slug: "keepr" }, { slug: "javascript-nextjs" }, { slug: "keeletark" }],
    issues: [issue("keepr", "Old", "2026-10-01T00:00:00Z"), issue("keepr", "New", "2026-10-23T20:00:00Z"), issue("javascript-nextjs", "Dev", "2026-10-23T20:00:00Z")],
    events: { data: [{ project: "keepr", "count()": 4 }, { project: "javascript-nextjs", "count()": 33 }] },
  });
  const s = await getSentrySummary(now);
  assert.deepEqual(Object.keys(s.bySlug), ["keepr"]);
  assert.equal(s.bySlug.keepr.newIssue24h, true);
  assert.equal(s.bySlug.keepr.newest?.title, "New");
  assert.equal(s.bySlug.keepr.errors24h, 4);
});

test("report: nothing outside Vercel production; one event per failure kind per minute", async () => {
  let posts = 0;
  globalThis.fetch = (async () => {
    posts++;
    return new Response("{}");
  }) as typeof fetch;
  const { report } = await import("./report.ts");
  delete process.env.VERCEL_ENV;
  await report("test:local", new Error("x"));
  assert.equal(posts, 0);
  process.env.VERCEL_ENV = "production";
  await report("test:a", new Error("first"));
  await report("test:a", new Error("same kind, within the minute"));
  await report("test:a", new Error("another kind"), { kind: "all" });
  delete process.env.VERCEL_ENV;
  assert.equal(posts, 2);
});

test("passcode: \"T\u00fcranahk\" matches whether \u00fc is one character or u + accent", async () => {
  process.env.LAUNCHPAD_PASSCODE = "T\u00fcranahk";
  const { passcodeMatches } = await import("./passcode.ts");
  assert.equal(passcodeMatches("T\u00fcranahk"), true);
  assert.equal(passcodeMatches("Tu\u0308ranahk"), true);
  assert.equal(passcodeMatches("Turanahk"), false);
  assert.equal(passcodeMatches("lp-old"), false);
  delete process.env.LAUNCHPAD_PASSCODE;
});
