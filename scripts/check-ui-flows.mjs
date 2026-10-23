#!/usr/bin/env node
// Click-through of every Launchpad flow at 375 and 1440 (plan Task 2.9). Run by ship.mjs after each deploy.
// Usage: node scripts/check-ui-flows.mjs [baseUrl]   (passcode from env LAUNCHPAD_PASSCODE or .env.local; never printed)
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import('playwright').catch(() =>
  import(pathToFileURL(join(homedir(), '.claude/scripts/node_modules/playwright/index.mjs')).href));

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
  await p.goto(`${BASE}/?key=${encodeURIComponent(PASS)}`);
  await p.waitForSelector('table.ledger', { timeout: 30000 });
  check('the right ?key= link unlocks and drops the key from the address', new URL(p.url()).search === '', p.url());
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
    const allClear = await p.getByText(/^All \d+ live apps up · no new errors in 24 h$/).count();
    const trouble = await p.locator('#trouble').count();
    check('the problems block or the all-clear line renders', allClear + trouble === 1, `allClear=${allClear} trouble=${trouble}`);
  });

  await step('search', async () => {
    const rows = p.locator('table.ledger tbody tr');
    const total = await rows.count();
    await p.locator('body').click({ position: { x: 5, y: 5 } });
    await p.keyboard.press('/');
    check('/ focuses the search field', await p.evaluate(() => document.activeElement?.id === 'find'));
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

await browser.close();
console.log(`\n${failed ? `FAIL: ${failed} check(s) failed` : 'All UI click-flows passed'} · screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
