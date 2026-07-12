import {
  buildClipUrlFromFields,
  DEFAULT_SETTINGS,
  formatClipNote,
  defaultTaskName,
} from "./src/omnifocus.js";
import { isMac, OMNIFOCUS_MAC_REQUIRED } from "./src/platform.js";

const form = document.getElementById("clip-form");
const siteNameEl = document.getElementById("site-name");
const taskNameEl = document.getElementById("task-name");
const taskNoteEl = document.getElementById("task-note");
const taskProjectEl = document.getElementById("task-project");
const taskTagEl = document.getElementById("task-tag");
const taskFlagEl = document.getElementById("task-flag");
const statusEl = document.getElementById("status");
const clipButton = document.getElementById("clip-button");
const settingsButton = document.getElementById("open-settings");

/** @type {{ title: string, url: string, excerpt: string, selection: string, siteName: string } | null} */
let pageData = null;

init();

async function init() {
  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  form.addEventListener("submit", onSubmit);
  taskNoteEl.addEventListener("keydown", onNoteKeydown);

  if (!isMac()) {
    showError(OMNIFOCUS_MAC_REQUIRED);
    clipButton.disabled = true;
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError("No active tab found.");
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      showError("This page cannot be clipped.");
      clipButton.disabled = true;
      return;
    }

    const settings = await getSettings();
    const response = await chrome.runtime.sendMessage({
      type: "GET_PAGE_DATA",
      tabId: tab.id,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Failed to read page.");
    }

    pageData = response.data;
    populateForm(pageData, settings);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to read page.");
    clipButton.disabled = true;
  }
}

/**
 * @param {{ title: string, url: string, excerpt: string, selection: string, siteName: string }} data
 * @param {typeof DEFAULT_SETTINGS} settings
 */
function populateForm(data, settings) {
  siteNameEl.textContent = data.siteName || new URL(data.url).hostname;
  taskNameEl.value = defaultTaskName(data.title);
  taskNoteEl.value = formatClipNote(data, settings.noteTemplate);
  taskProjectEl.value = settings.project;
  taskTagEl.value = settings.tag;
  taskFlagEl.checked = settings.flag;

  taskNameEl.focus();
  taskNameEl.select();
}

/**
 * @param {KeyboardEvent} event
 */
function onNoteKeydown(event) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
}

/**
 * @param {SubmitEvent} event
 */
async function onSubmit(event) {
  event.preventDefault();
  if (!pageData) return;

  clipButton.disabled = true;
  setStatus("Sending to OmniFocus…");

  const settings = await getSettings();
  const url = buildClipUrlFromFields(
    {
      name: taskNameEl.value.trim(),
      note: taskNoteEl.value.trim(),
      project: taskProjectEl.value.trim(),
      tag: taskTagEl.value.trim(),
      flag: taskFlagEl.checked,
    },
    settings
  );

  const response = await chrome.runtime.sendMessage({
    type: "OPEN_OMNIFOCUS_URL",
    url,
  });

  if (!response?.ok) {
    showError(response?.error || "Could not open OmniFocus.");
    clipButton.disabled = false;
    return;
  }

  setStatus("Sent to OmniFocus.");
  window.setTimeout(() => window.close(), 600);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * @param {string} message
 */
function setStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error");
}

/**
 * @param {string} message
 */
function showError(message) {
  statusEl.textContent = message;
  statusEl.classList.add("is-error");
}

/**
 * @param {string | undefined} url
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  );
}