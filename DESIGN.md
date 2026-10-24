# Launchpad design: Bridge Watch Log

Recorded from the built page (23.10.2026; impeccable seed 1cb1cdf8). The page is a deck-log form: every check writes one entry, "all well" or the trouble ruled in red. Tokens live in `src/app/globals.css`.

## Palette (two inks, one ruling)
| Token | Day log | Night watch | Use |
|---|---|---|---|
| `--paper` | `#eef1ec` | `#0c1220` | page ground |
| `--sheet` | `#f6f8f4` | `#111a2c` | row hover base |
| `--ink` | `#13233f` | `#dbe2ec` | text, links, all-well entry |
| `--ink-2` | `#485b75` | `#93a3b9` | labels, ms, "no Sentry", empty values |
| `--rule` / `--rule-strong` | `#b7c7d6` / `#7f97ae` | `#22324c` / `#3a5274` | form ruling; strong every 5th row and under heads |
| `--red` | `#b3261e` | `#ff7262` | trouble only: down, new error, wrong passcode |

Red is never decorative. Theme: `<html data-theme="light|dark">`, set before paint from `localStorage["launchpad-theme"]`, else the system scheme.

## Type
Archivo (variable, `wdth` axis, latin-ext for Estonian names), tabular figures everywhere.
- `.form-title`: width 125, weight 800, uppercase, tracked 0.08em: the printed sheet head ("LAUNCHPAD").
- `.form-label`: width 87, 11px, weight 600, uppercase, tracked 0.1em, `--ink-2`: column heads, field labels, link chips, theme switch.
- Entry line: 20px phone, 24px desktop, weight 600, balanced.
- Ledger: 14px, row line-height 1.3, padding 3px 10px.

## Structure
- Desktop (≥1024): watch column 380–420px (sticky): head, find field, entry; then the ruled ledger of Sentry apps (App · Status · Latest error, 7 days · actions · Links), the uptime-only list in three ruled columns, and Dormant collapsed.
- Phone: one column; each ledger row becomes an entry: name and status, the error and its detail line, then actions left and links right.
- Actions (`.act`): small outlined buttons in the ruling, form-label lettering. The one primary action, "Copy for Claude Code" in the trouble entry, is solid ink. The copy button stacks its two labels in one cell, so "Copied" does not change its width.
- Rules: double rule under the sheet head and the ledger head, 1px column rules, a stronger rule every fifth row.

## States (mark form, not colour alone)
- Down: name struck through in red plus a red `DOWN`; listed in the trouble entry with "no answer within 10 s" or "answered <status>".
- New error in 24 h: latest error title in red with a double underline; listed in the trouble entry.
- Came back (an issue open again after it was resolved, seen in 24 h): the same red mark; the trouble entry reads "Came back:".
- Archived: the detail line reads "archived" in the second ink.
- Open error: title in ink, its detail line in ink; resolved: detail line in the second ink. No error in 7 days: muted "No errors in 7 days".
- Slow (up, over 3 s): "slow" in ink in place of "up"; the time is in the tooltip.
- Sentry project missing from the registry: "not in the registry". Not checked or Sentry unreachable: "—".
- Sentry unreachable: one muted line under the entry; health checks still shown.

## Motion
One authored moment: the entry's rule is drawn in left to right (`.pen-rule`, 700 ms, ease-out expo); double for trouble. Off under `prefers-reduced-motion`. Nothing else animates.

## Browser surfaces
Selection is ink on paper, the caret is red, the focus ring is a 2px outline in ink (navy by day, pale at night), inputs included, the scrollbar takes the ruling colours, and link underlines use `--rule-strong` and turn to ink on hover.
