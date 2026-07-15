import { DEFAULT_SETTINGS } from "./src/omnifocus.js";
import { isSafari } from "./src/platform.js";

// An extension cannot bind, rebind, or clear its own commands — only the
// browser's own UI can. Chrome exposes a page for it; Safari does not.
const CHROME_SHORTCUTS_URL = "chrome://extensions/shortcuts";

const form = document.getElementById("settings-form");
const projectEl = document.getElementById("project");
const tagEl = document.getElementById("tag");
const noteTemplateEl = document.getElementById("note-template");
const flagEl = document.getElementById("flag");
const autosaveEl = document.getElementById("autosave");
const activateOmniFocusEl = document.getElementById("activate-omnifocus");
const revealNewItemEl = document.getElementById("reveal-new-item");
const statusEl = document.getElementById("status");
const shortcutsEl = document.getElementById("shortcuts");
const shortcutsHelpEl = document.getElementById("shortcuts-help");
const openShortcutsEl = document.getElementById("open-shortcuts");

init();

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  projectEl.value = settings.project ?? "";
  tagEl.value = settings.tag ?? DEFAULT_SETTINGS.tag;
  noteTemplateEl.value = settings.noteTemplate ?? "";
  flagEl.checked = Boolean(settings.flag);
  autosaveEl.checked = settings.autosave !== false;
  activateOmniFocusEl.checked = settings.activateOmniFocus !== false;
  revealNewItemEl.checked = Boolean(settings.revealNewItem);

  syncRevealNewItemState();
  activateOmniFocusEl.addEventListener("change", syncRevealNewItemState);
  form.addEventListener("submit", onSubmit);

  await renderShortcuts();
}

/**
 * Render the shortcuts the browser actually has bound, rather than the ones the
 * manifest suggested — they diverge as soon as anyone rebinds or clears one.
 */
async function renderShortcuts() {
  /** @type {chrome.commands.Command[]} */
  let commands = [];
  try {
    commands = (await chrome.commands?.getAll?.()) ?? [];
  } catch {
    commands = [];
  }

  const clipCommands = commands.filter((command) => command.name !== "_execute_action");

  shortcutsEl.replaceChildren(
    ...clipCommands.map((command) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = command.description || command.name;

      const value = document.createElement("span");
      if (command.shortcut) {
        const key = document.createElement("kbd");
        key.textContent = command.shortcut;
        value.append(key);
      } else {
        value.className = "shortcuts__unset";
        value.textContent = "Not set";
      }

      item.className = "shortcuts__item";
      item.append(label, value);
      return item;
    })
  );

  if (isSafari()) {
    shortcutsHelpEl.textContent =
      "Safari manages extension shortcuts in Safari → Settings → Extensions.";
    return;
  }

  shortcutsHelpEl.textContent =
    "Shortcuts are set by the browser, not by this extension. Use the button below to change them, or to clear one so it has no shortcut at all.";
  openShortcutsEl.hidden = false;
  openShortcutsEl.addEventListener("click", () => {
    // A plain link can't reach chrome:// URLs; tabs.create can.
    chrome.tabs.create({ url: CHROME_SHORTCUTS_URL });
  });
}

function syncRevealNewItemState() {
  const activate = activateOmniFocusEl.checked;
  revealNewItemEl.disabled = !activate;

  if (!activate) {
    revealNewItemEl.checked = false;
  }
}

/**
 * @param {SubmitEvent} event
 */
async function onSubmit(event) {
  event.preventDefault();

  await chrome.storage.sync.set({
    project: projectEl.value.trim(),
    tag: tagEl.value.trim(),
    noteTemplate: noteTemplateEl.value,
    flag: flagEl.checked,
    autosave: autosaveEl.checked,
    activateOmniFocus: activateOmniFocusEl.checked,
    revealNewItem: revealNewItemEl.checked,
  });

  statusEl.textContent = "Settings saved.";
  window.setTimeout(() => {
    statusEl.textContent = "";
  }, 1800);
}