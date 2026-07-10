import test from "node:test";
import assert from "node:assert/strict";
import { ensureFilePermission, readGroupData } from "../src/shared/file-store.js";

test("ensureFilePermission does not request permission without user activation", async () => {
  let requested = false;
  const handle = {
    async queryPermission() {
      return "prompt";
    },
    async requestPermission() {
      requested = true;
      return "granted";
    }
  };

  const result = await ensureFilePermission(handle, "readwrite");

  assert.equal(result.ok, false);
  assert.equal(result.reason, "permission_denied");
  assert.equal(result.message, "需要在设置页授权 JSON 文件读写");
  assert.equal(requested, false);
});

test("ensureFilePermission can request permission when explicitly allowed", async () => {
  let requested = false;
  const handle = {
    async queryPermission() {
      return "prompt";
    },
    async requestPermission() {
      requested = true;
      return "granted";
    }
  };

  const result = await ensureFilePermission(handle, "readwrite", { allowRequest: true });

  assert.equal(result.ok, true);
  assert.equal(requested, true);
});

test("readGroupData reports authorization needed when a granted handle is rejected", async () => {
  const originalIndexedDB = globalThis.indexedDB;
  const handle = {
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      throw Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    }
  };
  globalThis.indexedDB = createIndexedDBWithHandle(handle);

  try {
    const result = await readGroupData();

    assert.equal(result.ok, false);
    assert.equal(result.reason, "permission_denied");
    assert.equal(result.message, "需要在设置页授权 JSON 文件读写");
  } finally {
    globalThis.indexedDB = originalIndexedDB;
  }
});

function createIndexedDBWithHandle(handle) {
  return {
    open() {
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction() {
          return {
            objectStore() {
              return {
                get() {
                  const getRequest = {};
                  queueMicrotask(() => {
                    getRequest.result = handle;
                    getRequest.onsuccess?.();
                  });
                  return getRequest;
                }
              };
            }
          };
        }
      };

      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}
