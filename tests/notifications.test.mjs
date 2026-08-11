/**
 * Run with: node --test tests/*.mjs
 *
 * The clip confirmation is the only feedback a keyboard or context-menu clip
 * ever gives — there is no popup to show status in. So the rules that matter
 * are: it fires on a successful clip, it degrades silently when the host has no
 * notifications API (iOS Safari) or the user denied them at the OS level, and a
 * failure to notify never propagates back into the clip path, which has already
 * succeeded by that point.
 *
 * Success toasts also register a click target (in extension storage) so the
 * background script can open the clipped task when the user clicks the toast.
 *
 * Auto-hide vs stay-visible: notificationStayVisible drives requireInteraction
 * and (when off) an explicit notifications.clear after AUTO_HIDE_MS — required
 * because macOS/Brave often ignore requireInteraction:false.
 */

import test from "node:test";
import assert from "node:assert/strict";

/**
 * In-memory stand-in for chrome.storage.session / .local / .sync.
 */
function memoryStore(initial = {}) {
  /** @type {Record<string, unknown>} */
  const data = { ...initial };
  return {
    async get(keyOrDefaults) {
      if (typeof keyOrDefaults === "string") {
        return { [keyOrDefaults]: data[keyOrDefaults] };
      }
      if (keyOrDefaults && typeof keyOrDefaults === "object") {
        const out = {};
        for (const [k, fallback] of Object.entries(keyOrDefaults)) {
          out[k] = k in data ? data[k] : fallback;
        }
        return out;
      }
      return { ...data };
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(key) {
      if (Array.isArray(key)) {
        for (const k of key) delete data[k];
      } else {
        delete data[key];
      }
    },
    _data: data,
  };
}

/**
 * notifications.js reads the `chrome` global at call time, so each test installs
 * its own stub. The module is imported once and reused across tests.
 *
 * @param {object | undefined} notifications
 * @param {{ session?: object, local?: object, sync?: object, stayVisible?: boolean }} [storage]
 */
function installChrome(notifications, storage = {}) {
  cancelAutoHide();
  const session = storage.session ?? memoryStore();
  const sync =
    storage.sync ??
    memoryStore({
      notificationStayVisible: storage.stayVisible ?? false,
    });
  globalThis.chrome = {
    notifications: notifications
      ? {
          clear: () => {},
          ...notifications,
        }
      : notifications,
    runtime: { getURL: (path) => `chrome-extension://test-id/${path}` },
    storage: {
      session,
      local: storage.local ?? memoryStore(),
      sync,
    },
  };
  return { session, sync };
}

const {
  showExtensionNotification,
  canUseNotifications,
  rememberClipNotification,
  takeClipNotification,
  cancelAutoHide,
  CLIP_NOTIFICATION_ID,
  AUTO_HIDE_MS,
} = await import("../src/notifications.js");

test("no notifications API (iOS Safari) is not an error", async () => {
  installChrome(undefined);
  assert.equal(canUseNotifications(), false);
  const id = await showExtensionNotification("Clipped to OmniFocus", "Some page");
  assert.equal(id, null);
});

test("fires with an absolute icon URL and the task name as the body", async () => {
  const calls = [];
  installChrome({
    create: async (...args) => {
      calls.push(args);
      return typeof args[0] === "string" ? args[0] : "auto-id";
    },
  });

  assert.equal(canUseNotifications(), true);
  const id = await showExtensionNotification("Clipped to OmniFocus", "Some article title");

  assert.equal(id, CLIP_NOTIFICATION_ID);
  assert.equal(calls.length, 1);
  const [nid, options] = calls[0];
  assert.equal(nid, "clip-result");
  assert.equal(options.title, "Clipped to OmniFocus");
  assert.equal(options.message, "Some article title");
  assert.equal(options.type, "basic");
  // A bare "icons/icon128.png" is resolved against the wrong base in a service
  // worker and the notification is dropped, so it must be extension-absolute.
  assert.equal(options.iconUrl, "chrome-extension://test-id/icons/icon128.png");
  // Default: auto-hide.
  assert.equal(options.requireInteraction, false);
});

test("reuses one id so rapid clips replace rather than stack", async () => {
  const ids = [];
  installChrome({
    create: async (id) => {
      ids.push(id);
      return id;
    },
  });

  await showExtensionNotification("Clipped to OmniFocus", "First page");
  await showExtensionNotification("Clipped to OmniFocus", "Second page");

  assert.deepEqual(ids, ["clip-result", "clip-result"]);
});

test("falls back to an auto id when the host rejects create-with-id", async () => {
  const calls = [];
  installChrome({
    create: async (...args) => {
      calls.push(args);
      if (typeof args[0] === "string") throw new Error("id not supported");
      return "generated-id";
    },
  });

  const id = await showExtensionNotification("Clipped to OmniFocus", "Some page");

  assert.equal(calls.length, 2);
  assert.equal(calls[1].length, 1, "retry passes options only, no id");
  assert.equal(calls[1][0].message, "Some page");
  assert.equal(id, "generated-id");
});

test("a denied OS permission never reaches the clip path", async () => {
  installChrome({
    create: async () => {
      throw new Error("Notifications are not permitted");
    },
  });

  // The clip already succeeded when this runs; a throw here would surface a
  // spurious failure to the user for a task that was in fact filed.
  const id = await showExtensionNotification("Clipped to OmniFocus", "Some page");
  assert.equal(id, null);
});

test("blank title and message fall back rather than render empty", async () => {
  const calls = [];
  installChrome({
    create: async (...args) => {
      calls.push(args);
      return "clip-result";
    },
  });

  await showExtensionNotification("", "");

  const [, options] = calls[0];
  assert.equal(options.title, "Web Clipper for OmniFocus");
  assert.equal(options.message, "");
});

test("notificationStayVisible maps to requireInteraction true", async () => {
  const calls = [];
  installChrome(
    {
      create: async (...args) => {
        calls.push(args);
        return typeof args[0] === "string" ? args[0] : "auto-id";
      },
    },
    { stayVisible: true }
  );

  await showExtensionNotification("Clipped to OmniFocus", "Stay put");

  assert.equal(calls[0][1].requireInteraction, true);
  cancelAutoHide();
});

test("auto-hide clears the toast after AUTO_HIDE_MS when stay-visible is off", async () => {
  const cleared = [];
  installChrome({
    create: async (id) => id,
    clear: (id, cb) => {
      cleared.push(id);
      if (typeof cb === "function") cb(true);
    },
  });

  await showExtensionNotification("Clipped to OmniFocus", "Will hide");
  assert.deepEqual(cleared, [], "must not clear immediately");

  await new Promise((resolve) => setTimeout(resolve, AUTO_HIDE_MS + 50));
  assert.deepEqual(cleared, [CLIP_NOTIFICATION_ID]);
});

test("stay-visible does not schedule auto clear", async () => {
  const cleared = [];
  installChrome(
    {
      create: async (id) => id,
      clear: (id, cb) => {
        cleared.push(id);
        if (typeof cb === "function") cb(true);
      },
    },
    { stayVisible: true }
  );

  await showExtensionNotification("Clipped to OmniFocus", "Stay put");
  await new Promise((resolve) => setTimeout(resolve, Math.min(AUTO_HIDE_MS, 200) + 50));
  assert.deepEqual(cleared, []);
  cancelAutoHide();
});

test("remember + take hands the task name to the click handler once", async () => {
  installChrome({ create: async (id) => id });

  await rememberClipNotification("clip-result", "  Read this article  ");
  assert.deepEqual(await takeClipNotification("clip-result"), {
    taskName: "Read this article",
  });
  // Second take is empty — click is single-shot.
  assert.equal(await takeClipNotification("clip-result"), null);
});

test("blank task names are not registered as click targets", async () => {
  installChrome({ create: async (id) => id });

  await rememberClipNotification("clip-result", "   ");
  assert.equal(await takeClipNotification("clip-result"), null);
});

test("creating a new toast clears the prior click target for that id", async () => {
  installChrome({
    create: async (id) => id,
  });

  await rememberClipNotification(CLIP_NOTIFICATION_ID, "Old task");
  await showExtensionNotification("Clipped to OmniFocus", "New task");
  // showExtensionNotification drops the old target; caller re-registers.
  assert.equal(await takeClipNotification(CLIP_NOTIFICATION_ID), null);
});

test("click targets survive a simulated service-worker storage round-trip", async () => {
  const { session } = installChrome({ create: async (id) => id });

  await rememberClipNotification("clip-result", "Persisted task");
  // New "worker" reads the same storage area.
  assert.equal(session._data["clipNotify:clip-result"].taskName, "Persisted task");
  assert.deepEqual(await takeClipNotification("clip-result"), {
    taskName: "Persisted task",
  });
});
