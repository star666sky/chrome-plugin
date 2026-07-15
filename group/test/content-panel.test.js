import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("content panel closes when pointer down happens outside the extension root", async () => {
  const { context, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);
  assert.equal(document.elements[".group-panel"].hidden, false);

  document.dispatch("pointerdown", {
    target: new ElementStub(),
    composedPath: () => []
  });
  await delay(0);

  assert.equal(document.elements[".group-panel"].hidden, true);
});

test("content panel shows the search tree by default when opened", async () => {
  const { context, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);

  assert.equal(document.elements[".group-preview"].hidden, false);
  assert.equal(document.elements[".group-preview-button"].textContent, "收起");
  assert.equal(document.elements[".group-tree"].children.length, 1);
});

test("content panel renders groups as tree branches", async () => {
  const { context, document } = createContentContext();

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);

  const [groupNode] = document.elements[".group-tree"].children;
  assert.equal(groupNode.className, "group-node group-node-collapsed");
  assert.match(groupNode.innerHTML, /aria-expanded="false"/);
  assert.match(groupNode.innerHTML, /group-node-main/);
  assert.match(groupNode.innerHTML, /group-branch-line/);
  assert.match(groupNode.innerHTML, /group-page-link/);
  assert.doesNotMatch(groupNode.innerHTML, /group-remove-group/);
  assert.match(groupNode.innerHTML, /group-rename-page/);
  assert.match(groupNode.innerHTML, /group-remove-page/);
});

