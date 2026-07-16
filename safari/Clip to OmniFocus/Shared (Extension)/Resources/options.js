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
  // Build every row before the first await. This page is an auto-sized dialog,
  // so anything that appears after the first paint resizes it under the user.
  const shortcutValues = renderShortcuts();

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

  await fillShortcutValues(shortcutValues);
}

/**
 * Lay out one row per command, synchronously. getManifest() is sync, so the
 * rows — and therefore the page's height — are settled before the first paint;
 * only the binding text arrives later.
 *
 * @returns {Map<string, HTMLElement>} command name -> the cell holding its key
 */
function renderShortcuts() {
  const commands = Object.entries(chrome.runtime.getManifest().commands ?? {});
  /** @type {Map<string, HTMLElement>} */
  const valueCells = new Map();

  shortcutsEl.replaceChildren(
    ...commands.map(([name, command]) => {
      const item = document.createElement("li");
      item.className = "shortcuts__item";

      const label = document.createElement("span");
      label.textContent = command.description || name;

      const value = document.createElement("span");
      valueCells.set(name, value);

      item.append(label, value);
      return item;
    })
  );

  if (isSafari()) {
    shortcutsHelpEl.textContent =
      "Safari manages extension shortcuts in Safari → Settings → Extensions.";
    return valueCells;
  }

  shortcutsHelpEl.textContent =
    "Shortcuts are set by the browser, not by this extension. Use the button below to change them, or to clear one so it has no shortcut at all.";
  openShortcutsEl.hidden = false;
  openShortcutsEl.addEventListener("click", () => {
    // A plain link can't reach chrome:// URLs; tabs.create can.
    chrome.tabs.create({ url: CHROME_SHORTCUTS_URL });
  });

  return valueCells;
}

/**
 * Fill in the bindings the browser actually reports, which diverge from the
 * manifest's suggestions the moment anyone rebinds or clears one. Text only —
 * .shortcuts__item reserves the row height so this cannot resize the dialog.
 *
 * @param {Map<string, HTMLElement>} valueCells
 */
async function fillShortcutValues(valueCells) {
  /** @type {{ name?: string, shortcut?: string }[]} */
  let commands = [];
  try {
    commands = (await chrome.commands?.getAll?.()) ?? [];
  } catch {
    return;
  }

  for (const command of commands) {
    const cell = valueCells.get(command.name);
    if (!cell) continue;

    if (command.shortcut) {
      const key = document.createElement("kbd");
      key.textContent = command.shortcut;
      cell.replaceChildren(key);
    } else {
      cell.className = "shortcuts__unset";
      cell.textContent = "Not set";
    }
  }
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