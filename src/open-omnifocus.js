import { OMNIFOCUS_HANDOFF_FAILED } from "./platform.js";

/**
 * Open an omnifocus:// URL from an extension context so Chrome only
 * asks once to allow the extension to open OmniFocus.
 */

const NATIVE_HOST = "com.spiralocean.clip_to_omnifocus";

const HANDOFF_TIMEOUT_MS = 4000;
// Until the first handoff succeeds, Chrome asks "Open OmniFocus?" inside the
// handoff tab. The prompt only renders in the active tab, so that first
// handoff is shown and the user is given time to answer it.
const FIRST_HANDOFF_TIMEOUT_MS = 60000;
const HANDOFF_CONFIRMED_KEY = "omnifocusHandoffConfirmed";
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
 * Wait for OmniFocus to take focus from Chrome, which is the one sign of a
 * successful handoff visible without the `tabs` permission (tab.url stays
 * unset, and an external-protocol navigation never commits anyway). The tab
 * closing first, or the deadline passing, counts as failure.
 *
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} whether the handoff succeeded
 */
function waitForHandoffOutcome(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const finish = (succeeded) => {
      clearTimeout(timer);
      chrome.windows.onFocusChanged.removeListener(onFocusChanged);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(succeeded);
    };
    const onFocusChanged = (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) finish(true);
    };
    const onRemoved = (removedId) => {
      if (removedId === tabId) finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    chrome.windows.onFocusChanged.addListener(onFocusChanged);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

/**
 * @returns {Promise<boolean>}
 */
async function isHandoffConfirmed() {
  try {
    const stored = await chrome.storage.local.get(HANDOFF_CONFIRMED_KEY);
    return stored[HANDOFF_CONFIRMED_KEY] === true;
  } catch {
    return false;
  }
}

/**
 * @param {boolean} confirmed
 * @returns {Promise<void>}
 */
async function setHandoffConfirmed(confirmed) {
  try {
    await chrome.storage.local.set({ [HANDOFF_CONFIRMED_KEY]: confirmed });
  } catch {
    // Worst case the next clip shows the handoff tab again.
  }
}

/**
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      resolve(chrome.runtime.lastError ? null : tabs?.[0] ?? null);
    });
  });
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
      action: "open",
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
 * Ask native code to find the most recently created OmniFocus task with this
 * name and open its omnifocus:///task/… URL (activating OmniFocus).
 *
 * @param {string} taskName
 * @returns {Promise<{ available: boolean, ok?: boolean, error?: string }>}
 */
async function revealTaskViaNativeHost(taskName) {
  const runtime = nativeRuntime();
  if (!runtime) return { available: false };

  try {
    const response = await runtime.sendNativeMessage(NATIVE_HOST, {
      action: "reveal-task",
      name: taskName,
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

  // Once "Always allow" is ticked the handoff can run in a hidden tab. Until
  // then, a hidden tab would swallow Chrome's prompt and always time out.
  const confirmed = await isHandoffConfirmed();

  const previousWindow = options.returnFocus
    ? await new Promise((resolve) => {
        chrome.windows.getLastFocused((win) => {
          resolve(chrome.runtime.lastError ? null : win ?? null);
        });
      })
    : null;
  const previousTab = confirmed ? null : await getActiveTab();

  const tab = await new Promise((resolve, reject) => {
    chrome.tabs.create(
      { url: buildHandoffPageUrl(ofUrl), active: !confirmed },
      (created) => {
        if (chrome.runtime.lastError || !created?.id) {
          reject(
            new Error(chrome.runtime.lastError?.message || "Could not open OmniFocus.")
          );
          return;
        }
        resolve(created);
      }
    );
  });

  const succeeded = await waitForHandoffOutcome(
    tab.id,
    confirmed ? HANDOFF_TIMEOUT_MS : FIRST_HANDOFF_TIMEOUT_MS
  );
  await removeTab(tab.id);

  if (previousTab?.id !== undefined) {
    chrome.tabs.update(previousTab.id, { active: true }, () => {
      void chrome.runtime.lastError;
    });
  }

  if (!succeeded) {
    // Chrome may have forgotten "Always allow"; show the prompt next time.
    if (confirmed) await setHandoffConfirmed(false);
    throw new Error(OMNIFOCUS_HANDOFF_FAILED);
  }

  if (!confirmed) await setHandoffConfirmed(true);

  if (previousWindow?.id !== undefined) {
    await sleep(REFOCUS_DELAY_MS);
    chrome.windows.update(previousWindow.id, { focused: true }, () => {
      void chrome.runtime.lastError;
    });
  }
}

/**
 * Open the clipped task in OmniFocus (user clicked the confirmation toast).
 * Prefers a native lookup of the task by name; falls back to activating
 * OmniFocus so at least the app comes forward.
 *
 * @param {string} taskName
 * @returns {Promise<void>}
 */
export async function openClippedTask(taskName) {
  const name = (taskName || "").trim();
  if (name) {
    const native = await revealTaskViaNativeHost(name);
    if (native.available) {
      if (native.ok) return;
      // Native host is installed but couldn't resolve the task (no match,
      // Automation denied, …). Still bring OmniFocus forward.
    }
  }

  // A bare omnifocus:/// makes OmniFocus show an "Invalid URL" alert; the
  // Inbox perspective is where an unassigned clip lands anyway.
  await openOmniFocusUrl("omnifocus:///perspective/Inbox", { returnFocus: false });
}
