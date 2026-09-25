# Changelog

All notable changes to Web Clipper for OmniFocus are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-09-25

### Fixed

- **Clipping without the native helper always failed** with “Couldn't open OmniFocus” (every Chrome Web Store install that hadn't set up the helper). The handoff page's inline script was blocked by MV3's extension CSP, so it never navigated to OmniFocus; it now loads from `src/handoff.js`. The first handoff also runs in a visible tab so Chrome's “Open OmniFocus?” prompt can be seen and answered (it's tab-modal, and was hidden in a background tab); once it succeeds, later handoffs run hidden again. Success is now detected by OmniFocus taking focus, since `tab.url` is unreadable without the `tabs` permission.
- **Clicking a clip notification without the native helper** opened OmniFocus to an “Invalid URL” alert (bare `omnifocus:///`); it now opens the Inbox perspective.

### Added

- **Clip confirmation notification** — after a successful clip (toolbar, keyboard shortcut, or context menu), show a local “Clipped to OmniFocus” toast with the task name. Failures degrade silently so a broken notification path never undoes a successful handoff. These are browser toasts (not macOS Notification Center).
- **Open task from notification** — click the confirmation toast to bring up that task in OmniFocus (resolves the newest matching task via the native host / Safari handler; falls back to activating OmniFocus if lookup isn’t available).
- **Keep clip notification visible** setting — choose auto-hide after about 5 seconds (default) or leave the toast on screen until you click or dismiss it. Auto-hide clears the toast explicitly (macOS/Brave often ignore the browser’s own auto-dismiss).

### Fixed

- **Line breaks in clipped notes** — excerpt cleanup no longer flattens all whitespace into a single line (multi-line X posts, YouTube descriptions, and article paragraphs keep their carriage returns). On X/Twitter, prefer the live tweet text over meta tags, which drop newlines.
- **Shallow clips (e.g. Quora)** — prefer live article/answer text over short meta teasers; fill the note budget with more than three paragraphs; Quora uses answer-body selectors (`.q-text` / answer containers) and JSON-LD when present.
- **Long X posts cut off** — note/excerpt budget raised from 1200 → 8000 characters; note composition always keeps the source URL and only trims the body; X extraction also reads long-form article bodies when present.
- **X self-threads** — on a status URL, clip the full author thread into one note: numbered posts (`1/8`…`N/N`) and unnumbered multi-post threads (e.g. “Truth 1…Truth 18” without markers). Scrolls the conversation and copies each same-author post as it mounts (X virtualizes the timeline, so collecting only at the end kept ~5 posts). Also reads embedded `full_text` for the author’s `/handle/status/` IDs.
- **Dead links on X clips** — tweet bodies and titles no longer keep CSS-truncated URL text (`memory.th…` — `.th` is a real TLD, so OmniFocus/Krank turned it into `http://memory.th`) or media `t.co` wrappers that go to `/photo/1`. Real article `t.co` links expand to the destination; photo/video shorteners are dropped (the status permalink is already the first line of the note).

## [1.0.0] — 2026-07

Initial public release on the [Chrome Web Store](https://chromewebstore.google.com/detail/web-clipper-for-omnifocus/fnaebddmgddhcfdccfjpkinlbabeldcd) and [Mac App Store](https://apps.apple.com/us/app/web-clipper-for-omnifocus/id6791601135?mt=12).

- Clip the current page or selection to OmniFocus (toolbar, context menu, keyboard shortcuts).
- Background open so clipping doesn’t steal focus from the browser.
- Smart capture (title, excerpt, selection) and YouTube-aware timestamps.
- Defaults for project, tag, note template, flag, autosave, and optional switch-to-OmniFocus / reveal-new-item.
- Optional native messaging host for flash-free background open on Chrome/Brave.
- Safari (macOS) packaging; offline Task Preview when OmniFocus isn’t available.
