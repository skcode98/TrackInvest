# TrackInvest — Agent Instructions

## Stack (zero npm/build — pure static PWA)
- **Vanilla HTML/CSS/JS** — no bundler, no framework, no package.json
- All data in `localStorage` — no backend, no database
- Deployed as Render static site (see `render.yaml`)

## Entry points

| Page | JS loaded | AI loaded |
|------|-----------|-----------|
| `index.html` (dashboard) | `app_part1.js`, `app_part2.js`, `app_part3.js` | no |
| `monthly_plan.html` | inline only | `shared_ai.js` |
| `spend_tracker.html` | inline only | `shared_ai.js` |

- `style.css` (~3000 lines) is **shared by all 3 pages** — changes affect all of them.
- `app_part2.js` and `app_part3.js` are **dashboard-only** (not in monthly_plan/spend_tracker).

## AI provider fallback (in `shared_ai.js`)
Gemini → Groq → OpenRouter (free) → Cerebras → GitHub Models (gpt-4o-mini)

Each page that uses AI manages its own provider key and prompt — there is no shared key store.

## Version / cache busting
- `version.js`: `APP_VERSION = 'v5.7'`
- `sw.js` cache name includes version — bump both files when releasing

## Developer commands (no npm, no test runner)
- No lint, typecheck, test, or build commands exist
- Verify by opening the HTML files in a browser and checking DevTools console
- Service worker debugging: Chrome DevTools → Application → Service Workers

## Gotchas
- **Post-commit hook** (`.githooks/post-commit`) auto-pushes to `origin main` — every commit is immediately pushed
- **CSP headers** are inline in `<meta http-equiv="Content-Security-Policy">` in each HTML file. Adding a new external domain (e.g., a new AI provider API) must be added to `connect-src` in all 3 files.
- `style.css` uses Material Design 3 CSS custom properties — color tokens are `--md-primary`, `--md-surface`, etc. (defined at top of file)
- Remote auto-redirects: `surajtalele1998/TrackInvest` → `skcode98/TrackInvest`
- No `.gitconfig`-level hooks path set — `core.hooksPath` is not configured, so `git commit` will run `.git/hooks/` (sample files only), not `.githooks/`. The post-commit hook at `.githooks/post-commit` is inactive unless `git config core.hooksPath .githooks` is run.
