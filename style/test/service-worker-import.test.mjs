import test from "node:test";
import assert from "node:assert/strict";

test("service worker registers toolbar click and message handlers", async () => {
  const listeners = {
    clicked: [],
    messages: []
  };

  globalThis.chrome = {
    action: {
      onClicked: {
        addListener(listener) {
          listeners.clicked.push(listener);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.messages.push(listener);
        }
      }
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback({});
        },
        set(_value, callback) {
          callback?.();
        }
      }
    }
  };

  await import(`../src/background/service-worker.js?case=${Date.now()}`);

  assert.equal(listeners.clicked.length, 1);
  assert.equal(listeners.messages.length, 1);

  delete globalThis.chrome;
});

test("service worker marks the toolbar action while inspector is enabled", async () => {
  const listeners = {
    clicked: [],
    messages: []
  };
  const badgeTextCalls = [];
  const badgeColorCalls = [];
  const titleCalls = [];
  const toggleResponses = [{ enabled: true }, { enabled: false }];

  globalThis.chrome = {
    action: {
      onClicked: {
        addListener(listener) {
          listeners.clicked.push(listener);
        }
      },
      setBadgeText(details) {
        badgeTextCalls.push(details);
      },
      setBadgeBackgroundColor(details) {
        badgeColorCalls.push(details);
      },
      setTitle(details) {
        titleCalls.push(details);
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          listeners.messages.push(listener);
        }
      }
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback({});
        },
        set(_value, callback) {
          callback?.();
        }
      }
    },
    tabs: {
      sendMessage(_tabId, _message, callback) {
        callback(toggleResponses.shift());
      }
    }
  };

  await import(`../src/background/service-worker.js?case=${Date.now()}-badge`);

  listeners.clicked[0]({ id: 7 });
  listeners.clicked[0]({ id: 7 });

  assert.deepEqual(badgeTextCalls, [
    { tabId: 7, text: "ON" },
    { tabId: 7, text: "" }
  ]);
  assert.equal(badgeColorCalls[0].tabId, 7);
  assert.equal(badgeColorCalls[0].color, "#16a34a");
  assert.deepEqual(titleCalls, [
    { tabId: 7, title: "Style Inspector - monitoring" },
    { tabId: 7, title: "Style Inspector" }
  ]);

  delete globalThis.chrome;
});
