# Product

<!-- impeccable:product-schema 1 -->

Source: SPEC.md (owner-approved 23.10.2026; the owner's words are quoted there). Nothing here goes beyond it.

## Platform

web

## Users
The owner alone. A builder who runs about 30 live web apps of their own (personal tools, family apps, a few client and work prototypes) and opens this page to check on them and to jump into any one of them. Used on a phone and on a desktop.

## Product Purpose
One page that answers **"is anything of mine broken right now?"** and opens any app in one click. Success: a glance tells the owner whether something is down or throwing new errors, and which; when nothing is wrong, the page says so in one line and gets out of the way.

## Positioning
It replaces a wall of 47 screenshot tiles with no status (the owner: "uttter shit", "a Potemkin village"). It is a status board, not a portfolio: the owner's own health checks plus the owner's own Sentry data, merged per app.

## Operating Context
- Opened ad hoc, often from a phone, between other work; sometimes left open on a desktop (it refreshes itself every 5 minutes).
- Data: a server-side GET per live app (up/down, ms; 10 s timeout) and Sentry (org `bits-and-pixels-ou`): per app the error worth showing over 7 days (a new open one, else the newest open, else the newest resolved) with its count, times, state and `area` tag, and whether an issue was first seen in the last 24 h.
- No alert emails (owner, 24.10.2026): the owner comes to this page to see problems.
- Each app has link chips (App, Admin, Landing…) carried over from the old registry. Dormant apps are listed but never checked.
- Behind a passcode (error titles can carry personal data); a `?key=` link or the passcode sets a one-year cookie.

## Capabilities and Constraints
- Header: name, "checked HH:MM", light/dark toggle (remembered), search over app names (`/` focuses, Esc clears).
- Problems block on top: apps that are down or have a new error, each saying which, with "Copy for Claude Code" (a prompt with the repo folder, the exact error, its Sentry link and the CLI line for the full event), Sentry and Open; otherwise one line: "All N live apps up · no new errors in 24 h" and how problems will appear.
- Watched by Sentry (owner, 24.10: "row apps to top that has sentry"): name, up/down/slow, the latest error in its exact text with "58× · 13 h ago · resolved · area", Copy for Claude Code, a Sentry button to the app's issue list, link chips. Order: problems, then apps with open issues, then A–Z. A Sentry project missing from the registry still shows, named by its slug.
- Uptime only: a compact list of names that open the app, struck through in red when down, "slow" past 3 s. No milliseconds column and no bare error counts (owner, 24.10: "what does this 59/59 say to me").
- Dormant (N): collapsed; name and link chips only.
- When Sentry is unreachable the page still shows health checks and says so.
- Out of scope: screenshots, deploy status, GitHub stats, Fleet Doctor.

## Evidence on Hand
Real data only: `data/apps.json` (66 apps, 32 live) and live Sentry numbers. No invented apps, metrics or states.

## Product Principles
1. The answer comes first: problems or the all-clear line are the first thing read.
2. Signal over volume: nothing on the page that doesn't help decide "broken or not" or open an app.
3. Truthful states: down, slow, new error, unknown and unreachable each look different; nothing claims healthy without a check behind it.
4. One click to any app.
