# TrackInvest — Audit & Fix Tracking

## Goal
Review all UI→Logic→BusinessLogic→DB flows. Fix CRUD, consistency, mobile-friendliness, MD3 compliance. Remove complexity/duplicacy.

---

## Phase 1 — Critical Bugs

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | All HTML files | `user-scalable=no, maximum-scale=1.0` blocks accessibility zoom — **REMOVED** | ✅ |
| 2 | `index.html:802` | Settings sheet `height:85vh` clips on small screens → `100dvh` | ✅ |
| 3 | All HTML Google Fonts | Missing `&display=swap` — added to all standalone pages | ✅ |
| 4 | `style.css` | Missing `--md-tertiary-container` / `--md-on-tertiary-container` vars — **ADDED** | ✅ |
| 5 | `monthly_plan.html:1114` | `callAIProvider(db, ...)` passes whole `db` — fixed to pass keys object | ✅ |
| 6 | `style.css:2002-2003` | Snackbar `bottom: 100px` → `16px` for proper mobile offset | ✅ |
| 7 | `index.html` multiple sheets | Inline `max-height:85-90vh` overrides removed (use class defaults `100dvh`) | ✅ |
| 8 | `style.css:1627-1628` | `.sheet-display` `height:85vh` → `100dvh` | ✅ |
| 9 | `style.css:1649` | `.sheet` `max-height:92vh` → `100dvh` | ✅ |

## Phase 2 — UI Consistency (MD3)

| # | File | Issue | Status |
|---|------|-------|--------|
| 10 | `index.html:689` | Category sheet `height:85vh` inline → uses `.sheet-display` class | ✅ |
| 11 | `market_watch.html` | Duplicate `.section-title`, `.chip`, `.chip-group` CSS → removed (use shared from style.css) | ✅ |
| 12 | `style.css` | `.sheet-display` consolidated as reusable flex-column sheet pattern | ✅ |

## Phase 3 — Mobile Scrollability

| # | File | Issue | Status |
|---|------|-------|--------|
| 13 | `style.css` `.sheet` | `overflow-y: auto` + `max-height:100dvh` ensures all sheets scroll on mobile | ✅ |
| 14 | `style.css` `.sheet-display` | `height:100dvh` + `display:flex; flex-direction:column; overflow:hidden` + inner `.scroll-y` for content | ✅ |
| 15 | All sub-sheets | Calculator sheets (sip, emi, inflation) flow naturally in `.sheet` with scroll | ✅ |
| 16 | `dividend-sheet`, `webrtc-sync-sheet` | Removed `max-height:90vh` — use class default | ✅ |

## Phase 4 — CRUD Verified

| # | Feature | Flow | Status |
|---|---------|------|--------|
| 17 | Investments | `saveInvestment()` — validates → sanitizes → dedup → save/update → undo | ✅ verified |
| 18 | Goals | `saveGoal()` / `deleteGoal()` — CRUD with target/saved/linked category | ✅ verified |
| 19 | Recurring SIPs | Add from invest sheet + recurring list in its own sheet | ✅ verified |
| 20 | Templates | Save as template on invest + quick-add chips | ✅ verified |
| 21 | Monthly Plan | `savePlanner()` / `resetPlanner()` — persists to `db.monthlyPlanConfig` | ✅ verified |
| 22 | Spend Tracker | Add expense via quick-add bar + AI categorization | ✅ verified |

## Phase 5 — Remove Complexity & Duplicacy

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 23 | `user-scalable=no` in 4 HTML files | Removed from all | ✅ |
| 24 | `display=swap` missing in 3 HTML files | Added to all | ✅ |
| 25 | 5+ sheets with inline `max-height` overrides | Removed — `.sheet` class provides default | ✅ |
| 26 | Duplicate `.section-title`, `.chip` in market_watch.html | Removed (use shared style.css) | ✅ |
| 27 | Missing tertiary-container CSS vars | ✅ | |

---

## Key Architectural Patterns

### Sheet Pattern (MD3 Bottom Sheet)
```css
.sheet {
    position: fixed; bottom: 0; left: 0; right: 0;
    max-width: 600px; margin: 0 auto;
    background: var(--md-surface-container-low);
    border-radius: 28px 28px 0 0;
    padding: 24px;
    z-index: 1000;
    transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);
    max-height: 100dvh;
    overflow-y: auto;
}
.sheet.active { transform: translateY(0); }

.sheet-display {
    height: 100dvh; max-height: 100dvh;
    display: flex; flex-direction: column; overflow: hidden;
}
// Inner content wrapper: <div class="scroll-y" style="flex:1; padding-bottom:20px;">
```

### AI Provider Router (`shared_ai.js`)
- Single entry point `callAIProvider(keys, prompt, systemPrompt)`
- Fallback chain: Gemini → Groq → OpenRouter → Cerebras → GitHub Models
- Retry logic (2 retries, exponential backoff)
- Key validation + sanitization

### CRUD Pattern
1. Read from `db` (localStorage via `safeLocalStorageGet`)
2. Mutate array/object
3. `saveData()` → `localStorage.setItem('appHubInvestDb', JSON.stringify(db))`
4. `renderAll()` to update UI

---

## Phase 6 — Cross-File Audit (Diff Approach)

