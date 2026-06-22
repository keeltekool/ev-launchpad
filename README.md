# Launchpad — Personal Project Dashboard

A dense, single-page speed-dial for 40+ live web apps. Screenshot + name per tile,
one click to launch, live search, dark/light mode. No auth, no backend, no build step.

Built to the spec in `SPEC-FOR-CLAUDE-DESIGN.md`. This package is a **complete,
deployable static frontend** plus the design-system code behind it.

---

## Run it

It's a static site, but the data loads via `fetch()`, so open it over HTTP (not `file://`):

```bash
cd launchpad
npx serve .          # or: python3 -m http.server 8000
```

Then visit the printed URL. Deploy by dropping the `launchpad/` folder on Vercel /
Netlify / GitHub Pages — no config needed.

> Opening `index.html` directly with `file://` will block the fetch. If you need
> that to work, see "Offline / file:// fallback" below.

---

## File map

```
launchpad/
├── index.html              Markup + no-flash theme bootstrap
├── css/
│   ├── tokens.css          DESIGN SYSTEM — all color/type/space/motion tokens
│   │                       (light on :root, dark on [data-theme="dark"])
│   └── styles.css          Component styles — consumes tokens only, no hard-coded color
├── js/
│   └── app.js              Theme, data load + render, live search, keyboard shortcuts
├── data/
│   └── projects.json       THE DATA SOURCE — edit this to add/reorder projects
├── screenshots/            Tile thumbnails (1280×800 placeholders — replace with real)
├── assets/
│   └── logo.svg            Launchpad mark (uses --accent, so it recolors with theme)
├── favicon.svg
└── README.md
```

---

## Adding / editing projects

Edit `data/projects.json`. Array order = grid order (top-left → bottom-right).
**One entry = one tile = one project.** Each project carries a name, an optional
screenshot, and a `links` array — one entry per destination URL:

```json
{
  "name": "SongDrop",
  "image": "screenshots/songdrop.png",
  "links": [
    { "label": "App",     "url": "https://songdrop.app" },
    { "label": "Admin",   "url": "https://admin.songdrop.app" },
    { "label": "Landing", "url": "https://www.songdrop.app" }
  ]
}
```

- **Multiple URLs per project = multiple link chips on the SAME tile** (App / Admin /
  Landing). They are NOT split into separate tiles. The chips render below the name as
  visible, clearly-clickable links (accent-colored pills with an ↗), so you can always
  see and pick the destination.
- **Single-URL project:** give it one link — `[ { "label": "Open", "url": "…" } ]`.
- **Clicking the screenshot** opens the first (primary) link in the array.
- **No screenshot yet?** Set `"image": ""` (or point at a missing file). The tile
  renders a colored letter-fallback instead — see the included `Devlog` entry, which
  demonstrates this live.

### Screenshots
- Keep them a consistent ratio; CSS crops to 16:10 via `object-fit: cover`.
- Name kebab-case to match the project: `songdrop.png`.
- Optimize to < 100 KB (PNG or WebP). First 6 load eagerly, the rest lazy.

---

## Design system (`css/tokens.css`)

Everything visual is a CSS custom property. Change the brand by editing tokens —
never touch component CSS for color/spacing.

| Token group | Examples |
|---|---|
| Surfaces / text | `--bg`, `--tile-bg`, `--tile-border`, `--text-1`, `--text-2` |
| Accent | `--accent`, `--accent-ring` (focus rings, hover border) |
| Fallback palette | `--ph-1`…`--ph-6`, `--ph-ink` (rotated per tile) |
| Type | `--font-sans` (system stack), `--fz-title/body/name/footer`, `--fw-*` |
| Spacing (4px base) | `--space-1`…`--space-12` |
| Radii / motion | `--radius`, `--radius-pill`, `--ease`, `--dur-fast/base` |
| Grid | `--tile-min` (220px), `--tile-max`, `--grid-gap` (16px) |

Dark mode = the same token names re-declared under `[data-theme="dark"]`. The grid
column count is driven by `grid-template-columns: repeat(auto-fill, minmax(--tile-min, 1fr))`
— it fluidly goes 5–6 cols on desktop down to 1–2 on phones with no media query per breakpoint.

---

## Behavior reference

- **Tile** → one project. The screenshot links to the primary URL; each link chip below
  the name opens its own URL in a new tab (`target="_blank" rel="noopener noreferrer"`).
- **Search** → live, case-insensitive substring match on name; `×` clears; empty state shows
  "No projects match your search."
- **Theme toggle** → sun/moon button, persisted to `localStorage["launchpad-theme"]`,
  defaults to `prefers-color-scheme`. No-flash bootstrap inlined in `<head>`.
- **Keyboard** → `/` focuses search · `Esc` clears search & returns focus to first tile ·
  `Tab`/`Enter` work natively on tiles · visible focus ring (`--accent-ring`).
- Respects `prefers-reduced-motion`.

---

## Offline / file:// fallback (optional)

If you want the dashboard to work when opened directly as a file (no server), create
`data/projects.js` containing `window.LAUNCHPAD_PROJECTS = [ ...same array... ];`,
add `<script src="data/projects.js"></script>` before `js/app.js` in `index.html`,
and `app.js` will use it automatically when the `fetch` fails.

---

## Not included (by design)

No auth, descriptions, tags, categories, dates, GitHub links, tooltips, modals,
drag-reorder, analytics, external fonts, or PWA. It's a cockpit, not a brochure —
keep it that way.
