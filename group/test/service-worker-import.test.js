import test from "node:test";
import assert from "node:assert/strict";

test("service worker module registers Chrome listeners without throwing", async () => {
  const listeners = [];
  globalThis.chrome = {
    runtime: {
      onInstalled: {
        addListener(listener) {
          listeners.push(["installed", listener]);
        }
      },
      onMessage: {
        addListener(listener) {
          listeners.push(["message", listener]);
        }
      },
      openOptionsPage() {},
      lastError: null
    },
    action: {
      onClicked: {
        addListener(listener) {
          listeners.push(["action", listener]);
        }
      }
    },
    storage: {
      local: {
        set(_value, callback) {
          callback?.();
        },
        get(_key, callback) {
          callback({});
        }
      }
    },
    tabs: {
      async create() {}
    }
  };

  await import(`../src/background/service-worker.js?test=${Date.now()}`);

  assert.deepEqual(
    listeners.map(([name]) => name),
    ["installed", "action", "message"]
  );
});
