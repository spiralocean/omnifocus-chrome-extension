import {
  buildClipUrl,
  DEFAULT_SETTINGS,
  defaultTaskName,
} from "./src/omnifocus.js";
import { extractPageData } from "./src/extract-page.js";
import { openClippedTask, openOmniFocusUrl } from "./src/open-omnifocus.js";
import { isMac, OMNIFOCUS_MAC_REQUIRED } from "./src/platform.js";
import {
  cancelAutoHide,
  rememberClipNotification,
  showExtensionNotification,
  takeClipNotification,
} from "./src/notifications.js";

const MENU_PAGE = "clip-page";
const MENU_SELECTION = "clip-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: "Clip page to OmniFocus",
    contexts: ["page", "frame"],
  });

  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Clip selection to OmniFocus",
    contexts: ["selection"],
  });
});

// Clicking a success toast opens that task in OmniFocus.
if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    // Async work inside the listener: MV3 keeps the worker alive for the
    // returned promise from an async listener in Chromium; wrap explicitly
    // so a rejection never surfaces as an unhandled rejection.
    (async () => {
      cancelAutoHide();
      const target = await takeClipNotification(notificationId);
      chrome.notifications.clear(notificationId);
      if (!target?.taskName) return;
      try {
        await openClippedTask(target.taskName);
      } catch {
        // Best-effort: a failed open after a successful clip is not worth
        // another error toast (the task is already filed).
      }
    })();
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_PAGE) {
    await clipFromTab(tab, { preferSelection: false });
  }

  if (info.menuItemId === MENU_SELECTION) {
    await clipFromTab(tab, {
      preferSelection: true,
      selectionText: info.selectionText ?? "",
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_DATA" && message.tabId) {
    getPageData(message.tabId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to read page.",
        })
      );
    return true;
  }

  if (message?.type === "OPEN_OMNIFOCUS_URL" && message.url) {
    getSettings()
      .then((settings) =>
        openOmniFocusUrl(message.url, {
          returnFocus: settings.activateOmniFocus === false,
        })
      )
      .then(() => {
        // Answer first: the clip is already filed at this point, so the popup's
        // confirmation must not wait on — or be lost to — the notification path.
        sendResponse({ ok: true });

        // Popup clips close the window before the user can read status text;
        // mirror the keyboard/context-menu confirmation here.
        if (message.notify !== false) {
          const taskName =
            typeof message.taskName === "string" && message.taskName.trim()
              ? message.taskName.trim()
              : "Web page";
          return notifyClipSuccessName(taskName);
        }
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not open OmniFocus.",
        })
      );
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "clip-page") {
    await clipFromTab(tab, { preferSelection: false });
  }

  if (command === "clip-selection") {
    await clipFromTab(tab, { preferSelection: true });
  }
});

/**
 * @param {chrome.tabs.Tab} tab
 * @param {{ preferSelection?: boolean, selectionText?: string, overrides?: { name?: string, note?: string } }} [options]
 */
async function clipFromTab(tab, options = {}) {
  if (!tab.id) return;

  if (!isMac()) {
    await notifyClipFailure(OMNIFOCUS_MAC_REQUIRED);
    return;
  }

  try {
    const settings = await getSettings();
    const pageData = await getPageData(tab.id);

    if (options.selectionText) {
      pageData.selection = options.selectionText;
    }

    if (options.preferSelection && !pageData.selection) {
      return;
    }

    const url = buildClipUrl(pageData, settings, options.overrides);
    await openOmniFocusUrl(url, {
      returnFocus: settings.activateOmniFocus === false,
    });
    await notifyClipSuccess(pageData, options.overrides?.name);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not open OmniFocus.";
    await notifyClipFailure(message);
  }
}

/**
 * @param {number} tabId
 */
async function getPageData(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageData,
  });
  return result;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * @param {{ title?: string, siteName?: string }} pageData
 * @param {string} [overrideName]
 */
async function notifyClipSuccess(pageData, overrideName) {
  const taskName =
    (overrideName && overrideName.trim()) ||
    defaultTaskName(pageData.title || "", pageData.siteName) ||
    "Web page";
  await notifyClipSuccessName(taskName);
}

/**
 * @param {string} taskName
 */
async function notifyClipSuccessName(taskName) {
  const id = await showExtensionNotification("Clipped to OmniFocus", taskName);
  if (id) await rememberClipNotification(id, taskName);
}

/**
 * @param {string} message
 */
async function notifyClipFailure(message) {
  // No rememberClipNotification — clicking an error toast should not open OF.
  await showExtensionNotification("Web Clipper for OmniFocus", message);
}
