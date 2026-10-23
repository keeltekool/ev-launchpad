#!/usr/bin/env node
// Click-through of every Launchpad flow at 375 and 1440 (plan Task 2.9). Run by ship.mjs after each deploy.
// Usage: node scripts/check-ui-flows.mjs [baseUrl]   (passcode from env LAUNCHPAD_PASSCODE or .env.local; never printed)
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const { chromium } = await import('playwright').catch(() =>
  import(pathToFileURL(join(homedir(), '.claude/scripts/node_modules/playwright/index.mjs')).href));

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = (process.argv[2] ?? process.env.BASE ?? 'http://localhost:4870').replace(/\/$/, '');
const envFile = new URL('../.env.local', import.meta.url);
const PASS = process.env.LAUNCHPAD_PASSCODE
  ?? (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^LAUNCHPAD_PASSCODE="?([^"\r\n]+)"?/m)?.[1] : undefined);
if (!PASS) { console.error('LAUNCHPAD_PASSCODE not set (env or .env.local)'); process.exit(2); }
const apps = JSON.parse(readFileSync(new URL('../data/apps.json', import.meta.url), 'utf8'));
const SHOTS = join(tmpdir(), 'launchpad-flows');
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { check(name, false, e.message.split('\n')[0]); }
};

const browser = await chromium.launch();

