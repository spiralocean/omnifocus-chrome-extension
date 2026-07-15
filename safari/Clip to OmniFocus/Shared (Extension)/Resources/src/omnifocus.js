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

// Domain suffixes carry no brand information, so they never make useful keys.
const SITE_SUFFIXES = new Set([
  "com", "org", "net", "edu", "gov", "int", "mil",
  "co", "io", "ai", "app", "dev", "me", "tv", "info", "biz", "news",
  "uk", "us", "ca", "au", "de", "fr", "es", "it", "nl", "jp", "cn", "in", "br",
]);

/**
 * Reduce a value to a lowercase alphanumeric key: "The Verge" -> "theverge".
 *
 * @param {string} value
 * @returns {string}
 */
function toKey(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The set of keys a title's trailing segment could plausibly match for this
 * site. siteName is either an og:site_name ("The Verge") or a bare hostname
 * ("en.wikipedia.org"), so take the whole thing plus each meaningful hostname
 * label — that way "Wikipedia" matches en.wikipedia.org and "BBC" matches
 * bbc.co.uk without having to parse public suffixes.
 *
 * @param {string} siteName
 * @returns {Set<string>}
 */
function siteKeys(siteName) {
  const raw = (siteName || "").toLowerCase().trim();
  const keys = new Set();
  const whole = toKey(raw);
  if (whole) keys.add(whole);

  if (raw.includes(".")) {
    for (const label of raw.split(".")) {
      const key = toKey(label);
      if (key.length >= 3 && key !== "www" && !SITE_SUFFIXES.has(key)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

/**
 * Page titles usually end with the site's own name ("Some Article - The Verge"),
 * which is noise in a task name. Strip that segment only when it actually looks
 * like the site the page came from — a dash on its own is not evidence of
 * boilerplate. "Song - Artist" on YouTube is content, not a suffix, and
 * extract-page.js has already removed the real " - YouTube" before this runs.
 *
 * When the match is uncertain, keep the whole title: an over-long name lands in
 * an editable field, but an over-trimmed one silently loses content.
 *
 * @param {string} title
 * @param {string} [siteName]
 * @returns {string}
 */
export function defaultTaskName(title, siteName = "") {
  const trimmed = (title || "").trim();
  const match = trimmed.match(/^(.*\S)\s*[-|–—]\s*([^-|–—]+?)\s*$/);
  const keys = siteKeys(siteName);
  let cleaned = trimmed;

  if (match && keys.size > 0) {
    const segment = toKey(match[2]);
    const looksLikeSite =
      keys.has(segment) ||
      (segment.length >= 4 &&
        [...keys].some(
          (key) =>
            key.length >= 4 &&
            (key.includes(segment) || segment.includes(key))
        ));

    if (looksLikeSite) cleaned = match[1].trim();
  }

  return truncate(cleaned || trimmed || "Untitled", NAME_MAX_LENGTH);
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
 * @param {{ title: string, url: string, excerpt?: string, selection?: string, siteName?: string }} pageData
 * @param {Partial<ClipSettings>} settings
 * @param {{ name?: string, note?: string }} [overrides]
 * @returns {string}
 */
export function buildClipUrl(pageData, settings, overrides = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const name = truncate(
    overrides.name || defaultTaskName(pageData.title, pageData.siteName),
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