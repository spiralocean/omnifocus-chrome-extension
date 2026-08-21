# WIP — post-1.0.0 unreleased work

**Last updated:** 2026-08-21 (X clip links: drop truncated `memory.th…` / media t.co; still unreleased)  
**Branch:** `main` (local commit of post-1.0.0 work; not yet version-bumped / store-shipped)  
**Shipped version:** `1.0.0` (Chrome Web Store + Mac App Store)  
**Repo:** `/Users/stephenzinn/omnifocus-chrome-extension`  
**Dev install:** Brave unpacked, extension id `aomlmgmnbmmfgjbhnpbkegghnpnmkedp`  
**Native host:** `~/Library/Application Support/ClipToOmniFocus/host.py` (reinstalled with current `host.py`)

Use this file + `CHANGELOG.md` to resume after a disconnect. Prefer this over chat history.

---

## User-facing changes (Unreleased)

1. **Clip confirmation toast**  
   After a successful clip (popup, keyboard, context menu), show “Clipped to OmniFocus” + task name. Errors are swallowed so a failed toast never undoes a successful handoff. Browser toasts only — **not** macOS Notification Center / System Settings.

2. **Click toast → open task in OmniFocus**  
   Success toasts store `taskName` in `chrome.storage.session`. On click, native host / Safari handler runs `reveal-task` (AppleScript: newest matching task → `omnifocus:///task/<id>`). Fallback: activate OmniFocus via `omnifocus:///`. Error toasts are not openable.

3. **Keep clip notification visible** (options setting)  
   `notificationStayVisible` (default `false`).  
   - Off: **explicit** `chrome.notifications.clear` after `AUTO_HIDE_MS` (5s).  
     `requireInteraction:false` alone is **not reliable on macOS/Brave** — banners often stay until dismissed.  
   - On: stay until click or dismiss (`requireInteraction: true`, no auto-clear timer)  
   Setting lives in extension options (not System Settings).

4. **Line breaks in clipped notes**  
   Excerpt used to run `.replace(/\s+/g, " ")` which wiped newlines. Now `normalizeExcerpt()` preserves line breaks. On X/Twitter, prefer live `[data-testid="tweetText"]` over meta description (meta already flattens breaks).

5. **Richer excerpts (Quora / articles)**  
   - Bug: `metaDescription` was preferred over `articleExcerpt`, so Quora (and many news sites) only got the short og:description teaser.  
   - Fix order: selection → YouTube/X/Quora live → JSON-LD → article paragraphs → meta last.  
   - Article paragraphs: fill up to `EXCERPT_MAX` (not just 3 paragraphs).  
   - Quora: `.q-text` / answer containers / JSON-LD Q&A.  
   - Hard limit: OmniFocus note via URL is now ~8000 chars (`NOTE_MAX_LENGTH`, was 1200 — cut long X posts). `composeNote` keeps URL intact, trims body only.

6. **X self-threads**  
   - Status URLs collect the full same-author thread into one note.  
   - Numbered: `(1/8)`…`(8/8)` / `(🧵1/8)`, sorted by n.  
   - Unnumbered: cluster harvested author IDs by snowflake time.  
   - **Harvest-while-scrolling** (2026-08-13): live X virtualizes the conversation — only ~5 cards stay mounted, and `innerHTML` path-link counts plateau at the viewport, so the old “scroll then collect” pass stopped early and dropped the rest of the thread (guideforman 39-post “Truth 1…18”). Now each same-author card is copied into a map as it appears; stop when that map stops growing. Also click “Show more replies” / tweet “Show more” in the primary column (never `<a href>` “Show this thread”). Embed scrape only keeps `/handle/status/` IDs for this author (not every `rest_id` in a 2h window).  
   - Fixtures: Outdoctrination numbered; guideforman unnumbered 39 posts / all 18 truths.  
   - Tests: `tests/x-thread.test.mjs`

7. **X clip links that don’t work**  
   - Bug: X shows t.co as CSS-truncated text (`memory.th…`). `.th` is a TLD, so OmniFocus/Krank linkified it to `http://memory.th`. Photo tweets also put a media `t.co` in `full_text` / `og:title` that redirects to `/status/…/photo/1` (Brave often fails t.co).  
   - Fix: serialize URL `<a>`s to href/expanded destination (keep @/# as visible text); expand real `t.co` from `expanded_url`; drop remaining t.co, `pic.twitter.com`, and leftover `hostname…` fragments. Same rewrite on X titles.  
   - Files: `src/extract-page.js`, iOS `preprocess.js`, safari mirror. Tests: `tests/x-links.test.mjs`. Reload unpacked extension.

---

## Implementation map

| Area | Files |
|------|--------|
| Notifications + click targets | `src/notifications.js` |
| Toast on clip / click handler | `background.js` |
| Popup passes `taskName` | `popup.js` |
| Open clipped task | `src/open-omnifocus.js` → `openClippedTask` |
| Native reveal-by-name | `native-host/host.py` action `reveal-task` |
| Safari reveal | `SafariWebExtensionHandler.swift` |
| Settings default | `src/omnifocus.js` → `notificationStayVisible` |
| Options UI | `options.html`, `options.js` |
| Excerpt / X / Quora | `src/extract-page.js`, `ios/Share/preprocess.js` |
| Tests | `tests/notifications.test.mjs`, `tests/x-thread.test.mjs`, `tests/x-links.test.mjs`, `tests/default-task-name.test.mjs` |
| Changelog | `CHANGELOG.md` |

**Mirror rule:** Chrome root sources and `safari/Clip to OmniFocus/Shared (Extension)/Resources/` are hand-kept identical. When editing JS/options, copy both trees.

---

## Not done / next

- [x] Commit Unreleased work (saved 2026-08-11)
- [ ] Version bump for ship (still `1.0.0` in manifest / Safari `MARKETING_VERSION`)
- [ ] Chrome store zip rebuild via `./scripts/build-chrome.sh` when releasing
- [ ] Safari rebuild if shipping Mac update (`CURRENT_PROJECT_VERSION` still `2`)
- [ ] Push to origin / store submit
- [ ] User should reload Brave extension to pick up latest code
- [ ] First notification-click may prompt macOS Automation (host/Python controlling OmniFocus)
- [ ] Reload Brave unpacked extension, re-clip https://x.com/guideforman/status/2086030980280619218 — note should include Truth 1 through Truth 18 + “The Real Lesson”

---

## How to verify after reload

1. Clip a page → toast appears  
2. Click toast → OmniFocus shows that task (with native host)  
3. Options → toggle “Keep clip notification visible until dismissed” → re-clip  
4. Clip a multi-line X post → note keeps carriage returns  

```sh
node --test tests/*.mjs
```

---

## Resume checklist for next agent

1. Read this file + `CHANGELOG.md`  
2. `git status` / `git log` — post-1.0.0 + harvest-while-scroll are local (`ahead` of origin); still unreleased  
3. Search mempalace wing `omnifocus-chrome-extension` room `progress` / `features`  
4. Keep this file updated whenever behavior changes  
