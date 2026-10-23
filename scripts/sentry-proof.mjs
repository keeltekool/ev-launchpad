#!/usr/bin/env node
// Proves an app's production build reports to Sentry: opens the URL in Chromium,
// then polls Sentry until that project has a transaction newer than the visit.
// Usage: node scripts/sentry-proof.mjs <slug> <url>
// Prints "PASS <slug> <ms>" (exit 0) or "FAIL <slug> <reason>" (exit 1).
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [slug, url] = process.argv.slice(2);
if (!slug || !url) {
  console.error('usage: node scripts/sentry-proof.mjs <slug> <url>');
  process.exit(2);
}

const ORG = 'bits-and-pixels-ou';
const TIMEOUT_MS = 180_000;
const POLL_MS = 10_000;
// The npm `sentry` shim is a shell script; call its JS entry directly so no cmd.exe quoting gets in the way.
const SENTRY_BIN = join(process.env.APPDATA ?? '', 'npm/node_modules/sentry/dist/bin.cjs');

// Launchpad has no package.json until Phase 2; until then borrow the global scripts' Playwright.
const { chromium } = await import('playwright').catch(() =>
  import(pathToFileURL(join(homedir(), '.claude/scripts/node_modules/playwright/index.mjs')).href));

const sentryApi = (endpoint) =>
  JSON.parse(execFileSync(process.execPath, [SENTRY_BIN, 'api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

// On an HTTP error the CLI exits non-zero and prints Sentry's JSON body ({ detail }) on stdout.
function apiError(e) {
  try {
    return JSON.parse(e.stdout).detail;
  } catch {
    return (e.stderr || e.message).trim().split('\n')[0];
  }
}

function newestTransaction(sinceIso) {
  const params = new URLSearchParams({
    dataset: 'spans',
    // On Vercel the SDK reports "vercel-production"; apps that set an environment report "production".
    query: `is_transaction:true project:${slug} environment:[production,vercel-production] timestamp:>=${sinceIso}`,
    sort: '-timestamp',
    statsPeriod: '1h',
    per_page: '1',
  });
  for (const f of ['timestamp', 'transaction']) params.append('field', f);
  return sentryApi(`organizations/${ORG}/events/?${params}`).data[0];
}

async function prove(page) {
  // An unknown slug makes the events query return an empty list, not an error, so check it first.
  try {
    sentryApi(`projects/${ORG}/${slug}/`);
  } catch (e) {
    return `FAIL ${slug} project lookup: ${apiError(e)}`;
  }
  const visitedAt = Date.now();
  // Span timestamps have whole-second precision.
  const sinceIso = new Date(Math.floor(visitedAt / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  } catch (e) {
    return `FAIL ${slug} visit failed: ${e.message.split('\n')[0]}`;
  }
  // The page stays open while polling so the browser SDK can finish and send its pageload transaction.
  while (Date.now() - visitedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let tx;
    try {
      tx = newestTransaction(sinceIso);
    } catch (e) {
      return `FAIL ${slug} sentry api: ${apiError(e)}`;
    }
    if (tx) return `PASS ${slug} ${Date.now() - visitedAt}`;
  }
  return `FAIL ${slug} no production transaction within ${TIMEOUT_MS / 1000}s of the visit`;
}

const browser = await chromium.launch();
let result;
try {
  result = await prove(await browser.newPage());
} finally {
  await browser.close();
}
console.log(result);
process.exit(result.startsWith('PASS') ? 0 : 1);
