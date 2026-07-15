import {
  buildClipUrl,
  DEFAULT_SETTINGS,
  defaultTaskName,
} from "./src/omnifocus.js";
import { extractPageData } from "./src/extract-page.js";
import { openOmniFocusUrl } from "./src/open-omnifocus.js";
import { isMac, OMNIFOCUS_MAC_REQUIRED } from "./src/platform.js";
import { showExtensionNotification } from "./src/notifications.js";

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
      .then(() => sendResponse({ ok: true }))
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
    await notifyClipSuccess(pageData);
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
 * @param {{ title?: string }} pageData
 */
async function notifyClipSuccess(pageData) {
  const taskName = defaultTaskName(pageData.title || "") || "Web page";
  await showExtensionNotification("Clipped to OmniFocus", taskName);
}

/**
 * @param {string} message
 */
async function notifyClipFailure(message) {
  await showExtensionNotification("Web Clipper for OmniFocus", message);
}