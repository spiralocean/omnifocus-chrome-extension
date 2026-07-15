# Privacy Policy

**Web Clipper for OmniFocus** does not collect, transmit, or store your data on any
server. It has no backend, no analytics, and makes no network requests.

## What the extension does with your data

When you clip a page, the extension reads information **from the active tab
only, and only at the moment you clip it**:

- the page title, URL, and site name;
- any text you have selected;
- a short excerpt (the page's meta description or the first few paragraphs of
  its main content);
- on YouTube watch pages, the video's title, description, and current playback
  position.

This information is used to build an `omnifocus://` link, which is handed to
**OmniFocus for Mac** on your own computer so it can create the task. That is
the only place your clipped content goes. Nothing is sent anywhere else.

## Where the data goes

- The clip is delivered to OmniFocus locally — either through the macOS
  `omnifocus://` URL scheme or, if you install the optional native helper,
  through a small local script that runs `open` on your machine. In both cases
  the data never leaves your computer except to reach OmniFocus.
- Your default settings (project, tag, note template, and toggles) are stored
  using the browser's extension storage. If you have browser sync enabled,
  these small preferences may sync across your own devices via your browser
  account; they are never sent to the developer.

## What is never collected

- No browsing history. The extension only reads a page when you explicitly
  clip it.
- No personal identifiers, no telemetry, no advertising, no third-party
  tracking of any kind.

## Permissions

The extension requests only what these functions require:

| Permission | Why |
|---|---|
| `activeTab` / `scripting` | Read the current page's title, URL, and content **when you clip it**. |
| `contextMenus` | Add the right-click "Clip page to OmniFocus" and "Clip selection to OmniFocus" items. |
| `notifications` | Show a confirmation after a clip. |
| `storage` | Remember your default settings. |
| `nativeMessaging` | Talk to the optional local helper that opens OmniFocus in the background. |

## Contact

Questions: **sz@spiralocean.com**

_Web Clipper for OmniFocus is an unofficial extension and is not affiliated with or
endorsed by The Omni Group. OmniFocus and the OmniFocus icon are trademarks of
The Omni Group._
