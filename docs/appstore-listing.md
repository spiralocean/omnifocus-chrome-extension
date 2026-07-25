# Mac App Store submission — Web Clipper for OmniFocus v1.0

Copy-paste metadata for App Store Connect, grouped by the section it goes in.
Platform: **macOS** (Safari web extension + container app). iOS is a separate
track (see the palace / `ios/` — parked).

Bundle ID: `com.spiralocean.cliptoomnifocus` · Team `2386YZLWA2` · SKU: `webclipper-omnifocus-mac`

---

## App information

**Name** (≤30 chars — this is 25)
```
Web Clipper for OmniFocus
```

**Subtitle** (≤30 chars)
```
Clip web pages to OmniFocus
```

**Primary category:** Productivity
**Secondary category:** (optional) Utilities

**Content rights:** Does not contain, show, or access third-party content.

---

## Pricing and availability

- Price: **Free**
- Availability: All countries/regions

---

## Version information (macOS 1.0)

**Promotional text** (≤170 chars, editable anytime without review)
```
Send any web page to OmniFocus as a task — with the title, a clean excerpt, and your default project and tag already filled in. OmniFocus opens in the background.
```

**Description**
```
Web Clipper for OmniFocus sends web pages and text selections straight to OmniFocus as tasks — with the page title, an excerpt, and your default project and tag already filled in. OmniFocus opens in the background, so clipping never steals focus from what you're reading.

FEATURES
• One-click clipping from the Safari toolbar or the right-click menu (page or selected text).
• Background open — OmniFocus receives the task without coming to the foreground.
• Smart capture — pulls the page title, a clean excerpt, and any selected text into the note, trimming site-name boilerplate from the title.
• YouTube-aware — captures a video's real title and description, and folds the current playback position into the link so the task resumes where you left off.
• Your defaults — set a default project, tag, note template, and flags once; every clip uses them.
• Private by design — no accounts, no analytics, no servers. Clips go from the page to OmniFocus on your own Mac and nowhere else.

REQUIREMENTS
Requires macOS and OmniFocus for Mac. After installing, enable the extension in Safari → Settings → Extensions.

Web Clipper for OmniFocus is an unofficial extension and is not affiliated with or endorsed by The Omni Group. OmniFocus and the OmniFocus icon are trademarks of The Omni Group.
```

**Keywords** (≤100 chars, comma-separated, no spaces after commas is fine)
```
omnifocus,clipper,web clipper,gtd,task,safari,todo,productivity,clip,read later,bookmark,capture
```

**Support URL**
```
https://clip.spiralocean.com/support
```

**Marketing URL**
```
https://clip.spiralocean.com
```

**Copyright**
```
2026 Stephen Zinn
```

---

## App privacy (App Store Connect → App Privacy)

- **Data collection: No** — "Data Not Collected." The extension has no backend,
  no analytics, and makes no network requests.
- **Privacy Policy URL**
```
https://clip.spiralocean.com/privacy
```

---

## Age rating

All categories **None** → rating **4+**.

---

## App Review notes  ← important; reviewers won't have OmniFocus

> **⚠️ Before the next submission:** the notes currently live in App Store
> Connect still open with the demo-video link below, and that video was deleted
> from clip.spiralocean.com on 2026-07-25 — the URL now 404s. It carries over to
> the next version, so strip the first two lines (or re-host the video) before
> submitting 1.1, or a reviewer's first action will be a dead link.
> Notes live at `appStoreReviewDetails/451df662-6c0e-43f4-a58c-05a899c2f911`.

