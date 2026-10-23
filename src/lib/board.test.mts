// node --test src/lib/board.test.mts  (Node 24 strips the types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBoard } from "./board.ts";
import { isUp } from "./health.ts";
import type { AppEntry } from "./apps.ts";
import type { SentryApp } from "./sentry.ts";

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
