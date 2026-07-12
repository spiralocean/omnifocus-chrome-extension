const NOTIFICATION_ICON = "icons/icon128.png";

/**
 * @returns {boolean}
 */
export function canUseNotifications() {
  return Boolean(chrome.notifications?.create);
}

/**
 * @param {string} title
 * @param {string} message
 */
export async function showExtensionNotification(title, message) {
  if (!canUseNotifications()) return;

  await chrome.notifications.create({
    type: "basic",
    iconUrl: NOTIFICATION_ICON,
    title,
    message,
  });
}