test("content tree quick page actions remove and rename pages", async () => {
  const deletedPages = [];
  const renamedPages = [];
  const { context, document } = createContentContext({
    groups: [
      {
        id: "work",
        name: "Work",
        pages: [
          { id: "p1", name: "Saved Docs", title: "Browser Docs", domain: "example.com", url: "https://example.com/docs" },
          { id: "p2", title: "Runs", domain: "example.com", url: "https://example.com/runs" }
        ]
      }
    ],
    prompt() {
      return "Renamed Docs";
    },
    onDeletePage(pageId) {
      deletedPages.push(pageId);
    },
    onRenamePage(pageId, name) {
      renamedPages.push({ pageId, name });
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);

  assert.match(document.elements[".group-tree"].children[0].innerHTML, /Saved Docs/);
  assert.doesNotMatch(document.elements[".group-tree"].children[0].innerHTML, /Browser Docs/);
  assert.match(document.elements[".group-tree"].children[0].innerHTML, /title="https:\/\/example.com\/docs"/);
  assert.doesNotMatch(document.elements[".group-tree"].children[0].innerHTML, /group-page-domain/);
  assert.doesNotMatch(document.elements[".group-tree"].children[0].innerHTML, /group-remove-group/);

  const renamePageButton = new ElementStub();
  renamePageButton.dataset.pageId = "p1";
  renamePageButton.dataset.pageName = "Saved Docs";
  renamePageButton.parentNode = document.elements[".group-tree"];
  renamePageButton.closest = (selector) => selector === ".group-rename-page" ? renamePageButton : null;
  document.elements[".group-tree"].dispatch("click", {
    target: renamePageButton,
    stopPropagation() {}
  });
  await delay(0);

  assert.deepEqual(renamedPages, [{ pageId: "p1", name: "Renamed Docs" }]);
  assert.match(document.elements[".group-tree"].children[0].innerHTML, /Renamed Docs/);

  const removePageButton = new ElementStub();
  removePageButton.dataset.pageId = "p1";
  removePageButton.parentNode = document.elements[".group-tree"];
  removePageButton.closest = (selector) => selector === ".group-remove-page" ? removePageButton : null;
  document.elements[".group-tree"].dispatch("click", {
    target: removePageButton,
    stopPropagation() {}
  });
  await delay(0);

  assert.deepEqual(deletedPages, ["p1"]);
  assert.doesNotMatch(document.elements[".group-tree"].children[0].innerHTML, /Renamed Docs/);
  assert.match(document.elements[".group-tree"].children[0].innerHTML, /Runs/);
});

test("content panel renders quick access below search", async () => {
  const { context, document } = createContentContext({
    groups: [
      {
        id: "work",
        name: "Work",
        pages: [
          { id: "p1", name: "Frequent Name", title: "Frequent Title", domain: "example.com", url: "https://example.com/frequent", openCount: 4 },
          { id: "p2", title: "Pinned", domain: "example.com", url: "https://example.com/pinned", quickAccessPinned: true }
        ]
      }
    ]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);

  assert.match(document.elements[".group-quick-access"].innerHTML, /group-quick-access-item/);
  assert.match(document.elements[".group-quick-access"].innerHTML, /Frequent Name/);
  assert.doesNotMatch(document.elements[".group-quick-access"].innerHTML, /Frequent Title/);
  assert.match(document.elements[".group-quick-access"].innerHTML, /title="https:\/\/example.com\/frequent"/);
  assert.doesNotMatch(document.elements[".group-quick-access"].innerHTML, /group-quick-head/);
  assert.doesNotMatch(document.elements[".group-quick-access"].innerHTML, /group-quick-meta/);
  assert.doesNotMatch(document.elements[".group-quick-access"].innerHTML, /按打开次数/);
  assert.match(document.elements[".group-tree"].children[0].innerHTML, /group-pin-page/);
});

test("content panel shows and applies the scoped group picker", async () => {
  const { context, document } = createContentContext({
    groups: [
      {
        id: "work",
        name: "Work",
        pages: [{ id: "p1", title: "Docs", domain: "example.com", url: "https://example.com/docs" }]
      },
      {
        id: "auto",
        name: "Automation",
        pages: [{ id: "p2", title: "Runs", domain: "example.com", url: "https://example.com/runs" }]
      }
    ]
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);

  const groupInput = document.elements[".group-group-input"];
  const groupMenu = document.elements[".group-group-menu"];
  assert.equal(groupMenu.hidden, true);
  assert.equal(groupInput.getAttribute("aria-expanded"), "false");
  assert.equal(groupMenu.innerHTML, "");

  groupInput.dispatch("pointerdown", {});
  assert.equal(groupMenu.hidden, false);
  assert.equal(groupInput.getAttribute("aria-expanded"), "true");
  assert.match(groupMenu.innerHTML, /Work/);
  assert.match(groupMenu.innerHTML, /Automation/);

  groupInput.value = "Auto";
  groupInput.dispatch("input", {});
  assert.doesNotMatch(groupMenu.innerHTML, /Work/);
  assert.match(groupMenu.innerHTML, /Automation/);

  const option = new ElementStub();
  option.dataset.groupName = "Automation";
  option.parentNode = groupMenu;
  option.closest = (selector) => selector === ".group-group-option" ? option : null;
  groupMenu.dispatch("click", { target: option });

  assert.equal(groupInput.value, "Automation");
  assert.equal(groupMenu.hidden, true);
  assert.equal(groupInput.getAttribute("aria-expanded"), "false");
});

test("content panel does not show recent group beside the ball", async () => {
  const { context, document } = createContentContext({
    settings: {
      showRecentGroupName: true,
      recentGroupName: "Work"
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".group-recent-label"].textContent, "");
});

test("content panel suppresses success toasts", async () => {
  const { context, document } = createContentContext({
    onSaveCurrentPage() {
      return {
        ok: true,
        status: "saved",
        group: { id: "default", name: "Default" },
        page: { id: "page" },
        data: { version: 1, groups: [] }
      };
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);
  document.elements[".group-save-button"].dispatch("click", {});
  await delay(0);

  assert.equal(document.elements[".group-toast"].hidden, true);
  assert.equal(document.elements[".group-toast"].textContent, "");
});

test("content panel search opens the first matching group with Enter", async () => {
  const opened = [];
  const { context, document } = createContentContext({
    groups: [
      {
        id: "auto",
        name: "自动化",
        pages: [{ id: "p1", title: "树选择器", domain: "fine.design", url: "https://fine.design/tree" }]
      },
      {
        id: "manual",
        name: "手动测试",
        pages: [{ id: "p2", title: "Checklist", domain: "example.com", url: "https://example.com/check" }]
      }
    ],
    onOpenGroup(groupId) {
      opened.push(groupId);
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-ball"].dispatch("click", {});
  await delay(0);
  document.elements[".group-preview-button"].dispatch("click", {});
  document.elements[".group-search-input"].value = "自动";
  document.elements[".group-search-input"].dispatch("input", {});
  document.elements[".group-search-input"].dispatch("keydown", {
    key: "Enter",
    preventDefault() {}
  });
  await delay(0);

  assert.deepEqual(opened, ["auto"]);
});

test("content script persists snapped ball position after dragging", async () => {
  const settingsPatches = [];
  const { context, document } = createContentContext({
    onUpdateSettings(patch) {
      settingsPatches.push(patch);
    }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  document.elements[".group-shell"].rect = { left: 1100, top: 240, width: 44, height: 44 };
  document.elements[".group-ball"].dispatch("pointerdown", {
    clientX: 1100,
    clientY: 240,
    pointerId: 1
  });
  document.elements[".group-ball"].dispatch("pointermove", {
    clientX: 1110,
    clientY: 260
  });
  document.elements[".group-shell"].rect = { left: 1110, top: 260, width: 44, height: 44 };
  document.elements[".group-ball"].dispatch("pointerup", { pointerId: 1 });
  await delay(0);

  assert.equal(JSON.stringify(settingsPatches), JSON.stringify([{ ballPosition: { side: "right", top: 260 } }]));
});

test("content script restores saved ball position on a new page", async () => {
  const { context, document } = createContentContext({
    settings: { ballPosition: { side: "left", top: 180 } }
  });

  vm.runInNewContext(readFileSync("src/content/content.js", "utf8"), context, {
    filename: "src/content/content.js"
  });
  await delay(0);

  assert.equal(document.elements[".group-shell"].dataset.side, "left");
  assert.equal(document.elements[".group-shell"].style.top, "180px");
  assert.equal(document.elements[".group-shell"].style.left, "12px");
  assert.equal(document.elements[".group-shell"].style.right, "auto");
});

function createContentContext(options = {}) {
  const document = createDocumentStub();
  let groups = options.groups || [
    {
      id: "default",
      name: "默认",
      pages: [{ id: "page", title: "Example", domain: "example.com", url: "https://example.com" }]
    }
  ];

  const context = {
    chrome: {
      runtime: {
        sendMessage(message, callback) {
          if (message.type === "GROUP_GET_STATE") {
            callback({
              ok: true,
              bound: true,
              data: { version: 1, groups },
              settings: options.settings || {}
            });
            return;
          }
          if (message.type === "GROUP_GET_PAGE_DRAFT") {
            callback({
              ok: true,
              draft: { title: "Example Page", url: "https://example.com/page" }
            });
            return;
          }
          if (message.type === "GROUP_OPEN_GROUP") {
            options.onOpenGroup?.(message.payload.groupId);
            callback({ ok: true, opened: 1 });
            return;
          }
          if (message.type === "GROUP_SAVE_CURRENT_PAGE") {
            callback(options.onSaveCurrentPage?.(message.payload) || { ok: true });
            return;
          }
          if (message.type === "GROUP_UPDATE_SETTINGS") {
            options.onUpdateSettings?.(message.payload);
            callback({ ok: true, settings: message.payload });
            return;
          }
          if (message.type === "GROUP_DELETE_PAGE") {
            const pageId = message.payload.pageId;
            options.onDeletePage?.(pageId);
            groups = groups.map((group) => ({
              ...group,
              pages: group.pages.filter((page) => page.id !== pageId)
            }));
            callback({ ok: true, data: { version: 1, groups } });
            return;
          }
          if (message.type === "GROUP_RENAME_PAGE") {
            const { pageId, name } = message.payload;
            options.onRenamePage?.(pageId, name);
            groups = groups.map((group) => ({
              ...group,
              pages: group.pages.map((page) => page.id === pageId ? { ...page, name } : page)
            }));
            callback({ ok: true, data: { version: 1, groups } });
            return;
          }
          callback({ ok: true });
        },
        lastError: null
      }
    },
    document,
    globalThis: null,
    location: { href: "https://example.com/page", hostname: "example.com" },
    window: {
      innerHeight: 800,
      innerWidth: 1200,
      addEventListener() {},
      confirm: options.confirm || (() => true),
      prompt: options.prompt || (() => ""),
      clearTimeout,
      setTimeout
    },
    console,
    Promise,
    String,
    Array,
    Boolean,
    Math,
    Object,
    Error,
    RegExp
  };
  context.globalThis = context;

  return { context, document };
}

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
      ".group-group-menu",
      ".group-page-input",
      ".group-save-button",
      ".group-preview-button",
      ".group-manage-button",
      ".group-open-options",
      ".group-preview",
      ".group-search-input",
      ".group-quick-access",
      ".group-tree",
      ".group-toast",
      ".group-recent-label",
      ".group-setup-title",
      ".group-setup-copy"
    ].map((selector) => [selector, new ElementStub()])
  );
  elements[".group-setup"].querySelector = (selector) => elements[selector];
  elements[".group-group-menu"].hidden = true;
  elements[".group-toast"].hidden = true;

  const listeners = {};
  return {
    title: "Example Page",
    elements,
    documentElement: {
      appendChild(node) {
        node.parentNode = this;
      }
    },
    addEventListener(type, listener) {
      listeners[type] ||= [];
      listeners[type].push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners[type] || []) {
        listener(event);
      }
    },
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
    this.attributes = {};
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
    this.children = [];
    this.rect = { left: 0, top: 0, width: 44, height: 44 };
  }

  set innerHTML(_value) {
    this.innerHTMLValue = _value;
    this.children = [];
  }

  get innerHTML() {
    return this.innerHTMLValue || "";
  }

  querySelector(selector) {
    return this.elements[selector] || new ElementStub();
  }

  contains(target) {
    for (let node = target; node; node = node.parentNode) {
      if (node === this) return true;
    }
    return Object.values(this.elements).includes(target);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    this.listeners[type] ||= [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== listener);
  }

  appendChild(child) {
    this.children.push(child);
  }

  focus() {
    this.dispatch("focus", { target: this });
  }

  select() {}

  setPointerCapture() {}

  releasePointerCapture() {}

  dispatch(type, event = {}) {
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
