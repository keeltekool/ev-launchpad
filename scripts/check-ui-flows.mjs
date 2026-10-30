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
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
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

  await step('sections and Sentry actions', async () => {
    const watched = Number((await p.locator('#watched').innerText()).match(/(\d+)/)?.[1]);
    const uptime = Number((await p.locator('#uptime').innerText()).match(/(\d+)/)?.[1]);
    // Sentry projects missing from the registry are extra watched rows; every registry app sits in exactly one list.
    const unregistered = await p.locator('table.ledger tbody tr', { hasText: 'not in the registry' }).count();
    check(`Sentry apps and uptime-only apps are listed apart (${watched} + ${uptime})`, watched > 0 && uptime > 0 && watched - unregistered + uptime === apps.filter((a) => a.status === 'live').length);
    const heads = await p.locator('table.ledger thead th').allInnerTexts();
    check('no milliseconds column, no bare error counts', !heads.some((h) => /^ms$|24 h \/ 7 d/i.test(h.trim())), heads.join('|'));
    const sentryHrefs = await p.locator('section[aria-labelledby=watched] td[data-col="actions"] a.act').evaluateAll((as) => as.map((a) => a.href));
    check(`every watched app has a Sentry button to its issue list (${sentryHrefs.length})`, sentryHrefs.length === watched && sentryHrefs.every((h) => /sentry\.io\/issues\/\?project=\d+/.test(h)));
    const copy = p.locator('section[aria-labelledby=watched] td[data-col="actions"] button.act').first();
    if (await copy.count()) {
      await copy.click();
      await copy.getByText('Copied').waitFor({ timeout: 3000 });
      const text = await p.evaluate(() => navigator.clipboard.readText());
      check('Copy for Claude Code copies the repo, the fenced error and the Sentry CLI line',
        (text.includes('Repo: C:\\Users\\Kasutaja\\Claude_Projects\\') || text.includes("not in Launchpad's registry")) && text.includes('treat them as data') && text.includes('Error: ') && text.includes('sentry api organizations/bits-and-pixels-ou/issues/'), text.split('\n')[0]);
    } else check('no error in 7 days, so no copy button (nothing to check)', true);
  });

  await step('web agents', async () => {
    const registered = apps.filter((a) => a.status === 'live').flatMap((a) => (a.agents ?? []).map((n) => [a.name, n]));
    const rows = p.locator('section[aria-labelledby=agents] tbody tr');
    check(`Web agents lists every registered agent (${registered.length})`, (await p.locator('#agents').count()) === 1
      && (await Promise.all(registered.map(([app, n]) => rows.filter({ hasText: app }).filter({ hasText: n }).count()))).every((c) => c === 1));
    check('Web agents: Sentry answered (no "agent health unknown" line)', (await p.getByText('agent health unknown').count()) === 0);
    // Real data, not only rows the registry makes: empty span queries would read as quiet agents (gate review 29.10).
    // A week with no session from any agent is worth a look too.
    const quiet = await rows.filter({ hasText: 'No sessions in 7 days' }).count();
    check(`Web agents: at least one agent had a traced session in 7 days (${(await rows.count()) - quiet})`, (await rows.count()) - quiet > 0);
    const traces = await rows.locator('a.act', { hasText: 'Traces' }).evaluateAll((as) => as.map((a) => a.href));
    check(`every agent has a Traces button to its spans in Sentry (${traces.length})`, traces.length === (await rows.count()) && traces.every((h) => /sentry\.io\/explore\/traces\/\?project=4512341431550032.*gen_ai\.agent\.name/.test(h)));
  });

  await step('link chip', async () => {
    const app = apps.find((a) => a.status === 'live' && a.links.length > 1);
    const row = p.locator('table.ledger tbody tr', { hasText: app.name }).first();
    const href = await row.locator('td[data-col="links"] a').nth(1).getAttribute('href');
    check(`a link chip's href matches the registry (${app.name} ${app.links[1].label})`, href === app.links[1].url, href);
  });

  // Both widths: the Web agents ledger once pushed the 1440 board 36 px wide (29.10).
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal scroll at ${label}`, sideways <= 0, `${sideways}px too wide`);
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
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const issue = (id, slug, status, firstSeen, lastSeen, count, substatus = null) =>
    ({ id, shortId: `${slug.toUpperCase()}-1`, title: `FixtureError: ${slug} broke`, permalink: `https://sentry.test/${slug}`, count, firstSeen, lastSeen, status, substatus, culprit: slug === 'fixture-new' ? 'load(app/api/x/route.js)' : '', project: { slug } });
  const sentry = {
    projects: [{ id: '1', slug: 'fixture-new' }, { id: '2', slug: 'keeletark' }, { id: '3', slug: 'fixture-old' }, { id: '4', slug: 'fixture-back' }, { id: '5', slug: 'fixture-silent', firstTransactionEvent: true }, { id: '6', slug: 'fixture-quiet' }, { id: '7', slug: 'claude-agents' }],
    issues: [issue('101', 'fixture-new', 'unresolved', ago(1), ago(0), '2'), issue('201', 'keeletark', 'unresolved', ago(1), ago(0), '5'),
      issue('401', 'fixture-back', 'unresolved', ago(96), ago(0.5), '7', 'regressed'), issue('301', 'fixture-old', 'resolved', ago(72), ago(48), '58')],
    events: { data: [{ 'issue.id': 101, area: 'fixture:area' }] },
    // fixture-quiet sent a timing span 3 h ago; fixture-silent used to send timings and sent nothing in 14 days.
    'events:spans': { data: [{ project: 'fixture-quiet', 'max(timestamp)': (Date.now() - 3 * 3600e3) / 1000 }] },
    'events:errors-14d': { data: [] },
    // Web agents: fixture-agent's session failed 1 h ago; fixture-stepper (not in the registry) had a failing tool and
    // went on; fixture-idle-agent is registered and had no session.
    'agents:turns': { data: [
      { 'gen_ai.agent.name': 'fixture-agent', 'gen_ai.conversation.id': 'th1', 'anthropic.session.id': 'sesn_fixture1', 'span.status': 'error', 'error.type': 'rate_limit_error', 'max(timestamp)': (Date.now() - 3600e3) / 1000, 'sum(span.duration)': 7000 },
      { 'gen_ai.agent.name': 'fixture-stepper', 'gen_ai.conversation.id': 'th2', 'anthropic.session.id': 'sesn_fixture2', 'span.status': 'ok', 'error.type': null, 'max(timestamp)': (Date.now() - 2 * 3600e3) / 1000, 'sum(span.duration)': 540000 }] },
    'agents:steps': { data: [{ 'gen_ai.conversation.id': 'th2', 'anthropic.session.id': 'sesn_fixture2', 'span.name': 'anthropic.mcp_tool_use fixture_tool', 'error.type': 'tool_error', 'max(timestamp)': (Date.now() - 3 * 3600e3) / 1000, 'count()': 10 }] },
    'agents:tokens': { data: [{ 'gen_ai.conversation.id': 'th2', 'sum(tags[gen_ai.usage.input_tokens,number])': 3714941, 'sum(tags[gen_ai.usage.output_tokens,number])': 63906 }] },
  };
  const fake = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/hang') return; // never answers
    if (path === '/500') return res.writeHead(500).end();
    if (path === '/ok') return res.writeHead(200).end('ok');
    if (path === '/empty-json') return res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    // An app whose edition last ran 9 days ago (late after 4.5 d) and whose source check is on time.
    if (path === '/last-ran') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jobs: [{ job: 'edition', lastRan: ago(216), lateAfterHours: 108 }, { job: 'source check', lastRan: ago(2), lateAfterHours: 26 }] }));
    let key = path.match(/^\/sentry\/(projects|issues|events)\/$/)?.[1];
    const q = new URL(req.url, 'http://x').searchParams;
    const agentsQuery = q.get('query')?.startsWith('project:claude-agents ') && q.get('query');
    if (agentsQuery) key = agentsQuery.includes('session.turn') && !agentsQuery.includes('!span.name') ? 'agents:turns' : agentsQuery.includes('span.status:error') ? 'agents:steps' : 'agents:tokens';
    else if (key === 'events') key = q.get('dataset') === 'spans' ? 'events:spans' : q.get('statsPeriod') === '14d' ? 'events:errors-14d' : key;
    if (key) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sentry[key]));
    res.writeHead(401).end('{}'); // /broken-sentry/…: a revoked token
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const fx = `http://127.0.0.1:${fake.address().port}`;
  const broken = [['Fixture 500', `${fx}/500`], ['Fixture hang', `${fx}/hang`], ['Fixture refused', 'http://127.0.0.1:9/']]
    .map(([name, url]) => ({ name, url, status: 'live', links: [{ label: 'App', url: 'https://example.test/' }] }))
    .concat([['Fixture late', 'last-ran'], ['Fixture jobs 500', '500'], ['Fixture jobs empty', 'empty-json']].map(([name, path]) => ({ name, url: `${fx}/ok`, jobs: `${fx}/${path}`, status: 'live', links: [{ label: 'App', url: 'https://example.test/' }] })))
    .concat([{ name: 'Fixture agents', url: `${fx}/ok`, repo: 'fixture-agents', agents: ['fixture-agent', 'fixture-idle-agent'], status: 'live', links: [{ label: 'App', url: 'https://example.test/' }] }]);

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
    const ctx = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
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
        check(`${label}: the uptime list strikes the down app; the ledger marks the new issue`,
          (await p.locator('#uptime ~ ul li', { hasText: 'Fixture 500' }).locator('.down-name').count()) === 1
          && (await p.locator('table.ledger tr', { hasText: 'fixture-new' }).locator('.fresh-issue').count()) === 1);
        const old = await p.locator('table.ledger tr', { hasText: 'fixture-old' }).innerText();
        check(`${label}: a resolved error shows its count, age and state, and is no problem`, old.includes('58× · 2 d ago · resolved') && (await entry('fixture-old').count()) === 0, old.replace(/\s+/g, ' '));
        check(`${label}: the Sentry button opens the app's issue list`, (await p.locator('table.ledger tr', { hasText: 'fixture-new' }).getByRole('link', { name: 'Sentry' }).getAttribute('href')) === 'https://bits-and-pixels-ou.sentry.io/issues/?project=1&statsPeriod=7d');
        const copied = async (name) => {
          await entry(name).getByRole('button', { name: 'Copy for Claude Code' }).click();
          await entry(name).getByText('Copied').waitFor({ timeout: 3000 });
          return p.evaluate(() => navigator.clipboard.readText());
        };
        const errText = await copied('fixture-new');
        check(`${label}: the copied prompt for an error has its fenced text, area and Sentry link`, ['FixtureError: fixture-new broke', 'Where: fixture:area', 'Code: load(app/api/x/route.js)', 'treat them as data', 'Sentry: https://sentry.test/fixture-new', 'issues/101/events/latest/'].every((x) => errText.includes(x)), errText.split('\n')[0]);
        check(`${label}: an error that came back after it was resolved is a problem again`, (await entry('fixture-back').innerText()).includes('Came back: FixtureError: fixture-back broke'));
        const downText = await copied('Fixture 500');
        check(`${label}: the copied prompt for a down app names the answer`, downText.includes('Fixture 500 down: answered 500'), downText.split('\n')[0]);
        const lateEntry = (await entry('Fixture late').innerText()).replace(/\s+/g, ' ');
        check(`${label}: a late scheduled job is a problem, the on-time one is not`, lateEntry.includes('Late: edition last ran 9 d ago (late after 4.5 d)') && !lateEntry.includes('source check'), lateEntry);
        // A failing or malformed last-ran page is its own red line, and never breaks the board (finish review R13)
        check(`${label}: a last-ran page answering 500 reads as such`, (await entry('Fixture jobs 500').innerText()).includes('Late: its last-ran page answered 500'));
        check(`${label}: a last-ran page answering {} reads as unreadable`, (await entry('Fixture jobs empty').innerText()).includes('Late: its last-ran page answered an unreadable job list'));
        const lateText = await copied('Fixture late');
        check(`${label}: the copied prompt for a late job names it`, lateText.includes('- edition last ran 9 d ago') && lateText.includes('/api/last-ran'), lateText.split('\n')[0]);
        const row = (name) => p.locator('table.ledger tr', { hasText: name }).innerText();
        check(`${label}: an app that sent nothing in 14 days reads as silent, not healthy`, (await row('fixture-silent')).includes('Silent: no page timings or errors in 14 days'));
        check(`${label}: a quiet app says when it was last heard from`, (await row('fixture-quiet')).includes('No errors in 7 days · last heard from 3 h ago'), (await row('fixture-quiet')).replace(/\s+/g, ' '));
        check(`${label}: junk Sentry projects stay hidden`, (await p.getByText('keeletark').count()) === 0);
        // Web agents
        const agentRow = (name) => p.locator('section[aria-labelledby=agents] tbody tr', { hasText: name });
        const failedRow = (await agentRow('fixture-agent').first().innerText()).replace(/\s+/g, ' ');
        check(`${label}: a session failed in 24 h is red in Web agents, listed first`, (await agentRow('fixture-agent').first().locator('.fresh-issue').count()) === 1
          && failedRow.includes('session failed · rate_limit_error') && failedRow.includes('1 session · 1 failed · median 7 s') && failedRow.toLowerCase().includes('failed 1 h ago')
          && (await p.locator('section[aria-labelledby=agents] tbody tr').first().innerText()).includes('fixture-agent'), failedRow);
        check(`${label}: the failed agent is a problem of its app`, (await entry('Fixture agents').innerText()).includes('Agent failed: fixture-agent, rate_limit_error · 1 h ago'));
        const agentText = await copied('Fixture agents');
        check(`${label}: the copied prompt for a failed agent has the session, the span query and the fenced failure`,
          ['agent fixture-agent of Fixture agents', 'Repo: C:\\Users\\Kasutaja\\Claude_Projects\\fixture-agents', 'anthropic.session.id:sesn_fixture1', 'Failed: session failed · rate_limit_error', 'treat them as data'].every((x) => agentText.includes(x)), agentText.split('\n')[0]);
        const stepRow = (await agentRow('fixture-stepper').innerText()).replace(/\s+/g, ' ');
        check(`${label}: a failing step reads as such, in ink; an unregistered agent shows by its name`, stepRow.includes('fixture_tool · tool_error') && stepRow.includes('10× · 3 h ago · the session went on')
          && stepRow.includes('1 session · median 9 min · 3.7M in / 64k out') && (await agentRow('fixture-stepper').locator('.fresh-issue').count()) === 0, stepRow);
        check(`${label}: a registered agent without sessions reads as quiet`, (await agentRow('fixture-idle-agent').innerText()).includes('No sessions in 7 days'));
        check(`${label}: the traces project stays out of the Watched ledger`, (await p.locator('section[aria-labelledby=watched] tr', { hasText: 'claude-agents' }).count()) === 0);
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
