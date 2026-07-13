import {
  deleteGroup,
  deletePage,
  normalizeData,
  renameGroup,
  renamePage,
  searchTree
} from "../shared/domain.js";
import {
  createJsonFile,
  getFileStatus,
  pickExistingJsonFile,
  readGroupData,
  requestStoredFilePermission,
  saveAsJsonFile,
  writeGroupData
} from "../shared/file-store.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
import { loadSettings, saveSettings } from "../shared/settings.js";

const app = document.getElementById("app");
const state = {
  activeTab: "manage",
  query: "",
  selectedGroupId: "",
  data: { version: 1, groups: [] },
  settings: {},
  fileStatus: { bound: false, fileName: "", boundAt: "", permission: "missing" },
  notice: ""
};

app.addEventListener("click", (event) => {
  handleClick(event).catch(showRuntimeError);
});
app.addEventListener("input", handleInput);
app.addEventListener("change", (event) => {
  handleChange(event).catch(showRuntimeError);
});
window.addEventListener("error", (event) => {
  state.notice = event.message || "设置页发生错误";
  render();
});
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  showRuntimeError(event.reason);
});

loadAll().catch(showRuntimeError);

async function loadAll(options = {}) {
  const previousNotice = state.notice;
  state.fileStatus = await getFileStatus();
  state.settings = await loadSettings();
  const readResult = await readGroupData();
  if (readResult.ok) {
    state.data = normalizeData(readResult.data);
    state.notice = options.preserveNotice ? previousNotice : "";
  } else {
    state.data = { version: 1, groups: [] };
    state.notice = options.preserveNotice && previousNotice ? previousNotice : readResult.message;
  }
  if (!state.selectedGroupId && state.data.groups[0]) {
    state.selectedGroupId = state.data.groups[0].id;
  }
  render();
}

function render() {
  applyTheme();
  app.innerHTML = `
    <header class="topbar">
      <div>
        <h1>group</h1>
        <p>${escapeHtml(fileStatusText())}</p>
      </div>
      <div class="topbar-actions">
        <button type="button" data-action="choose-file">选择 JSON</button>
        ${
          state.fileStatus.bound && state.fileStatus.permission !== "granted"
            ? `<button type="button" data-action="grant-permission">授权读写</button>`
            : ""
        }
        <button type="button" data-action="create-file">创建 JSON</button>
      </div>
    </header>

    ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ""}

    <nav class="tabs">
      <button type="button" data-tab="manage" class="${state.activeTab === "manage" ? "active" : ""}">管理</button>
      <button type="button" data-tab="settings" class="${state.activeTab === "settings" ? "active" : ""}">设置</button>
    </nav>

    ${state.activeTab === "manage" ? renderManage() : renderSettings()}
  `;
}

function showRuntimeError(error) {
  state.notice = error?.message || String(error || "操作失败");
  render();
}

function renderManage() {
  const groups = searchTree(state.data, state.query);
  const selected = state.data.groups.find((group) => group.id === state.selectedGroupId) || state.data.groups[0];
  const selectedPages = selected?.pages || [];

  return `
    <section class="toolbar">
      <input data-field="query" value="${escapeHtml(state.query)}" placeholder="搜索分组、页面或域名" />
      <button type="button" data-action="open-selected-group" ${selected ? "" : "disabled"}>打开分组</button>
    </section>

    <section class="manager">
      <aside class="group-list">
        ${groups.length ? groups.map(renderGroupButton).join("") : `<div class="empty">暂无分组</div>`}
      </aside>
      <section class="page-list">
        ${
          selected
            ? `
              <div class="section-head">
                <div>
                  <strong>${escapeHtml(selected.name)}</strong>
                  <span>${selected.pages.length} 个页面</span>
                </div>
                <div>
                  <button type="button" data-action="rename-group" data-group-id="${selected.id}">重命名</button>
                  <button type="button" data-action="delete-group" data-group-id="${selected.id}">删除</button>
                </div>
              </div>
              ${selectedPages.length ? selectedPages.map(renderPageRow).join("") : `<div class="empty">这个分组还没有页面</div>`}
            `
            : `<div class="empty">绑定 JSON 后开始保存页面</div>`
        }
      </section>
    </section>
  `;
}

