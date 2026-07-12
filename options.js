import { DEFAULT_SETTINGS } from "./src/omnifocus.js";

const form = document.getElementById("settings-form");
const projectEl = document.getElementById("project");
const tagEl = document.getElementById("tag");
const noteTemplateEl = document.getElementById("note-template");
const flagEl = document.getElementById("flag");
const autosaveEl = document.getElementById("autosave");
const activateOmniFocusEl = document.getElementById("activate-omnifocus");
const revealNewItemEl = document.getElementById("reveal-new-item");
const statusEl = document.getElementById("status");

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