import test from "node:test";
import assert from "node:assert/strict";

test("options manage page reorders groups, reorders pages, and moves pages", async () => {
  const app = new AppStub();
  let fileData = {
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          { id: "p1", title: "Docs", url: "https://example.com/docs", domain: "example.com" },
          { id: "p2", title: "Runs", url: "https://example.com/runs", domain: "example.com" }
        ]
      },
      {
        id: "g2",
        name: "Tools",
        pages: [{ id: "p3", title: "Figma", url: "https://figma.com", domain: "figma.com" }]
      },
      { id: "g3", name: "Archive", pages: [] }
    ]
  };

  globalThis.document = createDocumentStub(app);
  globalThis.window = { addEventListener() {} };
  globalThis.prompt = () => "";
  globalThis.confirm = () => true;
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
  globalThis.chrome = createChromeStub();

  await import(`../src/options/options.js?test=${Date.now()}-manage`);
  await delay(0);
  await delay(0);

  const groupSource = createEventTarget({ dragKind: "group", groupId: "g1" });
  const groupTarget = createEventTarget({ dragKind: "group", groupId: "g3" }, { top: 40, height: 32 });
  app.dispatch("dragstart", { target: groupSource, dataTransfer: createDataTransfer() });
  app.dispatch("dragover", {
    target: groupTarget,
    clientY: 80,
    dataTransfer: createDataTransfer(),
    preventDefault() {}
  });
  assert.equal(groupTarget.classList.contains("group-drop-after"), true);
  app.dispatch("drop", {
    target: groupTarget,
    clientY: 80,
    dataTransfer: createDataTransfer(),
    preventDefault() {}
  });
  await delay(0);
  await delay(0);
  assert.deepEqual(fileData.groups.map((group) => group.id), ["g2", "g3", "g1"]);
  assert.equal(groupTarget.classList.contains("group-drop-after"), false);

  const pageSource = createEventTarget({ dragKind: "page", groupId: "g1", pageId: "p1" });
  const pageTarget = createEventTarget({ dragKind: "page", groupId: "g1", pageId: "p2" }, { top: 40, height: 32 });
  app.dispatch("dragstart", { target: pageSource, dataTransfer: createDataTransfer() });
  app.dispatch("dragover", {
    target: pageTarget,
    clientY: 40,
    dataTransfer: createDataTransfer(),
    preventDefault() {}
  });
  assert.equal(pageTarget.classList.contains("group-drop-before"), true);
  app.dispatch("drop", {
    target: pageTarget,
    clientY: 80,
    dataTransfer: createDataTransfer(),
    preventDefault() {}
  });
  await delay(0);
  await delay(0);
  assert.deepEqual(fileData.groups[2].pages.map((page) => page.id), ["p2", "p1"]);
  assert.equal(pageTarget.classList.contains("group-drop-before"), false);

  const moveSelect = createEventTarget({ field: "move-page", pageId: "p1" });
  moveSelect.value = "g2";
  app.dispatch("change", { target: moveSelect });
  await delay(0);
  await delay(0);
  assert.deepEqual(fileData.groups[0].pages.map((page) => page.id), ["p3", "p1"]);
  assert.deepEqual(fileData.groups[2].pages.map((page) => page.id), ["p2"]);
});

class AppStub {
  constructor() {
    this.listeners = {};
    this.innerHTMLValue = "";
  }

  set innerHTML(value) {
    this.innerHTMLValue = value;
  }

  get innerHTML() {
    return this.innerHTMLValue;
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }
}

function createDocumentStub(app) {
  return {
    body: {
      dataset: {},
      style: {
        setProperty() {}
      }
    },
    getElementById(id) {
      return id === "app" ? app : null;
    }
  };
}

function createChromeStub() {
  const storage = {};
  return {
    runtime: {
      sendMessage(_message, callback) {
        callback?.({ ok: true });
      }
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] });
        },
        set(value, callback) {
          Object.assign(storage, value);
          callback?.();
        }
      }
    }
  };
}

function createEventTarget(dataset, rect = { top: 0, height: 32 }) {
  return {
    dataset,
    classList: createClassList(),
    closest(selector) {
      if (selector === "button" && dataset.action) return this;
      if (selector === "[data-drag-kind]" && dataset.dragKind) return this;
      return null;
    },
    getBoundingClientRect() {
      return rect;
    }
  };
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) {
      for (const name of names) values.add(name);
    },
    remove(...names) {
      for (const name of names) values.delete(name);
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function createDataTransfer() {
  return {
    effectAllowed: "",
    dropEffect: "",
    setData() {}
  };
}

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
