# Fleet Doctor v1 — Plan

**Approved:** 2026-08-16 (scope locked in chat)
**What:** Autonomous monitoring agent — a scheduled cloud routine (Claude Code cloud, subscription-billed, model pinned to `claude-sonnet-5`) that checks 5 apps 3×/week and publishes a triage report to the Launchpad monitor page.

## Locked scope

- **No autofix.** Read-only agent: observe → triage → report. Action arm is v2, earned after triage quality is proven.
- **Schedule:** Mon/Wed/Fri, cron `30 3 * * 1,3,5` UTC = 06:30 Tallinn (summer) / 05:30 (winter).
- **Coverage (5):** ApplyKit, HankeRadar, Hinnavaht, Keepr, Athlon — all Sentry-wired.
- **Model:** `claude-sonnet-5` pinned in routine config — never Fable/Opus (hard rule: building allowance stays untouched).
- **Alerts:** GitHub issue on `keeltekool/ev-launchpad` ONLY when something is red (app down or new Sentry issue). Silence = healthy. If an open `Fleet Doctor RED` issue exists, comment on it instead of opening a duplicate.
- **Display:** full-width Fleet Doctor pane above the grid on monitor.html, reading `data/fleet-report.json` (static file, committed by the routine, Vercel auto-deploys).

## Architecture

```
Anthropic scheduler (Mon/Wed/Fri 03:30 UTC)
  └─ spawns cloud sandbox, user's account, Sonnet 5, checkout of keeltekool/ev-launchpad
       1. PERCEIVE  GET ev-launchpad.vercel.app/api/health   (Sentry data; token stays in Vercel)
                    GET each app URL from data/fleet.json    (status, latency, content marker)
       2. DECIDE    diff vs data/fleet-report.json in checkout (deltas, new issues)
                    classify healthy / warning / down; write 2-3 sentence headline
       3. ACT       overwrite data/fleet-report.json → commit → push
                    → Vercel auto-deploys → pane live
                    if red: gh issue create (or comment on open RED issue)
```

No new secrets: the Sentry token already lives in Vercel env for `/api/health`; the sandbox has gh/git auth (proven by the GitHub Workflow Guardian routine since April).

## Build tasks

1. **`data/fleet.json`** — registry: `{ apps: [{ name, slug, url, marker }] }`. Markers verified against live HTML at build time.
2. **`api/health.js`** — add `topIssues` (top 3: title, count, permalink, lastSeen) per project. ~8 lines.
3. **Monitor pane** — `monitor.html` + `js/monitor.js` + `css/styles.css`: strip above grid with generated-time, healthy/warning/down counts, headline sentence, top issues with Sentry links. Graceful "no report yet" state when the JSON is missing.
4. **Deploy + verify** — commit, push, `verify-deploy.mjs` on `/monitor.html` at 1440px and 375px.
5. **Routine** — create via RemoteTrigger; config below.
6. **Forced test run** — `action: "run"`, then confirm: commit by the agent appears on GitHub, report renders on the live pane, screenshot proof both viewports.

## fleet-report.json schema (contract between routine and pane)

```json
{
  "generatedAt": "ISO-8601",
  "headline": "2-3 plain sentences: what matters, what changed",
  "counts": { "healthy": 4, "warning": 1, "down": 0 },
  "apps": [{
    "name": "ApplyKit", "slug": "applykit", "status": "warning",
    "http": { "code": 200, "ms": 412, "markerFound": true },
    "unresolved": 1, "delta": "+0",
    "topIssues": [{ "title": "...", "count": "47", "permalink": "https://..." }]
  }],
  "history": [{ "date": "2026-08-17", "healthy": 4, "warning": 1, "down": 0 }]
}
```

`history` trimmed to last 10 entries. Status rules: `down` = HTTP ≠ 200 OR marker missing OR timeout (>20s). `warning` = unresolved Sentry issues > 0. `healthy` = otherwise. Red alert = any `down`, or any issue not present in the previous report.

## Routine config

- name: `Fleet Doctor`
- cron: `30 3 * * 1,3,5`
- environment: `env_01584gnpeysBs9CT23nuFrkx`
- model: `claude-sonnet-5`
- source repo: `https://github.com/keeltekool/ev-launchpad`
- allowed_tools: Bash, Read, Write, Edit, Glob, Grep
- Prompt: self-contained (fresh context each run — no conversation memory); reads registry + previous report from the checkout; exact commands for git identity, health fetch, HTTP checks, report write, push, conditional gh issue. Full text lives in the routine itself (visible at claude.ai/code/routines).

## v2 candidates (explicitly out of scope now)

- Auto-PR arm for trivial, high-confidence fixes (+ regression tests)
- Remaining ~15 live apps (uptime-only rows, no Sentry requirement)
- Weekly digest (Sunday trend summary across reports)
- Playwright click-throughs in the sandbox (unproven there; local workflow covers it)
