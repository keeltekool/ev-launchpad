# Launchpad: rebuild spec (23.10.2026)

**SPEC — complete.** The build session wrote this spec because the owner handed the whole job over. The owner's words are quoted verbatim. Everything else is the build session's proposal, which the owner accepted by handing it over: "So you agree here, can devise fulll plan, execute and work in sentry ui - crrationg api keys connectiong, etc, as mee - i just let you in".

## Why
Owner, 23.10.2026:
- "This Launchpad app is uttter shit by the way ... that in itself can be one separate project its also not one of my critickal babies so im confident to let you loose there and full improve - that together witrh SENTRY they go hand by hand!!!!"
- "Maybe launchpad even needs to go from ground up - polishig the turd fallacy maybe"
- "its all fucked up there mashed and potatoes with Sentry!"
- About Sentry, earlier: "put the Sentry monitoring to actuaaly work - its currrnely this half assed forgetten projectt ... setup directy in UI all my main apps monoitotring propoery"

What was wrong on 23.10.2026:
- The home page is 47 screenshot tiles with no status. Most apps from August to October are missing (Käsilane, Mini Me, Keila Leht Ultra, Livery, VAIB, VAIB-X, Skill4Win, Prindipesa, Market Watch, Hinnavaht, Keepr and others). At 375px the page scrolls sideways.
- `/monitor` tracks 8 hardcoded Sentry projects. The Fleet Doctor pane is frozen on its 18.09 report.
- Sentry: `javascript-nextjs` is ApplyKit's local dev, with 582 errors of noise. `keeletark` is retired. Market Watch has the SDK but no Sentry project. Hinnavaht and Keepr have no server-side init. ApplyKit has dead duplicate init files at its root. Apps with a hardcoded DSN also send from local dev. Most live apps aren't wired at all, and no alerting is set up.

## Who and what
For the owner alone: one page that answers **"is anything of mine broken right now?"** and opens any app in one click.

## The page (`/`)
- **Header:** the name, "checked HH:MM", and a theme toggle (light/dark, remembered). A search box filters every list by app name; `/` focuses it and Esc clears it. These carry over from the old app.
- **Problems** (top, red): live apps that are **down**, meaning the health check failed (no 2xx/3xx within 10 s), or that have a **new error**, meaning a Sentry issue first seen in the last 24 h. Each row says which. With no problems, one line: "All N live apps up · no new errors in 24 h".
- **Live apps:** one row per app. It shows:
  - the name
  - up/down and response time in ms
  - errors in the last 24 h and 7 d
  - the newest unresolved issue's title, linked to the issue in Sentry
  - the app's link chips (App, Admin, Landing…, carried over from the old registry)
  - a muted "no Sentry" mark when the app has no Sentry project

  Order: problems first, then apps with unresolved issues in the last 7 d, then A–Z.
- **Dormant apps:** a collapsed section "Dormant (N)" with only the name and link chips. No checks run on them.
- A Sentry project that isn't in the registry still appears under Live, named by its slug, so a newly wired app shows up without editing anything.
- **Refresh:** data is fetched on the server and cached for 60 s. The open page refreshes itself every 5 minutes (as the old monitor did).
- **Access:** the page shows error titles from every app, so it sits behind a passcode. A correct passcode, or a one-time `?key=` link, sets a cookie that lasts one year.
- Layout: mobile first, with a real desktop layout at 1440 and 1920.

## Data
- `data/apps.json` registry entry: `{ name, url, sentry?, status: "live" | "dormant", links: [{ label, url }] }`. `url` is the address that gets checked. It is seeded from the old `projects.json` plus the live apps in global STACK.md.
- Sentry: org `bits-and-pixels-ou` (EU, `https://de.sentry.io/api/0`). The read token is the existing Vercel env `SENTRY_AUTH_TOKEN`.
- Health check: a server-side GET to `url` that follows redirects, with a 10 s timeout. It records the status code and ms.

## Sentry standard (every live app with Sentry)
- One project per app in `bits-and-pixels-ou`, platform `javascript-nextjs`, with slug = `sentry` in the registry.
- SDK wiring follows the current official manual setup, checked against the docs for the installed version. Sentry is enabled only in production, so local dev doesn't send noise. No `tunnelRoute`: events go straight to `de.sentry.io`.
- One issue alert per project: a new issue sends an email to the owner.
- Junk projects deleted: `javascript-nextjs` (ApplyKit local dev) and `keeletark` (retired app).
- Getting uptime only, no Sentry, until the owner says otherwise: work and client apps (SK E-Seal Prototype, Allekirjoitus Sales Tool, Saku Tenniseklubi). SongDrop personal is never touched (memory: "DO NOT TOUCH").

## Out of scope
Fleet Doctor (disabled; the owner said on 19.09 to rebuild it from the ground up later), screenshots, Vercel deploy status, GitHub stats, paid Sentry features, and Sentry uptime monitors (the free allowance is used up).
