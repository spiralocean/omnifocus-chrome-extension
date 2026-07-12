/**
 * Shared OmniFocus URL scheme helpers.
 */

// Keep notes short enough for omnifocus:// URL limits in Chrome.
const NOTE_MAX_LENGTH = 1200;
const NAME_MAX_LENGTH = 500;

/**
 * @param {Record<string, string | boolean | undefined | null>} params
 * @param {{ autosave?: boolean }} [options]
 * @returns {string}
 */
export function buildOmniFocusAddUrl(params, options = {}) {
  const parts = [];
  const autosave = options.autosave ?? params.autosave === "true";

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const encoded =
      typeof value === "boolean" ? String(value) : encodeURIComponent(String(value));
    parts.push(`${key}=${encoded}`);
  }

  const path = autosave ? "omnifocus://x-callback-url/add" : "omnifocus:///add";
  return `${path}?${parts.join("&")}`;
}

/**
 * @param {{ url: string, excerpt?: string, selection?: string }} input
 * @param {string} [template]
 * @returns {string}
 */
export function formatClipNote(
  { title = "", url, excerpt = "", selection = "" },
  template
) {
  const body = selection.trim() || excerpt.trim();
  const defaultNote = body ? `${url}\n\n${body}` : url;

  if (!template) {
    return truncate(defaultNote, NOTE_MAX_LENGTH);
  }

  const note = template
    .replace(/\{url\}/g, url)
    .replace(/\{excerpt\}/g, excerpt.trim())
    .replace(/\{selection\}/g, selection.trim())
    .replace(/\{title\}/g, title.trim());

  return truncate(note.trim() || defaultNote, NOTE_MAX_LENGTH);
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * @param {string} title
 * @returns {string}
 */
export function defaultTaskName(title) {
  const cleaned = title.replace(/\s*[-|–—]\s*[^-|–—]+$/, "").trim();
  return truncate(cleaned || title || "Untitled", NAME_MAX_LENGTH);
}

/**
 * @typedef {Object} ClipSettings
 * @property {string} project
 * @property {string} tag
 * @property {boolean} flag
 * @property {boolean} revealNewItem
 * @property {boolean} activateOmniFocus
 * @property {boolean} autosave
 * @property {string} noteTemplate
 */

/** @type {ClipSettings} */
export const DEFAULT_SETTINGS = {
  project: "",
  tag: "",
  flag: false,
  revealNewItem: false,
  activateOmniFocus: false,
  autosave: true,
  noteTemplate: "",
};

/**
 * @param {Partial<ClipSettings>} settings
 * @returns {boolean}
 */
function shouldRevealNewItem(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return merged.activateOmniFocus !== false && Boolean(merged.revealNewItem);
}

/**
 * @param {{ title: string, url: string, excerpt?: string, selection?: string }} pageData
 * @param {Partial<ClipSettings>} settings
 * @param {{ name?: string, note?: string }} [overrides]
 * @returns {string}
 */
export function buildClipUrl(pageData, settings, overrides = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const name = truncate(
    overrides.name || defaultTaskName(pageData.title),
    NAME_MAX_LENGTH
  );
  const note =
    overrides.note ??
    formatClipNote(pageData, merged.noteTemplate || "");

  return buildOmniFocusAddUrl(
    {
      name,
      note,
      project: merged.project || undefined,
      context: merged.tag || undefined,
      flag: merged.flag ? "true" : undefined,
      autosave: merged.autosave ? "true" : undefined,
      "reveal-new-item": shouldRevealNewItem(merged) ? "true" : undefined,
    },
    { autosave: merged.autosave }
  );
}

/**
 * @param {Record<string, string | undefined>} fields
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {string}
 */
export function buildClipUrlFromFields(fields, settings) {
  return buildOmniFocusAddUrl(
    {
      name: fields.name,
      note: fields.note,
      project: fields.project || settings.project || undefined,
      context: fields.tag || settings.tag || undefined,
      flag: fields.flag ? "true" : undefined,
      autosave: settings.autosave ? "true" : undefined,
      "reveal-new-item": shouldRevealNewItem(settings) ? "true" : undefined,
    },
    { autosave: settings.autosave }
  );
}