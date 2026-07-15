# Web Clipper for OmniFocus

Send web pages and text selections straight to [OmniFocus](https://www.omnigroup.com/omnifocus/)
as tasks — with the page URL, an excerpt, and your default project/tag already
filled in. Works in **Chrome/Brave** and **Safari**, and opens OmniFocus **in
the background** so clipping never steals focus from the page you're reading.

> Requires **macOS** and **OmniFocus for Mac**. This is an unofficial extension
> and is not affiliated with or endorsed by The Omni Group.

## Features

- **One-click clipping** from the toolbar button, the right-click menu (page or
  selected text), or keyboard shortcuts.
- **Background open** — OmniFocus receives the task without coming to the
  foreground, so you stay on the page.
- **Smart capture** — pulls the page title, a clean excerpt, and any selected
  text into the task note.
- **YouTube-aware** — captures the video's real title and description, and folds
  the current playback position into the link so the task resumes where you
  left off.
- **Your defaults** — set a default project, tag, note template, and flags once;
  every clip uses them.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘⇧O | Clip the current page |
| ⌘⇧S | Clip the selected text |

## Install

### Chrome / Brave (unpacked)

1. Open `chrome://extensions` (or `brave://extensions`) and turn on
   **Developer mode**.
2. Click **Load unpacked** and select this repository's root folder.
3. The **Web Clipper for OmniFocus** icon appears in the toolbar.

#### Optional: flash-free background open

Out of the box, clipping uses a hidden handoff tab, which may briefly flash
OmniFocus forward. To eliminate that entirely, install the native helper, which
opens the URL with `open -g` (background):

```sh
# Find the extension's ID at chrome://extensions (Developer mode → the ID under
# "Web Clipper for OmniFocus"), then:
./native-host/install.sh <extension-id>
```

Reload the extension afterward. To remove the helper: `./native-host/install.sh --uninstall`.

### Safari (build from source)

The Safari version is an Xcode project under
[`safari/`](safari/) that wraps the same extension in a macOS/iOS container app.

1. Open `safari/Clip to OmniFocus/Clip to OmniFocus.xcodeproj` in Xcode.
2. Select the **Clip to OmniFocus (macOS)** scheme and run it (⌘R). Signing with
   your own Apple Development team makes the extension appear in Safari without
   the "Allow Unsigned Extensions" step.
3. In Safari → **Settings → Extensions**, enable **Clip to OmniFocus**.

On Safari, the background open is handled natively by the container app
(`SafariWebExtensionHandler` → `NSWorkspace`), so no separate helper is needed.

## Settings

Open the extension's options to configure:

- **Default project** — where clips go (blank = Inbox). Must match your OmniFocus
  database exactly.
- **Default tag** — applied to every clip.
- **Note template** — customize the note body with the placeholders `{url}`,
  `{title}`, `{excerpt}`, and `{selection}`. Leave blank for the built-in format.
- **Flag clipped tasks** — flag by default.
- **Save immediately** — save without showing OmniFocus's Quick Entry window.
- **Switch to OmniFocus after clipping** — off by default (keeps focus on the
  page). Turn on if you'd rather jump to OmniFocus.
- **Reveal new item** — select the new task in OmniFocus (only when switching to
  OmniFocus is on).

## How it works

Clips are delivered to OmniFocus via its `omnifocus://` URL scheme:

- **Chrome/Brave** send the URL through a native messaging host
  ([`native-host/host.py`](native-host/host.py)) that runs `open -g`, or fall
  back to a hidden handoff tab if the host isn't installed.
- **Safari** routes the URL to the container app's `SafariWebExtensionHandler`,
  which calls `NSWorkspace.open` with `activates: false`.

Everything runs locally — see [PRIVACY.md](PRIVACY.md).

## Project layout

```
background.js, popup.*, options.*   Chrome/Brave (MV3) extension
manifest.json, handoff.html
src/                                Shared logic (URL building, page extraction,
                                      native open, platform checks)
icons/                              Extension icons
scripts/make-icon.py                Regenerates all icons from one master
native-host/                        Chrome/Brave native messaging host + installer
safari/                             Safari web-extension Xcode project (macOS/iOS)
ios/                                iOS share-extension project
```

The Safari extension keeps its own copy of the shared code under
`safari/…/Shared (Extension)/Resources/`. When you change a file in the repo
root or `src/`, copy it into that folder so the two stay in sync.

## Regenerating the icon

The icon is original artwork drawn in code — no third-party assets:

```sh
python3 scripts/make-icon.py   # needs Pillow: pip install Pillow
```

This writes the extension icons and the full macOS/iOS app-icon set. Re-copy the
`icons/icon*.png` files into the Safari `Resources/icons/` folder afterward.

## Notes for maintainers

- **YouTube DOM selectors** (`#description-inline-expander`,
  `h1.ytd-watch-metadata`, etc.) depend on YouTube's internal markup, which
  changes without notice. If title/description capture ever breaks, these
  selectors in `src/extract-page.js` are the first place to look.
- **Trademark** — using the OmniFocus name/icon to *reference* OmniFocus is
  permitted with attribution; do not use Omni Group's own icon as this project's
  icon. See [The Omni Group's guidelines](https://www.omnigroup.com/press/).

## License

[MIT](LICENSE) © 2026 Stephen Zinn

_OmniFocus and the OmniFocus icon are trademarks of The Omni Group._
