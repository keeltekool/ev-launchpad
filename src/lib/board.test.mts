// node --test src/lib/board.test.mts  (Node 24 strips the types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBoard, type Row } from "./board.ts";
import { isUp } from "./health.ts";
import type { AppEntry } from "./apps.ts";
import { getSentrySummary, type SentryApp, type SentryIssue } from "./sentry.ts";
import { downPrompt, errorPrompt } from "./prompt.ts";

const app = (name: string, extra: Partial<AppEntry> = {}): AppEntry => ({ name, url: `https://${name.toLowerCase()}.test`, status: "live", links: [], ...extra });
const up = { up: true, status: 200, ms: 100 };
const quiet: SentryApp = { projectUrl: "https://sentry.test/p", newIssue24h: false, openCount: 0 };
const anIssue = (open: boolean): SentryIssue => ({ id: "9", shortId: "APP-9", title: "Boom", url: "https://sentry.test/9", count: 3, firstSeen: "2026-10-20T10:00:00Z", lastSeen: "2026-10-23T10:00:00Z", open });
const issue = (newIssue24h: boolean, open = true): SentryApp => ({ ...quiet, newIssue24h, openCount: open ? 1 : 0, latest: anIssue(open) });
const names = (rows: Row[]) => rows.map((r) => r.name);

test("Sentry apps first (problems, open issues, A–Z); uptime-only apart; dormant apart", () => {
  const apps = [app("Zeta"), app("Alpha"), app("Mid", { sentry: "mid" }), app("Calm", { sentry: "calm" }), app("Down"), app("Fresh", { sentry: "fresh" }), app("Old", { status: "dormant" })];
  const board = buildBoard(
    apps,
    { ok: true, bySlug: { mid: issue(false), fresh: issue(true), calm: issue(false, false) } },
    { Zeta: up, Alpha: up, Mid: up, Calm: up, Fresh: up, Down: { up: false, status: null, ms: 10000, timedOut: true } },
  );
  assert.deepEqual(names(board.watched), ["Fresh", "Mid", "Calm"]);
  assert.deepEqual(names(board.uptime), ["Down", "Alpha", "Zeta"]);
  assert.deepEqual(board.problems.map((r) => [r.name, r.problems]), [["Down", ["down"]], ["Fresh", ["new error"]]]);
  assert.deepEqual(board.dormant.map((a) => a.name), ["Old"]);
});

test("slow: up but answering after 3 s", () => {
  const board = buildBoard([app("Snail"), app("Hare")], { ok: true, bySlug: {} }, { Snail: { up: true, status: 200, ms: 4200 }, Hare: up });
  assert.deepEqual(board.uptime.map((r) => [r.name, r.slow]), [["Hare", false], ["Snail", true]]);
});

test("a Sentry project missing from the registry shows as a watched row named by its slug", () => {
  const board = buildBoard([app("Known", { sentry: "known" })], { ok: true, bySlug: { known: quiet, "new-app": quiet } }, { Known: up });
  assert.deepEqual(board.watched.map((r) => [r.name, r.sentry, r.url]), [["Known", "known", "https://known.test"], ["new-app", "new-app", undefined]]);
});

test("an app without a registry slug takes the Sentry project named after it (no second row)", () => {
  const board = buildBoard([app("Käsilane"), app("Keila Leht Ultra")], { ok: true, bySlug: { kasilane: issue(true), "keila-leht-ultra": quiet } }, { Käsilane: up, "Keila Leht Ultra": up });
  assert.deepEqual(board.watched.map((r) => [r.name, r.sentry, r.errors?.newIssue24h]), [["Käsilane", "kasilane", true], ["Keila Leht Ultra", "keila-leht-ultra", false]]);
  assert.deepEqual(board.problems.map((r) => r.name), ["Käsilane"]);
});

test("Sentry unreachable: health still decides, the flag is off, registry slugs stay watched", () => {
  const board = buildBoard([app("A", { sentry: "a" })], { ok: false, bySlug: {} }, { A: up });
  assert.equal(board.sentryOk, false);
  assert.deepEqual(board.watched.map((r) => [r.name, r.problems, r.errors]), [["A", [], undefined]]);
});

