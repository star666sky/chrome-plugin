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

test("service worker increments page open count when opening a tracked page", async () => {
  const listeners = [];
  const openedTabs = [];
  let fileData = {
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          {
            id: "p1",
            title: "Docs",
            url: "https://example.com/docs",
            domain: "example.com",
            openCount: 2
          }
        ]
      }
    ]
  };

  globalThis.indexedDB = createIndexedDbStub({
    name: "group.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return JSON.stringify(fileData);
        }
      };
    },
    async createWritable() {
      return {
        async write(text) {
          fileData = JSON.parse(text);
        },
        async close() {}
      };
    }
  });
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
      async create(tab) {
        openedTabs.push(tab);
      }
    }
  };

  await import(`../src/background/service-worker.js?test=${Date.now()}-open-count`);
  const messageListener = listeners.find(([name]) => name === "message")[1];
  const response = await new Promise((resolve) => {
    messageListener(
      {
        type: "GROUP_OPEN_PAGE",
        payload: { pageId: "p1", url: "https://example.com/docs" }
      },
      {},
      resolve
    );
  });

  assert.equal(response.ok, true);
  assert.equal(openedTabs[0].url, "https://example.com/docs");
  assert.equal(fileData.groups[0].pages[0].openCount, 3);
});

test("service worker renames and deletes tracked pages", async () => {
  const listeners = [];
  let fileData = {
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          {
            id: "p1",
            title: "Docs",
            url: "https://example.com/docs",
            domain: "example.com"
          },
          {
            id: "p2",
            title: "Runs",
            url: "https://example.com/runs",
            domain: "example.com"
          }
        ]
      },
      {
        id: "g2",
        name: "Later",
        pages: []
      }
    ]
  };

  globalThis.indexedDB = createIndexedDbStub({
    name: "group.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return JSON.stringify(fileData);
        }
      };
    },
    async createWritable() {
      return {
        async write(text) {
          fileData = JSON.parse(text);
        },
        async close() {}
      };
    }
  });
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

  await import(`../src/background/service-worker.js?test=${Date.now()}-delete`);
  const messageListener = listeners.find(([name]) => name === "message")[1];
  const renamePageResponse = await new Promise((resolve) => {
    messageListener(
      {
        type: "GROUP_RENAME_PAGE",
        payload: { pageId: "p1", name: "Renamed Docs" }
      },
      {},
      resolve
    );
  });

  assert.equal(renamePageResponse.ok, true);
  assert.equal(fileData.groups[0].pages[0].name, "Renamed Docs");
  assert.equal(fileData.groups[0].pages[0].title, "Docs");

  const deletePageResponse = await new Promise((resolve) => {
    messageListener(
      {
        type: "GROUP_DELETE_PAGE",
        payload: { pageId: "p1" }
      },
      {},
      resolve
    );
  });

  assert.equal(deletePageResponse.ok, true);
  assert.deepEqual(fileData.groups[0].pages.map((page) => page.id), ["p2"]);
});

function createIndexedDbStub(handle) {
  const storeValues = new Map([["group-json", handle]]);
  return {
    open() {
      const request = {};
      const db = {
        objectStoreNames: {
          contains() {
            return true;
          }
        },
        createObjectStore() {},
        transaction() {
          return {
            objectStore() {
              return {
                get(key) {
                  return asyncRequest(storeValues.get(key));
                },
                put(value, key) {
                  storeValues.set(key, value);
                  return asyncRequest(value);
                },
                delete(key) {
                  storeValues.delete(key);
                  return asyncRequest(undefined);
                }
              };
            }
          };
        }
      };
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    }
  };
}

function asyncRequest(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.();
  });
  return request;
}