function renderGroupButton(group) {
  return `
    <button type="button" data-action="select-group" data-group-id="${group.id}" class="group-item ${
      group.id === state.selectedGroupId ? "active" : ""
    }">
      <span>${escapeHtml(group.name)}</span>
      <small>${group.pages.length}</small>
    </button>
  `;
}

function renderPageRow(page) {
  const pageName = getPageDisplayName(page);
  return `
    <article class="page-row">
      <div>
        <strong>${escapeHtml(pageName)}</strong>
        <span>${escapeHtml(page.domain)}</span>
      </div>
      <div class="row-actions">
        <button type="button" data-action="open-page" data-url="${escapeHtml(page.url)}">打开</button>
        <button type="button" data-action="rename-page" data-page-id="${page.id}">重命名</button>
        <button type="button" data-action="delete-page" data-page-id="${page.id}">删除</button>
      </div>
    </article>
  `;
}

function renderSettings() {
  return `
    <section class="settings-grid">
      <section class="settings-card">
        <h2>JSON 文件</h2>
        <p>${escapeHtml(fileStatusText())}</p>
        <div class="button-row">
          <button type="button" data-action="choose-file">重新选择</button>
          <button type="button" data-action="grant-permission" ${state.fileStatus.bound ? "" : "disabled"}>授权读写</button>
          <button type="button" data-action="create-file">创建新文件</button>
          <button type="button" data-action="save-as-file" ${state.fileStatus.bound ? "" : "disabled"}>迁移/另存</button>
        </div>
      </section>

      <section class="settings-card">
        <h2>外观</h2>
        <label>
          <span>主题</span>
          <select data-setting="themeMode">
            <option value="system" ${selected("themeMode", "system")}>跟随系统</option>
            <option value="light" ${selected("themeMode", "light")}>浅色</option>
            <option value="dark" ${selected("themeMode", "dark")}>深色</option>
          </select>
        </label>
        <label>
          <span>主题色</span>
          <input type="color" data-setting="accentColor" value="${escapeHtml(state.settings.accentColor || "#3b82f6")}" />
        </label>
      </section>

      <section class="settings-card">
        <h2>小球</h2>
        ${rangeSetting("ballSize", "尺寸", 32, 72, 1)}
        ${rangeSetting("ballOpacity", "透明度", 0.25, 1, 0.01)}
        ${rangeSetting("edgeOffset", "吸附边距", 0, 36, 1)}
        <label class="check-row">
          <input type="checkbox" data-setting="edgeHide" ${state.settings.edgeHide !== false ? "checked" : ""} />
          <span>贴边隐藏</span>
        </label>
      </section>
    </section>
  `;
}

function rangeSetting(key, label, min, max, step) {
  const value = state.settings[key];
  return `
    <label>
      <span>${label}: ${escapeHtml(String(value))}</span>
      <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${escapeHtml(String(value))}" />
    </label>
  `;
}

async function handleClick(event) {
  const target = event.target.closest("button");
  if (!target) return;

  const tab = target.dataset.tab;
  if (tab) {
    state.activeTab = tab;
    render();
    return;
  }

  const action = target.dataset.action;
  if (!action) return;

  if (action === "choose-file") await chooseFile();
  if (action === "grant-permission") await grantPermission();
  if (action === "create-file") await createFile();
  if (action === "save-as-file") await saveAsFile();
  if (action === "select-group") selectGroup(target.dataset.groupId);
  if (action === "rename-group") await renameSelectedGroup(target.dataset.groupId);
  if (action === "delete-group") await deleteSelectedGroup(target.dataset.groupId);
  if (action === "rename-page") await renameSelectedPage(target.dataset.pageId);
  if (action === "delete-page") await deleteSelectedPage(target.dataset.pageId);
  if (action === "open-page") await sendMessage({ type: MESSAGE_TYPES.OPEN_PAGE, payload: { url: target.dataset.url } });
  if (action === "open-selected-group") await openSelectedGroup();
}

