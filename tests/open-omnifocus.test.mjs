/**
 * Run with: node --test tests/*.mjs
 *
 * The handoff tab is the only path Chrome Web Store users have (the native
 * helper is a manual install). Chrome asks "Open OmniFocus?" the first time,
 * and that prompt only renders in the active tab, so:
 * - until a handoff has succeeded, the tab is shown (and given time)
 * - after that it runs hidden
 * - a hidden handoff that fails resets to shown, in case Chrome forgot the choice
 *
 * Success is OmniFocus taking focus from Chrome (windows.onFocusChanged to
 * WINDOW_ID_NONE); without the `tabs` permission tab.url is never readable.
 */

import test from "node:test";
import assert from "node:assert/strict";

const WINDOW_ID_NONE = -1;
const HANDOFF_TAB_ID = 7;
const PREVIOUS_TAB_ID = 3;

function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    fire: (...args) => [...listeners].forEach((fn) => fn(...args)),
    get size() {
      return listeners.size;
    },
  };
}

/**
 * @param {{ confirmed?: boolean, outcome: "focus-lost" | "tab-closed" }} opts
 */
function installChrome({ confirmed, outcome }) {
  const data = confirmed === undefined ? {} : { omnifocusHandoffConfirmed: confirmed };
  const created = [];
  const activated = [];
  const onFocusChanged = event();
  const onRemoved = event();

  globalThis.chrome = {
    runtime: { getURL: (path) => `chrome-extension://test-id/${path}` },
    storage: {
      local: {
        async get(key) {
          return { [key]: data[key] };
        },
        async set(items) {
          Object.assign(data, items);
        },
      },
    },
    windows: {
      WINDOW_ID_NONE,
      onFocusChanged,
      getLastFocused: (cb) => cb({ id: 1, focused: true }),
      update: (_id, _props, cb) => cb?.(),
    },
    tabs: {
      onRemoved,
      query: (_q, cb) => cb([{ id: PREVIOUS_TAB_ID }]),
      update: (id, props, cb) => {
        if (props.active) activated.push(id);
        cb?.();
      },
      remove: (_id, cb) => cb?.(),
      create: (props, cb) => {
        created.push(props);
        cb({ id: HANDOFF_TAB_ID });
        setTimeout(() => {
          if (outcome === "focus-lost") onFocusChanged.fire(WINDOW_ID_NONE);
          else onRemoved.fire(HANDOFF_TAB_ID);
        }, 0);
      },
    },
  };

  return { data, created, activated, onFocusChanged, onRemoved };
}

const { openOmniFocusUrl } = await import("../src/open-omnifocus.js");

test("first handoff opens a visible tab and remembers success", async () => {
  const chrome = installChrome({ outcome: "focus-lost" });

  await openOmniFocusUrl("omnifocus:///add?name=x");

  assert.equal(chrome.created.length, 1);
  assert.equal(chrome.created[0].active, true);
  assert.match(chrome.created[0].url, /handoff\.html\?target=omnifocus%3A/);
  assert.equal(chrome.data.omnifocusHandoffConfirmed, true);
  // The user is returned to the tab they clipped from.
  assert.deepEqual(chrome.activated, [PREVIOUS_TAB_ID]);
});

test("after a confirmed handoff the tab stays hidden", async () => {
  const chrome = installChrome({ confirmed: true, outcome: "focus-lost" });

  await openOmniFocusUrl("omnifocus:///add?name=x");

  assert.equal(chrome.created[0].active, false);
  assert.deepEqual(chrome.activated, []);
  assert.equal(chrome.data.omnifocusHandoffConfirmed, true);
});

test("a failed hidden handoff resets to visible for next time", async () => {
  const chrome = installChrome({ confirmed: true, outcome: "tab-closed" });

  await assert.rejects(openOmniFocusUrl("omnifocus:///add?name=x"), /Couldn't open OmniFocus/);
  assert.equal(chrome.data.omnifocusHandoffConfirmed, false);
});

test("closing the first-run tab without allowing is a failure, not a success", async () => {
  const chrome = installChrome({ outcome: "tab-closed" });

  await assert.rejects(openOmniFocusUrl("omnifocus:///add?name=x"), /Couldn't open OmniFocus/);
  assert.notEqual(chrome.data.omnifocusHandoffConfirmed, true);
});

test("listeners are removed once the handoff settles", async () => {
  const chrome = installChrome({ confirmed: true, outcome: "focus-lost" });

  await openOmniFocusUrl("omnifocus:///add?name=x");

  assert.equal(chrome.onFocusChanged.size, 0);
  assert.equal(chrome.onRemoved.size, 0);
});
