# Chrome Web Store listing — Web Clipper for OmniFocus v1.0.0

## Name (25/75)
Web Clipper for OmniFocus

## Short description (64/132)
Clip articles and web pages into OmniFocus tasks with one click.

## Category
Productivity / Workflow

## Single purpose
Create an OmniFocus task from the web page the user is currently viewing.

## Detailed description (draft)

Send web pages and text selections straight to OmniFocus as tasks — with the
page URL, an excerpt, and your default project and tag already filled in.

• One-click clipping — from the toolbar button, the right-click menu (page or
  selected text), or a keyboard shortcut (⌘⇧O for the page, ⌘⇧S for a selection).
• Background open — OmniFocus receives the task without coming to the
  foreground, so you stay on the page you're reading.
• Smart capture — pulls the page title, a clean excerpt, and any selected text
  into the task note.
• YouTube-aware — captures the video's real title and description, and folds the
  current playback position into the link so the task resumes where you left off.
• Your defaults — set a default project, tag, note template, and flags once;
  every clip uses them.
• Private by design — no accounts, no analytics, no servers. Your clips go
  straight from the page to OmniFocus on your own Mac.

Requires macOS and OmniFocus for Mac.

Web Clipper for OmniFocus is an unofficial extension and is not affiliated with
or endorsed by The Omni Group. OmniFocus and the OmniFocus icon are trademarks
of The Omni Group.

## Permission justifications (paste verbatim into the dashboard)

activeTab
  Reads the active tab's title, URL, and page content only at the moment the
  user explicitly clips — toolbar button, context-menu item, or keyboard
  shortcut — in order to build the OmniFocus task. No passive or background
  access to any tab.

scripting
  Injects the extraction script into the active tab on that same user action to
  pull the page title, excerpt, selected text, and, on YouTube watch pages, the
  video title, description, and playback position. Used instead of a persistent
  content script so the extension only touches a page when asked to.

contextMenus
  Adds the "Clip page to OmniFocus" and "Clip selection to OmniFocus" right-click
  items, a primary way users invoke the extension.

notifications
  Shows a brief confirmation that the clip reached OmniFocus, or an error if
  OmniFocus for Mac is not installed. The popup closes on clip, so this is the
  only feedback channel.

storage
  Stores the user's own defaults (project, tag, note template, toggles) so every
  clip uses them. Preferences only — no clipped page content is stored.

nativeMessaging
  Optional. If the user manually installs the companion helper from the project's
  public GitHub repo, the extension passes it the omnifocus:// URL so it can be
  opened with `open -g` (background), avoiding a focus change. The extension is
  fully functional without the helper and falls back to a handoff tab. The helper
  is local to the user's Mac; nothing is sent to any remote server.

Remote code: No — all code is included in the package.

## Data usage disclosure
Certify: does NOT collect or transmit any of the listed data categories.
No PII, no health/financial data, no authentication info, no personal
communications, no location, no web history, no user activity. No data is sent
off the user's machine; clips go only to the local OmniFocus app.

## Privacy policy URL
https://github.com/spiralocean/omnifocus-chrome-extension/blob/main/PRIVACY.md
  ⚠ BLOCKED until the repo is public — the store requires a publicly reachable URL.

## Assets still needed
- [ ] Screenshot(s): 1280x800 or 640x400, at least 1, up to 5. None exist yet.
- [ ] (Optional) Small promo tile 440x280.
- [x] Icon 128x128 — icons/icon128.png
- [x] Package — dist/web-clipper-for-omnifocus-chrome-v1.0.0.zip

## Post-publish follow-up
The store assigns a NEW extension ID (≠ the Brave unpacked ID
aomlmgmnbmmfgjbhnpbkegghnpnmkedp). Once published, update the README's
`./native-host/install.sh <extension-id>` instructions with the published ID,
since the host manifest's allowed_origins is keyed to it.