function handleInput(event) {
  if (event.target.dataset.field === "query") {
    state.query = event.target.value;
    render();
  }
}

async function handleChange(event) {
  const key = event.target.dataset.setting;
  if (!key) return;

  const value = event.target.type === "checkbox"
    ? event.target.checked
    : event.target.type === "range"
      ? Number(event.target.value)
      : event.target.value;
  state.settings = await saveSettings({ [key]: value });
  render();
}

async function chooseFile() {
  const result = await pickExistingJsonFile();
  state.notice = result.ok ? "已绑定 JSON 文件并获得读写权限" : result.message;
  await loadAll({ preserveNotice: true });
}

async function grantPermission() {
  const result = await requestStoredFilePermission("readwrite");
  state.notice = result.ok ? "已授权 JSON 文件读写" : result.message;
  await loadAll({ preserveNotice: true });
}

async function createFile() {
  const result = await createJsonFile();
  state.notice = result.ok ? "已创建 JSON 文件并获得读写权限" : result.message;
  await loadAll({ preserveNotice: true });
}

async function saveAsFile() {
  const result = await saveAsJsonFile(state.data);
  state.notice = result.ok ? "已迁移到新的 JSON 文件" : result.message;
  await loadAll({ preserveNotice: true });
}

function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  render();
}

async function renameSelectedGroup(groupId) {
  const group = state.data.groups.find((item) => item.id === groupId);
  const name = prompt("新的分组名", group?.name || "");
  if (!name) return;
  state.data = renameGroup(state.data, groupId, name);
  await persistData("分组已重命名");
}

async function deleteSelectedGroup(groupId) {
  const group = state.data.groups.find((item) => item.id === groupId);
  if (!group || !confirm(`删除「${group.name}」及其中所有页面？`)) return;
  state.data = deleteGroup(state.data, groupId);
  state.selectedGroupId = state.data.groups[0]?.id || "";
  await persistData("分组已删除");
}

async function renameSelectedPage(pageId) {
  const page = state.data.groups.flatMap((group) => group.pages).find((item) => item.id === pageId);
  const title = prompt("新的页面名", getPageDisplayName(page));
  if (!title) return;
  state.data = renamePage(state.data, pageId, title);
  await persistData("页面已重命名");
}

async function deleteSelectedPage(pageId) {
  const page = state.data.groups.flatMap((group) => group.pages).find((item) => item.id === pageId);
  if (!page || !confirm(`删除「${getPageDisplayName(page)}」？`)) return;
  state.data = deletePage(state.data, pageId);
  await persistData("页面已删除");
}

async function openSelectedGroup() {
  const groupId = state.selectedGroupId || state.data.groups[0]?.id;
  if (!groupId) return;
  await sendMessage({ type: MESSAGE_TYPES.OPEN_GROUP, payload: { groupId } });
}

async function persistData(message) {
  const result = await writeGroupData(state.data);
  state.notice = result.ok ? message : result.message;
  await loadAll();
}

function selected(key, value) {
  return state.settings[key] === value ? "selected" : "";
}

function fileStatusText() {
  if (!state.fileStatus.bound) return "未绑定 JSON 文件";
  const permissionText = state.fileStatus.permission === "granted" ? "已授权" : "需要授权";
  return `已绑定：${state.fileStatus.fileName || "group.json"} · ${permissionText}`;
}

function getPageDisplayName(page) {
  return page?.name || page?.title || page?.url || "";
}

function applyTheme() {
  document.body.dataset.theme = state.settings.themeMode || "system";
  document.body.style.setProperty("--accent", state.settings.accentColor || "#3b82f6");
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { ok: false, message: chrome.runtime.lastError?.message || "操作失败" });
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