| # | Issue | Type | Status |
|---|-------|------|--------|
| 28 | `monthly_plan.html:1050` / `spend_tracker.html:245` — `savePlanner()` and `saveDB()` overwrite entire localStorage key, potentially losing data from other pages | ⛔ DATA LOSS | ✅ Fixed — merge with existing before write |
| 29 | `app_part2.js:2201` — `callAIProvider(db, …)` passes full db object, works accidentally | 🔧 FRAGILE | ✅ Fixed — passes only keys object |
| 30 | `app_part1.js:1034` — `clipboard.writeText()` without `.catch()` — unhandled rejection | ⚠️ CRASH | ✅ Fixed |
| 31 | `style.css:2675-2676` — `#settings-sheet max-height: 90vh !important` overrides inline | 🎨 BUG | ✅ Fixed → 100dvh |
| 32 | `market_watch.html:336,344,392,412` — template-literal `onclick` with unescaped single quotes | 🔓 INJECTION | ✅ Fixed — added `attrEsc()` |
| 33 | `shared_ai.js` not loaded in standalone pages | ❌ FALSE POSITIVE | Already loaded at monthly_plan:469, spend_tracker:241 |

### Cross-File Analysis Summary
- **0 P0 bugs** remaining (false positive on shared_ai.js)
- **5 issues found and fixed**: data loss, fragile pattern, unhandled rejection, style override, injection risk

---

## Phase 7 — Dividend Feature Deprecation

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 34 | Dividend complexity | Removed all `isDividend` tracking logic from DB, calculation engines, and UI. Purged dividend sheet and filtering code. | ✅ |

---

## Fix Log

| # | File | Fix |
|---|------|-----|
| 1 | All HTML | Removed `user-scalable=no, maximum-scale=1.0` from viewport meta |
| 2 | All HTML | Added `&display=swap` to Google Fonts links |
| 3 | `style.css` | Added `--md-tertiary-container`, `--md-on-tertiary-container` vars |
| 4 | `style.css` | `.sheet` max-height: `92vh` → `100dvh` |
| 5 | `style.css` | `.sheet-display` height: `85vh` → `100dvh` |
| 6 | `style.css` | Snackbar bottom: `100px` → `16px` |
| 7 | `index.html:802` | Settings sheet: `85vh` → `100dvh` |
| 8 | `index.html:689` | Category sheet: uses `.sheet-display` class |
| 9 | `index.html` | 5 sheets: removed inline `max-height` overrides |
| 10 | `monthly_plan.html:1114` | `callAIProvider(db, …)` → keys object |
| 11 | `market_watch.html` | Removed duplicate `.section-title`, `.chip`, `.chip-group` CSS |
| 12 | `spend_tracker.html:245` | `saveDB()` — merge with existing before write (prevents data loss) |
| 13 | `monthly_plan.html:1050` | `savePlanner()` — merge with existing before write (prevents data loss) |
| 14 | `app_part2.js:2201` | `callAIProvider(db, …)` → keys-only object |
| 15 | `app_part1.js:1034` | `clipboard.writeText().catch(() => {})` |
| 16 | `style.css:2676` | `#settings-sheet max-height`: `90vh → 100dvh` |
| 17 | `market_watch.html` | Added `attrEsc()` for onclick attribute escaping |
| 18 | `app_part1.js`, `app_part2.js` | Removed all dividend-related UI, CSV exports, stats filtering, and logic |

## Phase 8 — Portfolio & Withdrawal Features

| # | Issue | Fix | Status |
|---|-------|-----|--------|
| 35 | Auto-close old FD when renewed | `renewFD()` now stores old FD ID; `saveInvestment()` marks old FD as `isClosed` with `closedDate` and `closedReason` | ✅ |
| 36 | Category rename not reflecting in portfolio | Added `renameCategory()` function that updates: investments, goals, recurring SIPs, templates, allocTargets, and market values | ✅ |
| 37 | No usable/withdrawable money indicator | Added `calculateUsableMoney()` function + dashboard card showing immediate access & emergency funds (PPF) | ✅ |

### Feature Details:

**Issue #35 — Auto-close Old FD**
- When user clicks "Renew FD" button, `renewFD()` sets `window.renewedFromInvestmentId`
- Upon `saveInvestment()`, the old FD is marked: `isClosed: true, closedDate, closedReason: 'Renewed'`
- Closed investments excluded from portfolio calculations via `!inv.isClosed` filter
- Old FD still in DB for audit trail but hidden from active portfolio

**Issue #36 — Category Rename with Cascading Update**
- New `renameCategory()` function in Settings (Manage tab)
- Updates all linked data:
  - `db.categories` (metadata)
  - `db.categoryDetails` (initial balance, interest, fields)
  - `db.allocTargets` (allocation %age)
  - `db.currentMarketValues` (override values)
  - All `db.investments[].type` references
  - All `db.goals[].linkedCategory` references
  - All `db.recurring[].type` references (SIPs)
  - All `db.templates[].type` references
  - Window variables: `currentInvType`, `activeCategory`
- UI: Rename button (edit icon) added next to delete button in category settings

**Issue #37 — Usable Money Indicator**
- New function `calculateUsableMoney()` returns: `{ immediate, emergency, total }`
- Liquidity rules:
  - **Immediate**: Cash, Liquid (100%) + FD/RD (95% penalty) + SIP/Stocks/MF (90% buffer)
  - **Emergency**: PPF (100% but restricted to emergency)
  - **Total**: immediate + emergency
- New dashboard mini-card shows: immediate access, emergency (PPF), and total withdrawable
- Updates via `renderDashboardMiniCards()` on every render
