import { DEFAULT_SETTINGS } from "./omnifocus.js";

const NOTIFICATION_ICON = "icons/icon128.png";

/** Stable id so rapid clips replace rather than stack. */
export const CLIP_NOTIFICATION_ID = "clip-result";

/**
 * How long an auto-hide toast stays on screen. Chrome's requireInteraction
 * flag is unreliable on macOS (Brave/Chrome often leave the banner up), so we
 * call notifications.clear ourselves after this delay when the user prefers
 * auto-hide.
 */
export const AUTO_HIDE_MS = 5000;

const TARGET_KEY_PREFIX = "clipNotify:";

/**
 * @typedef {{ taskName: string }} ClipNotificationTarget
 */

/** @type {ReturnType<typeof setTimeout> | null} */
let autoHideTimer = null;

/**
 * session storage survives MV3 service-worker restarts within a browser
 * session; fall back to local for hosts that lack session.
 */
function targetStorage() {
  return chrome.storage?.session ?? chrome.storage?.local ?? null;
}

/**
 * @returns {Promise<boolean>}
 */
async function notificationShouldStayVisible() {
  try {
    const stored = await chrome.storage.sync.get({
      notificationStayVisible: DEFAULT_SETTINGS.notificationStayVisible,
    });
    return Boolean(stored.notificationStayVisible);
  } catch {
    return Boolean(DEFAULT_SETTINGS.notificationStayVisible);
  }
}

/**
 * @param {string} notificationId
 * @returns {string}
 */
function targetKey(notificationId) {
  return `${TARGET_KEY_PREFIX}${notificationId}`;
}

/**
 * @returns {boolean}
 */
export function canUseNotifications() {
  return Boolean(chrome.notifications?.create);
}

/**
 * Remember what a success toast should open when clicked. Failure toasts omit
 * this so a click is a no-op. Stored in extension storage so an MV3 service
 * worker restart between clip and click does not lose the target.
 *
 * @param {string} notificationId
 * @param {string} taskName
 */
export async function rememberClipNotification(notificationId, taskName) {
  const name = (taskName || "").trim();
  const store = targetStorage();
  if (!notificationId || !name || !store) return;

  try {
    await store.set({ [targetKey(notificationId)]: { taskName: name } });
  } catch {
    // Storage full / unavailable — click will fall back to a no-op.
  }
}

/**
 * Consume the click target for a notification (single-shot).
 *
 * @param {string} notificationId
 * @returns {Promise<ClipNotificationTarget | null>}
 */
export async function takeClipNotification(notificationId) {
  const store = targetStorage();
  if (!notificationId || !store) return null;

  const key = targetKey(notificationId);
  try {
    const stored = await store.get(key);
    const target = stored?.[key] ?? null;
    await store.remove(key);
    if (target && typeof target.taskName === "string" && target.taskName.trim()) {
      return { taskName: target.taskName.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Drop a stored click target without opening anything (e.g. when a new toast
 * replaces the previous one under the same id).
 *
 * @param {string} notificationId
 */
async function forgetClipNotification(notificationId) {
  const store = targetStorage();
  if (!notificationId || !store) return;
  try {
    await store.remove(targetKey(notificationId));
  } catch {
    // ignore
  }
}

export function cancelAutoHide() {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

/**
 * @param {string} notificationId
 */
function scheduleAutoHide(notificationId) {
  cancelAutoHide();
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null;
    try {
      chrome.notifications.clear(notificationId, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // Host tore down notifications API — ignore.
    }
    // Toast is gone; drop the click target so session storage doesn't linger.
    void forgetClipNotification(notificationId);
  }, AUTO_HIDE_MS);
}

/**
 * Show a local confirmation (or error) after a clip. Failures are swallowed so
 * a broken notification path never undoes a successful handoff to OmniFocus.
 *
 * These are browser toast notifications (Chrome/Brave/Safari extension API),
 * not macOS Notification Center items — they won't appear under System Settings.
 *
 * Auto-hide: we clear the toast ourselves after AUTO_HIDE_MS. Relying only on
 * requireInteraction:false is not reliable on macOS with Brave/Chrome.
 *
 * @param {string} title
 * @param {string} message
 * @returns {Promise<string | null>} notification id when created, else null
 */
export async function showExtensionNotification(title, message) {
  if (!canUseNotifications()) return null;

  const iconUrl = chrome.runtime.getURL(NOTIFICATION_ICON);
  const stayVisible = await notificationShouldStayVisible();
  const options = {
    type: "basic",
    iconUrl,
    title: title || "Web Clipper for OmniFocus",
    message: message || "",
    priority: 0,
    // Hint to the browser; macOS often ignores this for extension toasts.
    requireInteraction: stayVisible,
  };

  /** @type {string | null} */
  let createdId = null;

  try {
    // Stable id replaces any prior clip toast so rapid clips don't stack.
    // Drop any prior click target for that id; the caller re-registers on success.
    await forgetClipNotification(CLIP_NOTIFICATION_ID);
    cancelAutoHide();
    const id = await chrome.notifications.create(CLIP_NOTIFICATION_ID, options);
    createdId = id || CLIP_NOTIFICATION_ID;
  } catch {
    // Some hosts reject create-with-id; fall back to an auto id.
    try {
      const id = await chrome.notifications.create(options);
      createdId = id || null;
    } catch {
      // requireInteraction unsupported or permission denied — last try bare.
      try {
        const id = await chrome.notifications.create({
          type: options.type,
          iconUrl: options.iconUrl,
          title: options.title,
          message: options.message,
        });
        createdId = id || null;
      } catch {
        // OS / browser notification permission denied — ignore.
        return null;
      }
    }
  }

  if (createdId && !stayVisible) {
    scheduleAutoHide(createdId);
  }

  return createdId;
}
