# Chrome Web Store submission — Web Clipper for OmniFocus v1.0.0

Copy-paste checklist, ordered by dashboard tab. Dashboard:
https://chrome.google.com/webstore/devconsole → **Add new item**.

Fields are grouped exactly as the console presents them. Each fenced block is
meant to be pasted verbatim.

---

## 0. Upload the package

- [ ] **Add new item** → drag in / choose file:
      `dist/web-clipper-for-omnifocus-chrome-v1.0.0.zip`
- [ ] Rebuild first if anything under `src/` or the root changed:
      `./scripts/build-chrome.sh` (never hand-zip — it drifted once).

The name, version, description, icon, and permissions are read from the package.
The fields below fill in everything the package can't carry.

---

## 1. Store listing tab

**Item name** (25/75)
```
Web Clipper for OmniFocus
```

**Summary / short description** (64/132)
```
Clip articles and web pages into OmniFocus tasks with one click.
```

**Category:** Productivity
**Language:** English

**Description**
```
Send web pages and text selections straight to OmniFocus as tasks — with the page URL, an excerpt, and your default project and tag already filled in.

• One-click clipping — from the toolbar button, the right-click menu (page or selected text), or a keyboard shortcut (⌘⇧O for the page, ⌘⇧S for a selection).
• Background open — OmniFocus receives the task without coming to the foreground, so you stay on the page you're reading.
• Smart capture — pulls the page title, a clean excerpt, and any selected text into the task note.
• YouTube-aware — captures the video's real title and description, and folds the current playback position into the link so the task resumes where you left off.
• Your defaults — set a default project, tag, note template, and flags once; every clip uses them.
• Private by design — no accounts, no analytics, no servers. Your clips go straight from the page to OmniFocus on your own Mac.

Requires macOS and OmniFocus for Mac.

Web Clipper for OmniFocus is an unofficial extension and is not affiliated with or endorsed by The Omni Group. OmniFocus and the OmniFocus icon are trademarks of The Omni Group.
```

**Graphic assets**
- [ ] Screenshots (need ≥1; both are exactly 1280×800):
      - `docs/screenshots/01-article.png`
      - `docs/screenshots/02-youtube.png`
- [ ] Store icon 128×128 — comes from the package (`icons/icon128.png`); no upload.
- [ ] Small promo tile 440×280 — optional, skip.

**Official URL / Homepage**
```
https://github.com/spiralocean/omnifocus-chrome-extension
```

**Support URL** (or use the email below)
```
clip@spiralocean.com
```
Once the site is live, prefer the support page URL: https://clip.spiralocean.com/support

---

## 2. Privacy tab  ← the one reviewers actually read

**Single purpose**
```
Create an OmniFocus task from the web page the user is currently viewing.
```

**Permission justifications** — paste one per permission field:

`activeTab`
```
Reads the active tab's title, URL, and page content only at the moment the user explicitly clips — toolbar button, context-menu item, or keyboard shortcut — in order to build the OmniFocus task. No passive or background access to any tab.
```

`scripting`
```
Injects the extraction script into the active tab on that same user action to pull the page title, excerpt, selected text, and, on YouTube watch pages, the video title, description, and playback position. Used instead of a persistent content script so the extension only touches a page when asked to.
```

`contextMenus`
```
Adds the "Clip page to OmniFocus" and "Clip selection to OmniFocus" right-click items, a primary way users invoke the extension.
```

`notifications`
```
Shows a brief confirmation that the clip reached OmniFocus, or an error if OmniFocus for Mac is not installed. The popup closes on clip, so this is the only feedback channel.
```

`storage`
```
Stores the user's own defaults (project, tag, note template, toggles) so every clip uses them. Preferences only — no clipped page content is stored.
```

`nativeMessaging`  ← most likely to draw a reviewer question; answer is here
```
Optional. If the user manually installs the companion helper from the project's public GitHub repo, the extension passes it the omnifocus:// URL so it can be opened with `open -g` (background), avoiding a focus change. The extension is fully functional without the helper and falls back to a handoff tab. The helper is local to the user's Mac; nothing is sent to any remote server.
```

**Remote code:** select **No** — all code is in the package.

**Data usage** — check nothing; certify all three:
- [ ] Does **not** collect or use data for purposes unrelated to the single purpose
- [ ] Does **not** sell or transfer data to third parties
- [ ] Does **not** use or transfer data for creditworthiness / lending

  Rationale if asked: no PII, health/financial data, auth info, personal
  communications, location, web history, or user activity leaves the machine —
  clips go only to the local OmniFocus app.

**Privacy policy URL** (live, HTTP 200 verified)
```
https://github.com/spiralocean/omnifocus-chrome-extension/blob/main/PRIVACY.md
```

---

## 3. Distribution tab

- [ ] Visibility: **Public** (or Unlisted for a soft launch — your call)
- [ ] Regions: **All regions**
- [ ] Pricing: Free

---

## 4. Submit

- [ ] Save draft (each tab saves independently — do all three first).
- [ ] **Submit for review.** First review usually takes a few days to ~a week.

---

## Post-publish follow-up

- [ ] The store assigns a **new extension ID** (≠ the Brave unpacked ID
      `aomlmgmnbmmfgjbhnpbkegghnpnmkedp`). Grab it from the dashboard.
- [ ] Update the README's `./native-host/install.sh <extension-id>` line with the
      published ID — the native host's `allowed_origins` is keyed to it. (Ping me
      with the ID and I'll do it.)

## Canonical URLs (decided 2026-07-16)

The **website is the single source of truth** for both stores. When
`clip.spiralocean.com` is live:

- Privacy policy → `https://clip.spiralocean.com/privacy` (the real text lives
  here; repo `PRIVACY.md` becomes a short pointer to it, not a second copy).
- Support / homepage → `https://clip.spiralocean.com`.
- Point BOTH the Chrome listing and the Apple submission at these same URLs.

Until the page exists, Chrome ships with the GitHub URLs above (editable after
publish without re-review), then gets swapped to the domain once it's live.
Apple effectively requires a working support **web page**, so the domain is
close to a prerequisite there, not just polish.

## Optional polish (not blockers)
- [ ] Reshoot screenshots with Project and Tag filled in — they currently read
      "Optional", so the defaults feature is invisible in both shots.
