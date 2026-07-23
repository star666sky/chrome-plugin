import test from "node:test";
import assert from "node:assert/strict";

test("extension location stores normalized group data in chrome storage", async () => {
  const chromeStub = createChromeStorage({
    groupDataLocation: { mode: "extension" }
  });
  globalThis.chrome = chromeStub.chrome;

  const store = await import(`../src/shared/data-store.js?test=${Date.now()}-extension`);
  const initialRead = await store.readGroupData();

  assert.equal(initialRead.ok, true);
  assert.deepEqual(initialRead.data, { version: 1, groups: [] });

  const writeResult = await store.writeGroupData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [{ id: "p1", name: "Docs", url: "https://example.com/docs" }]
      }
    ]
  });

  assert.equal(writeResult.ok, true);
  assert.equal(chromeStub.storage.groupExtensionData.groups[0].pages[0].domain, "example.com");

  const nextRead = await store.readGroupData();
  assert.equal(nextRead.data.groups[0].pages[0].name, "Docs");
});

test("public URL location reads and writes JSON through GET and PUT", async () => {
  const publicUrl = "https://claire-storage.oss-cn-hangzhou.aliyuncs.com/files/group.json";
  const calls = [];
  globalThis.chrome = createChromeStorage({
    groupDataLocation: { mode: "publicUrl", publicUrl }
  }).chrome;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if ((options.method || "GET").toUpperCase() === "PUT") {
      return { ok: true, status: 200, async text() { return ""; } };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          version: 1,
          groups: [{ id: "g1", name: "Work", pages: [{ id: "p1", name: "Docs", url: "https://example.com/docs" }] }]
        });
      }
    };
  };

  const store = await import(`../src/shared/data-store.js?test=${Date.now()}-public-url`);
  const readResult = await store.readGroupData();
  const writeResult = await store.writeGroupData(readResult.data);

  assert.equal(readResult.ok, true);
  assert.equal(readResult.data.groups[0].pages[0].domain, "example.com");
  assert.equal(writeResult.ok, true);
  assert.equal(calls[0].url, publicUrl);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[1].url, publicUrl);
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(calls[1].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[1].options.body), readResult.data);
});

test("default data location config exposes public URL without OSS credentials", async () => {
  globalThis.chrome = createChromeStorage().chrome;

  const { getDefaultDataLocationConfig } = await import(`../src/shared/data-store.js?test=${Date.now()}-config`);
  const config = await getDefaultDataLocationConfig();

  assert.equal(config.publicUrl.url, "https://claire-storage.oss-cn-hangzhou.aliyuncs.com/files/group.json");
  assert.equal(JSON.stringify(config).includes("ACCESS_KEY"), false);
  assert.equal(JSON.stringify(config).includes("SECRET"), false);
});

test("local file creation uses picker defaults from data location config", async () => {
  let pickerOptions = null;
  globalThis.chrome = createChromeStorage().chrome;
  globalThis.indexedDB = createIndexedDbStub();
  globalThis.showSaveFilePicker = async (options) => {
    pickerOptions = options;
    return {
      name: "group.json",
      async queryPermission() {
        return "granted";
      },
      async createWritable() {
        return {
          async write() {},
          async close() {}
        };
      }
    };
  };

  const { createJsonFile } = await import(`../src/shared/data-store.js?test=${Date.now()}-local-config`);
  const result = await createJsonFile();

  assert.equal(result.ok, true);
  assert.equal(pickerOptions.suggestedName, "group.json");
  assert.equal(pickerOptions.id, "group-json");
  assert.equal(pickerOptions.startIn, "documents");
});

function createChromeStorage(initial = {}) {
  const storage = { ...initial };
  return {
    storage,
    chrome: {
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
    }
  };
}

function createIndexedDbStub() {
  const storeValues = new Map();
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
