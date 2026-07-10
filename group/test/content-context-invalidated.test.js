import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("content script handles extension context invalidation from Enter save", async () => {
  const document = createDocumentStub();
  let calls = 0;
  const context = {
    chrome: {
      runtime: {
        sendMessage(_message, callback) {
          calls += 1;
          if (calls === 1) {
            callback({
              ok: true,
              bound: true,
              data: { version: 1, groups: [] },
              settings: {}
            });
            return;
          }
          throw new Error("Extension context invalidated.");
        },
        lastError: null
      }
    },
    document,
    location: { href: "https://example.com/page", hostname: "example.com" },
    window: {
      innerHeight: 800,
      innerWidth: 1200,
      addEventListener() {},
      clearTimeout,
      setTimeout
    },
    console,
    Promise,
    String,
    Array,
    Boolean,
    Math,
    Object
  };

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  const unhandled = waitForUnhandledRejection();
  document.elements[".group-page-input"].dispatch("keydown", {
    key: "Enter",
    preventDefault() {}
  });
  const error = await Promise.race([unhandled, delay(30).then(() => null)]);

  assert.equal(calls, 2);
  assert.equal(error, null);
});

function createDocumentStub() {
  const elements = Object.fromEntries(
    [
      ".group-shell",
      ".group-ball",
      ".group-panel",
      ".group-setup",
      ".group-save-view",
      ".group-group-input",
      "#group-options",
      ".group-page-input",
      ".group-save-button",
      ".group-preview-button",
      ".group-manage-button",
      ".group-open-options",
      ".group-preview",
      ".group-search-input",
      ".group-tree",
      ".group-toast",
      ".group-recent-label",
      ".group-setup-title",
      ".group-setup-copy"
    ].map((selector) => [selector, new ElementStub()])
  );
  elements[".group-setup"].querySelector = (selector) => elements[selector];

  return {
    title: "Example Page",
    elements,
    documentElement: {
      appendChild(node) {
        node.parentNode = this;
      }
    },
    addEventListener() {},
    getElementById() {
      return null;
    },
    createElement(tagName) {
      return new ElementStub(tagName, elements);
    }
  };
}

class ElementStub {
  constructor(_tagName = "div", elements = {}) {
    this.dataset = {};
    this.hidden = false;
    this.listeners = {};
    this.style = {
      setProperty() {}
    };
    this.classList = {
      add() {},
      remove() {},
      toggle() {}
    };
    this.value = "";
    this.textContent = "";
    this.elements = elements;
  }

  set innerHTML(_value) {}

  querySelector(selector) {
    return this.elements[selector] || new ElementStub();
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  appendChild() {}

  focus() {}

  select() {}

  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 44, height: 44 };
  }
}

function waitForUnhandledRejection() {
  return new Promise((resolve) => {
    process.once("unhandledRejection", resolve);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