```
Thank you for the review. As requested, a demonstration video showing the app running on a physical Mac, including all features and the extension's permission disclosure, is here:

https://clip.spiralocean.com/webclipper-demo.mp4   ← DEAD as of 2026-07-25

WHAT THE APP DOES
Web Clipper for OmniFocus is a Safari web extension (packaged in this Mac app) that turns the current web page — its title, URL, and any selected text — into a new task in OmniFocus with one click.

HOW TO ENABLE AND TEST
1. Open Safari → Settings → Extensions and turn on "Web Clipper for OmniFocus."
2. Click the toolbar button (or right-click a page → "Clip page to OmniFocus"). The clipper reads the current page and creates the task.

ABOUT PERMISSIONS
The extension requests only the activeTab permission. It has no persistent access to any website — it can read a page only at the moment you invoke it (click the toolbar button, use the context menu, or the keyboard shortcut). Safari discloses this at enable time, under Settings → Extensions → Permissions ("Webpage Contents… on the current tab's webpage when you use the extension"), which is shown in the video (Settings → Extensions → Permissions). Because access is scoped to activeTab, Safari does not present a separate per-site permission dialog during normal use — this is expected for a minimal-permission extension, not a missing step.

REVIEWING WITHOUT OMNIFOCUS INSTALLED
The app hands the finished task to OmniFocus via the standard omnifocus:// URL scheme. If OmniFocus is not installed on the review device, the extension detects this and displays an offline "Task Preview" panel showing the fully built task (name, project, tag, note) along with the omnifocus:// link and a Copy button — so the extension's behavior can be fully verified without installing any other app.

OPTIONAL COMPONENTS (not required to review)
- An optional native messaging helper lets the task open in the background without switching apps. It is installed manually by the user and is not required for core functionality.
- The extension optionally posts a local "Clipped to OmniFocus" confirmation; notifications are optional and not required.

No account, login, or network server is required. All processing is local to the device. The extension makes no network requests and collects no data.

This is an unofficial extension using the OmniFocus name nominatively (compatibility). It is not affiliated with or endorsed by The Omni Group.
```

---

## Screenshots (Mac)  ← DONE, uploaded with 1.0

Mac App Store accepts any one of these sizes (need **at least 1**, up to 10):
**1280×800**, 1440×900, 2560×1600, or 2880×1800.

- [ ] Capture the extension in use in Safari (popup with a clipped page) — same
      manual capture as Chrome; the popup can't be driven by automation.
- [ ] Optionally one of the container app's "how to enable" screen.
- Note: the existing Chrome screenshots are 1280×800 (a valid Mac size) but show
      Chrome/Brave chrome — reshoot in **Safari** for the Mac listing.
- I'll pad/crop to an exact accepted size once captured, same as Chrome.

---

## Build & upload (DONE)

- [x] Archive → export → App Store `.pkg`, signed Apple Distribution + Mac Team
      Store profile + 3rd Party Mac Developer Installer. Version 1.0.0, build 1,
      display name "Web Clipper for OmniFocus".
- [x] Uploaded to App Store Connect 2026-07-16 via `xcrun altool --upload-app`
      with API key BBX5APPZS8 (issuer b26a8e1e-...). UPLOAD SUCCEEDED.
- [x] App record created in ASC (macOS, com.spiralocean.cliptoomnifocus).

## LIVE on the Mac App Store (2026-07-25)

**https://apps.apple.com/us/app/web-clipper-for-omnifocus/id6791601135?mt=12**

- [x] Version 1.0.0, build attached, export compliance answered, metadata +
      screenshots in, privacy = Data Not Collected.
- [x] Submitted for review 2026-07-17.
- [x] Rejected 2026-07-20 under Guideline 2.1(a) — reviewer could not verify
      the hand-off without OmniFocus installed. Fixed by adding the offline
      "Task Preview" demo panel (`showTaskPreview()`), build bumped 1 → 2.
- [x] Rejected again 2026-07-23 under Guideline 2.1 — reviewer wanted a demo
      video of the app on a physical Mac. No code change; recorded the video,
      hosted it at `https://clip.spiralocean.com/webclipper-demo.mp4`, added the
      link to the App Review notes, replied in Resolution Center, resubmitted
      2026-07-24.
- [x] **Approved and released 2026-07-25.** State `READY_FOR_SALE`.
- [x] Cleanup: demo video deleted from the clip site and redeployed
      2026-07-25 — `https://clip.spiralocean.com/webclipper-demo.mp4` now 404s.
      The App Review notes in App Store Connect still reference it; see the
      warning above the notes block before submitting the next version.
- Note: the trademark question below never came up in review.

---

## Trademark note (expect a possible review question)

Apple scrutinizes third-party trademarks in app names more than Google does.
"for OmniFocus" is nominative/compatibility use, and the disclaimer is in the
description, the app UI, and the privacy policy. If review asks, the answer is:
unofficial compatibility extension, nominative use, not claiming affiliation.
Have The Omni Group's trademark guidelines link ready if needed.
