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
const previewEl = document.getElementById("preview");
const previewLeadEl = document.getElementById("preview-lead");
const previewNameEl = document.getElementById("preview-name");
const previewProjectRow = document.getElementById("preview-project-row");
const previewProjectEl = document.getElementById("preview-project");
const previewTagRow = document.getElementById("preview-tag-row");
const previewTagEl = document.getElementById("preview-tag");
const previewNoteEl = document.getElementById("preview-note");
const previewLinkEl = document.getElementById("preview-link");
const copyLinkButton = document.getElementById("copy-link");

/** @type {{ title: string, url: string, excerpt: string, selection: string, siteName: string } | null} */
let pageData = null;

init();

async function init() {
  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  form.addEventListener("submit", onSubmit);
  taskNoteEl.addEventListener("keydown", onNoteKeydown);
  copyLinkButton.addEventListener("click", onCopyLink);

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
  taskNameEl.value = defaultTaskName(data.title, data.siteName);
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
  previewEl.hidden = true;
  setStatus("Sending to OmniFocus…");

  const settings = await getSettings();
  const fields = {
    name: taskNameEl.value.trim(),
    note: taskNoteEl.value.trim(),
    project: taskProjectEl.value.trim(),
    tag: taskTagEl.value.trim(),
    flag: taskFlagEl.checked,
  };
  const url = buildClipUrlFromFields(fields, settings);

  const response = await chrome.runtime.sendMessage({
    type: "OPEN_OMNIFOCUS_URL",
    url,
  });

  if (!response?.ok) {
    showTaskPreview(fields, url);
    clipButton.disabled = false;
    return;
  }

  setStatus("Sent to OmniFocus.");
  window.setTimeout(() => window.close(), 600);
}

/**
 * When the omnifocus:// handoff can't complete — most often because OmniFocus
 * for Mac isn't installed — show the fully-built task and its link instead of a
 * dead end, so the clip's output is visible and copyable without OmniFocus.
 *
 * @param {{ name: string, note: string, project: string, tag: string }} fields
 * @param {string} url
 */
function showTaskPreview(fields, url) {
  setStatus("");
  previewLeadEl.textContent =
    "OmniFocus for Mac didn’t respond, so the task wasn’t filed. Here’s exactly " +
    "what the clipper built — copy its link, or install OmniFocus to file it.";
  previewNameEl.textContent = fields.name || "Untitled";
  setPreviewRow(previewProjectRow, previewProjectEl, fields.project);
  setPreviewRow(previewTagRow, previewTagEl, fields.tag);
  previewNoteEl.textContent = fields.note || "—";
  previewLinkEl.value = url;
  resetCopyLabel();
  previewEl.hidden = false;
  previewEl.scrollIntoView({ block: "nearest" });
}

/**
 * @param {HTMLElement} row
 * @param {HTMLElement} valueEl
 * @param {string} value
 */
function setPreviewRow(row, valueEl, value) {
  const has = Boolean(value);
  row.hidden = !has;
  valueEl.textContent = has ? value : "";
}

async function onCopyLink() {
  const link = previewLinkEl.value;
  let copied = false;

  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    previewLinkEl.focus();
    previewLinkEl.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
  }

  copyLinkButton.textContent = copied ? "Copied ✓" : "Press ⌘C to copy";
  window.setTimeout(resetCopyLabel, 1600);
}

function resetCopyLabel() {
  copyLinkButton.textContent = "Copy OmniFocus link";
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