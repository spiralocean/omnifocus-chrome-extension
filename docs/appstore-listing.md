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

```
This app installs a Safari web extension that creates tasks in OmniFocus for Mac.

TO TEST:
1. Launch the app once; it explains how to enable the extension.
2. In Safari → Settings → Extensions, enable "Web Clipper for OmniFocus" and allow it on the current site.
3. Click the toolbar button (or right-click → Clip page to OmniFocus) on any web page.
4. The extension builds an omnifocus:// task URL and hands it to OmniFocus.

NOTE: Creating the task requires OmniFocus for Mac to be installed (free trial available from The Omni Group at https://www.omnigroup.com/omnifocus/). If OmniFocus is not installed, the extension shows an error explaining it is required — this is expected behavior, not a bug. The extension makes no network requests and collects no data.

This is an unofficial extension using the OmniFocus name nominatively (compatibility). It is not affiliated with or endorsed by The Omni Group.
```

---

## Screenshots (Mac)  ← still needed

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

## Submitted — in review (2026-07-17)

- [x] Version 1.0.0, build attached, export compliance answered, metadata +
      screenshots in, privacy = Data Not Collected.
- [x] **Submitted for review 2026-07-17.** Awaiting Apple App Review (often
      ~24–48h for Mac). Watch for a possible trademark question on "for
      OmniFocus" (see below) or a reviewer without OmniFocus installed — the
      App Review notes above address the dependency.

---

## Trademark note (expect a possible review question)

Apple scrutinizes third-party trademarks in app names more than Google does.
"for OmniFocus" is nominative/compatibility use, and the disclaimer is in the
description, the app UI, and the privacy policy. If review asks, the answer is:
unofficial compatibility extension, nominative use, not claiming affiliation.
Have The Omni Group's trademark guidelines link ready if needed.
