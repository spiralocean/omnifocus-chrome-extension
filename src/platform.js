/**
 * Platform checks and user-facing requirement messages.
 */

export const OMNIFOCUS_DOWNLOAD_URL = "https://www.omnigroup.com/omnifocus/";

export const OMNIFOCUS_MAC_REQUIRED =
  "Web Clipper for OmniFocus requires macOS and OmniFocus for Mac.";

export const OMNIFOCUS_HANDOFF_FAILED =
  "Couldn't open OmniFocus. Make sure OmniFocus for Mac is installed.";

/**
 * Safari exposes a `chrome` alias but is not Chromium — it has no
 * chrome://extensions/shortcuts page, and manages extension shortcuts through
 * Safari's own settings instead.
 *
 * @returns {boolean}
 */
export function isSafari() {
  return navigator.vendor === "Apple Computer, Inc.";
}

/**
 * @returns {boolean}
 */
export function isMac() {
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform === "macOS";
  }

  const platform = navigator.platform || "";
  return platform === "MacIntel" || platform === "MacPPC" || platform === "Mac68K";
}