import { OMNIFOCUS_HANDOFF_FAILED } from "./platform.js";

/**
 * Open an omnifocus:// URL from an extension context so Chrome only
 * asks once to allow the extension to open OmniFocus.
 */

const NATIVE_HOST = "com.spiralocean.clip_to_omnifocus";

const HANDOFF_TIMEOUT_MS = 4000;
const HANDOFF_POLL_MS = 250;
// macOS activates OmniFocus when the URL scheme opens; wait for that
// to land before pulling focus back, or OmniFocus wins the race.
const REFOCUS_DELAY_MS = 450;
const HANDOFF_PAGE = "handoff.html";

/**
 * @param {string} ofUrl
 * @returns {string}
 */
function buildHandoffPageUrl(ofUrl) {
  const page = chrome.runtime.getURL(HANDOFF_PAGE);
  return `${page}?target=${encodeURIComponent(ofUrl)}`;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} tabId
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      resolve(chrome.runtime.lastError ? null : tab ?? null);
    });
  });
}

/**
 * @param {number} tabId
 * @returns {Promise<void>}
 */
function removeTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

/**
 * Poll the handoff tab until Chrome reports an outcome instead of
 * blocking for the full timeout:
 * - the omnifocus:// URL committing means the handoff succeeded
 * - a chrome-error:// interstitial means no protocol handler
 * - still sitting on handoff.html at the deadline counts as failure
 *
 * @param {number} tabId
 * @returns {Promise<boolean>} whether the handoff succeeded
 */
async function waitForHandoffOutcome(tabId) {
  for (let elapsed = 0; elapsed < HANDOFF_TIMEOUT_MS; elapsed += HANDOFF_POLL_MS) {
    await sleep(HANDOFF_POLL_MS);

    const tab = await getTab(tabId);
    if (!tab) return true;

    const url = tab.url || "";
    if (url.startsWith("chrome-error://")) return false;
    if (url.startsWith("omnifocus://")) return true;
  }

  return false;
}

/**
 * Native messaging lives on `browser.runtime` in Safari (its `chrome` alias
 * omits sendNativeMessage) and on `chrome.runtime` in Chrome/Brave.
 */
function nativeRuntime() {
  if (typeof browser !== "undefined" && browser.runtime?.sendNativeMessage) {
    return browser.runtime;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.sendNativeMessage) {
    return chrome.runtime;
  }
  return null;
}

/**
 * Ask native code to open the URL in the background:
 * - Chrome/Brave: the installed host (native-host/install.sh) runs `open -g`.
 * - Safari: routes to SafariWebExtensionHandler, which uses NSWorkspace.
 *
 * @param {string} ofUrl
 * @param {boolean} activate
 * @returns {Promise<{ available: boolean, ok?: boolean, error?: string }>}
 */
async function sendToNativeHost(ofUrl, activate) {
  const runtime = nativeRuntime();
  if (!runtime) return { available: false };

  try {
    // The promise form works in both Chrome MV3 and Safari. In Chrome a
    // missing host rejects; in Safari the handler always responds.
    const response = await runtime.sendNativeMessage(NATIVE_HOST, {
      url: ofUrl,
      activate,
    });
    if (!response) return { available: false };
    return { available: true, ok: Boolean(response.ok), error: response.error };
  } catch {
    return { available: false };
  }
}

/**
 * @param {string} ofUrl
 * @param {{ returnFocus?: boolean }} [options] returnFocus pulls the
 *   user's window back to the front after macOS activates OmniFocus.
 * @returns {Promise<void>}
 */
export async function openOmniFocusUrl(ofUrl, options = {}) {
  const native = await sendToNativeHost(ofUrl, !options.returnFocus);
  if (native.available) {
    if (!native.ok) {
      throw new Error(native.error || OMNIFOCUS_HANDOFF_FAILED);
    }
    return;
  }

  const previousWindow = options.returnFocus
    ? await new Promise((resolve) => {
        chrome.windows.getLastFocused((win) => {
          resolve(chrome.runtime.lastError ? null : win ?? null);
        });
      })
    : null;

  const tab = await new Promise((resolve, reject) => {
    chrome.tabs.create({ url: buildHandoffPageUrl(ofUrl), active: false }, (created) => {
      if (chrome.runtime.lastError || !created?.id) {
        reject(
          new Error(chrome.runtime.lastError?.message || "Could not open OmniFocus.")
        );
        return;
      }
      resolve(created);
    });
  });

  const succeeded = await waitForHandoffOutcome(tab.id);
  await removeTab(tab.id);

  if (!succeeded) {
    throw new Error(OMNIFOCUS_HANDOFF_FAILED);
  }

  if (previousWindow?.id !== undefined) {
    await sleep(REFOCUS_DELAY_MS);
    chrome.windows.update(previousWindow.id, { focused: true }, () => {
      void chrome.runtime.lastError;
    });
  }
}