test("prompts: repo, issue link and the CLI line for an error; the reason for a down app", () => {
  const board = buildBoard(
    [app("Keepr", { sentry: "keepr", repo: "keepr" }), app("Livery", { repo: "livery" })],
    { ok: true, bySlug: { keepr: { ...issue(true), latest: { ...anIssue(true), area: "oracle:off" } } } },
    { Keepr: up, Livery: { up: false, status: 500, ms: 300 } },
  );
  const keepr = board.watched[0];
  const e = errorPrompt(keepr);
  for (const part of ["C:\\Users\\Kasutaja\\Claude_Projects\\keepr", "Error: Boom", "APP-9, open, 3 events", "Where: oracle:off", "https://sentry.test/9", "sentry api organizations/bits-and-pixels-ou/issues/9/events/latest/"])
    assert.ok(e.includes(part), part);
  const d = downPrompt(board.uptime[0], "2026-10-24T07:00:00Z");
  assert.ok(d.includes("Livery down: answered 500 at 24 Oct, 10:00"), d);
  assert.ok(d.includes("C:\\Users\\Kasutaja\\Claude_Projects\\livery"), d);
});

test("401/403 count as up (login wall or bot block); 5xx and 404 do not", () => {
  for (const s of [200, 301, 401, 403]) assert.equal(isUp(s), true, String(s));
  for (const s of [404, 500, 503]) assert.equal(isUp(s), false, String(s));
});

test("registry: every url is https, names and Sentry slugs are unique, every live app has its repo folder", () => {
  const apps: AppEntry[] = JSON.parse(readFileSync(new URL("../../data/apps.json", import.meta.url), "utf8"));
  for (const a of apps) {
    assert.equal(new URL(a.url).protocol, "https:", a.name);
    for (const l of a.links) assert.equal(new URL(l.url).protocol, "https:", `${a.name} ${l.label}`);
  }
  const names = apps.map((a) => a.name);
  const slugs = apps.flatMap((a) => (a.sentry ? [a.sentry] : []));
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.deepEqual(apps.filter((a) => a.status === "live" && !a.repo).map((a) => a.name), []);
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

test("Sentry: junk projects dropped; shown is the new open issue, else the newest open, else the newest resolved", async () => {
  const now = Date.parse("2026-10-24T00:00:00Z");
  const issue = (id: string, slug: string, status: string, firstSeen: string, lastSeen = "2026-10-23T23:00:00Z") =>
    ({ id, shortId: id, title: `T${id}`, permalink: `https://sentry.test/${id}`, count: "2", firstSeen, lastSeen, status, project: { slug } });
  sentryAnswers({
    projects: [{ id: "1", slug: "keepr" }, { id: "2", slug: "livery" }, { id: "3", slug: "mini-me" }, { id: "4", slug: "javascript-nextjs" }, { id: "5", slug: "keeletark" }],
    issues: [
      issue("10", "keepr", "resolved", "2026-10-23T22:00:00Z"),
      issue("11", "keepr", "unresolved", "2026-10-01T00:00:00Z", "2026-10-23T21:00:00Z"),
      issue("12", "keepr", "unresolved", "2026-10-23T20:00:00Z", "2026-10-23T20:00:00Z"),
      issue("20", "livery", "resolved", "2026-10-22T00:00:00Z"),
      issue("30", "mini-me", "unresolved", "2026-10-01T00:00:00Z", "2026-10-23T22:00:00Z"),
      issue("31", "mini-me", "resolved", "2026-10-23T23:30:00Z", "2026-10-23T23:30:00Z"),
      issue("40", "javascript-nextjs", "unresolved", "2026-10-23T20:00:00Z"),
    ],
    events: { data: [{ "issue.id": 12, area: "oracle:off" }, { "issue.id": 20, area: null }] },
  });
  const s = await getSentrySummary(now);
  assert.deepEqual(Object.keys(s.bySlug), ["keepr", "livery", "mini-me"]);
  assert.deepEqual([s.bySlug.keepr.newIssue24h, s.bySlug.keepr.openCount, s.bySlug.keepr.latest?.id, s.bySlug.keepr.latest?.area], [true, 2, "12", "oracle:off"]);
  assert.deepEqual([s.bySlug.livery.newIssue24h, s.bySlug.livery.latest?.id, s.bySlug.livery.latest?.open, s.bySlug.livery.latest?.area], [false, "20", false, undefined]);
  assert.deepEqual([s.bySlug["mini-me"].newIssue24h, s.bySlug["mini-me"].latest?.id], [false, "30"]);
  assert.equal(s.bySlug.keepr.projectUrl, "https://bits-and-pixels-ou.sentry.io/issues/?project=1&statsPeriod=7d");
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
