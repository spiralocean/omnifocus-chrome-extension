/**
 * Platform checks and user-facing requirement messages.
 */

export const OMNIFOCUS_DOWNLOAD_URL = "https://www.omnigroup.com/omnifocus/";

export const OMNIFOCUS_MAC_REQUIRED =
  "Clip to OmniFocus requires macOS and OmniFocus for Mac.";

export const OMNIFOCUS_HANDOFF_FAILED =
  "Couldn't open OmniFocus. Make sure OmniFocus for Mac is installed.";

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