// Logged out: every route goes to /unlock; a wrong ?key= link does too.
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`);
  check('logged out: / redirects to /unlock', new URL(p.url()).pathname === '/unlock', p.url());
  await p.goto(`${BASE}/?key=wrong-key`);
  check('logged out: a wrong ?key= link is refused', new URL(p.url()).pathname === '/unlock', p.url());
  const t0 = Date.now();
  await p.goto(`${BASE}/?key=${encodeURIComponent(PASS)}`);
  await p.waitForSelector('table.ledger', { timeout: 30000 });
  const renderMs = Date.now() - t0;
  check('the right ?key= link unlocks and drops the key from the address', new URL(p.url()).search === '', p.url());
  // Every outside call is capped at 10 s, so even an uncached board renders in under 15 s.
  check(`the board renders within 15 s (${renderMs} ms)`, renderMs < 15000, `${renderMs} ms`);
  await ctx.close();
}

for (const [label, width, height] of [['375', 375, 812], ['1440', 1440, 900]]) {
  console.log(`\n${label}px`);
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  const consoleErrors = [];
  p.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  await step('unlock form', async () => {
    await p.goto(`${BASE}/unlock`);
    await p.fill('#passcode', 'not-the-passcode');
    await Promise.all([p.waitForURL(/\/unlock\?wrong=1/), p.click('button[type=submit]')]);
    await p.locator('#wrong').waitFor({ timeout: 5000 });
    check('a wrong passcode is rejected with a message', true);
    await p.fill('#passcode', PASS);
    await Promise.all([p.waitForURL((u) => u.pathname === '/'), p.click('button[type=submit]')]);
    await p.waitForSelector('table.ledger', { timeout: 30000 });
    check('the right passcode unlocks the board', true);
  });

  await step('reload stays unlocked', async () => {
    await p.reload();
    await p.waitForSelector('table.ledger', { timeout: 30000 });
    check('after a reload the board is still unlocked', new URL(p.url()).pathname === '/');
  });

  await step('status entry', async () => {
    const allClear = await p.getByText(/^All \d+ live apps up · /).count();
    const trouble = await p.locator('#trouble').count();
    check('the problems block or the all-clear line renders', allClear + trouble === 1, `allClear=${allClear} trouble=${trouble}`);
    check('Sentry is reachable (no "Sentry unreachable" line)', (await p.getByText(/Sentry unreachable/).count()) === 0);
  });

  await step('search', async () => {
    const rows = p.locator('table.ledger tbody tr');
    const total = await rows.count();
    await p.locator('body').click({ position: { x: 5, y: 5 } });
    await p.keyboard.press('/');
    check('/ focuses the search field', await p.evaluate(() => document.activeElement?.id === 'find'));
    check('the focused search field shows its ring', await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle === 'solid'));
    await p.keyboard.type('keepr');
    const filtered = await rows.count();
    check('typing filters the rows', filtered >= 1 && filtered < total, `${filtered} of ${total}`);
    await p.keyboard.press('Escape');
    check('Esc clears the search', (await p.inputValue('#find')) === '' && (await rows.count()) === total);
  });

  await step('dormant', async () => {
    const details = p.locator('details');
    await details.locator('summary').click();
    check('Dormant expands', await details.evaluate((d) => d.open && d.querySelectorAll('li').length > 0));
  });

  await step('theme', async () => {
    const before = await p.evaluate(() => document.documentElement.dataset.theme);
    await p.getByRole('button', { name: /Night watch|Day log/ }).click();
    const after = await p.evaluate(() => document.documentElement.dataset.theme);
    await p.reload();
    await p.waitForSelector('table.ledger', { timeout: 30000 });
    const reloaded = await p.evaluate(() => document.documentElement.dataset.theme);
    check('the theme toggle switches and survives a reload', before !== after && reloaded === after, `${before} → ${after} → ${reloaded}`);
  });

  await step('link chip', async () => {
    const app = apps.find((a) => a.status === 'live' && a.links.length > 1);
    const row = p.locator('table.ledger tbody tr', { hasText: app.name }).first();
    const href = await row.locator('td[data-col="links"] a').nth(1).getAttribute('href');
    check(`a link chip's href matches the registry (${app.name} ${app.links[1].label})`, href === app.links[1].url, href);
  });

  if (width === 375) {
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no horizontal scroll at 375', sideways <= 0, `${sideways}px too wide`);
  }
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await p.screenshot({ path: join(SHOTS, `board-${label}.png`) });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?key=${encodeURIComponent(PASS)}`);
  await p.waitForSelector('table.ledger', { timeout: 30000 });
  await p.screenshot({ path: join(SHOTS, 'board-1920.png') });
  check('1920 screenshot taken', true);
  await ctx.close();
}

// Fixture board, local runs only: a second server from the same build, fed by a fake Sentry and two broken apps,
// so the Problems block, the 10 s timeout cap and the "Sentry unreachable" line all run in a real browser.
if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) await fixtures();
else console.log('\nfixture board: runs against a local build only (node scripts/check-ui-flows.mjs http://localhost:4870)');

async function fixtures() {
  console.log('\nfixture board');
  if (!existsSync(join(ROOT, '.next/BUILD_ID'))) return check('fixture board needs a local `next build` first', false);
  const seen = { firstSeen: new Date(Date.now() - 3600e3).toISOString(), lastSeen: new Date().toISOString() };
  const sentry = {
    projects: [{ slug: 'fixture-new' }, { slug: 'keeletark' }],
    issues: ['fixture-new', 'keeletark'].map((slug) => ({ title: `FixtureError: ${slug} broke`, permalink: `https://sentry.test/${slug}`, ...seen, project: { slug } })),
    events: { data: [{ project: 'fixture-new', 'count()': 2 }, { project: 'keeletark', 'count()': 5 }] },
  };
  const fake = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/hang') return; // never answers
    if (path === '/500') return res.writeHead(500).end();
    const key = path.match(/^\/sentry\/(projects|issues|events)\/$/)?.[1];
    if (key) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sentry[key]));
    res.writeHead(401).end('{}'); // /broken-sentry/…: a revoked token
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const fx = `http://127.0.0.1:${fake.address().port}`;
  const broken = [['Fixture 500', `${fx}/500`], ['Fixture hang', `${fx}/hang`], ['Fixture refused', 'http://127.0.0.1:9/']]
    .map(([name, url]) => ({ name, url, status: 'live', links: [{ label: 'App', url: 'https://example.test/' }] }));

  const serve = async (port, env) => {
    // A leftover server on the port would be tested in place of this build and env.
    if (await fetch(`http://localhost:${port}/unlock`).then(() => true, () => false)) throw new Error(`port ${port} is busy: stop the old server first`);
    const child = spawn(process.execPath, [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
      cwd: ROOT, stdio: 'ignore', env: { ...process.env, VERCEL_ENV: 'development', ...env }, // development: report() stays silent
    });
    for (let i = 0; i < 60; i++) {
      try { await fetch(`http://localhost:${port}/unlock`); return child; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
    child.kill();
    throw new Error(`next start on ${port} did not come up`);
  };
  const open = async (port, width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    const t0 = Date.now();
    await p.goto(`http://localhost:${port}/?key=${encodeURIComponent(PASS)}`);
    await p.waitForSelector('table.ledger', { timeout: 30000 });
    return { ctx, p, ms: Date.now() - t0 };
  };

  const a = await serve(4871, { SENTRY_API: `${fx}/sentry`, LAUNCHPAD_EXTRA_APPS: JSON.stringify(broken) });
  try {
    for (const [label, width, height] of [['375', 375, 812], ['1440', 1440, 900]]) {
      await step(`fixture ${label}`, async () => {
        const { ctx, p, ms } = await open(4871, width, height);
        if (label === '375') check(`a 10 s hang caps the render (${ms} ms)`, ms >= 10000 && ms < 16000, `${ms} ms`);
        const entry = (name) => p.locator('#trouble ~ ul li', { hasText: name });
        check(`${label}: the Problems block renders`, (await p.locator('#trouble').count()) === 1);
        check(`${label}: a 500 reads "Down: answered 500"`, (await entry('Fixture 500').innerText()).includes('Down: answered 500'));
        check(`${label}: a hang reads "no answer within 10 s"`, (await entry('Fixture hang').innerText()).includes('Down: no answer within 10 s'));
        check(`${label}: a refused connection reads "no connection"`, (await entry('Fixture refused').innerText()).includes('Down: no connection'));
        const fresh = entry('fixture-new').getByRole('link', { name: 'FixtureError: fixture-new broke' });
        check(`${label}: a new Sentry issue is listed and links to Sentry`, (await fresh.getAttribute('href')) === 'https://sentry.test/fixture-new');
        check(`${label}: the ledger strikes the down app and marks the new issue`,
          (await p.locator('table.ledger tr', { hasText: 'Fixture 500' }).locator('.down-name').count()) === 1
          && (await p.locator('table.ledger tr', { hasText: 'fixture-new' }).locator('.fresh-issue').count()) === 1);
        check(`${label}: junk Sentry projects stay hidden`, (await p.getByText('keeletark').count()) === 0);
        if (width === 375) check('fixture 375: no horizontal scroll', (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
        await p.screenshot({ path: join(SHOTS, `fixture-problems-${label}.png`) });
        await ctx.close();
      });
    }
  } finally { a.kill(); }

  const b = await serve(4872, { SENTRY_API: `${fx}/broken-sentry` });
  try {
    await step('fixture unreachable', async () => {
      const { ctx, p } = await open(4872, 1440, 900);
      check('Sentry down: the "Sentry unreachable" line shows', (await p.getByText('Sentry unreachable: the error columns are empty').count()) === 1);
      check('Sentry down: nothing claims "no new errors"', !(await p.locator('body').innerText()).includes('no new errors'));
      await p.screenshot({ path: join(SHOTS, 'fixture-unreachable-1440.png') });
      await ctx.close();
    });
  } finally { b.kill(); fake.close(); }
}

await browser.close();
console.log(`\n${failed ? `FAIL: ${failed} check(s) failed` : 'All UI click-flows passed'} · screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
