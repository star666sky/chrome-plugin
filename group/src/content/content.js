(() => {
  if (document.getElementById("group-extension-root")) return;

  const MESSAGE_TYPES = {
    GET_STATE: "GROUP_GET_STATE",
    GET_PAGE_DRAFT: "GROUP_GET_PAGE_DRAFT",
    SAVE_CURRENT_PAGE: "GROUP_SAVE_CURRENT_PAGE",
    OPEN_GROUP: "GROUP_OPEN_GROUP",
    OPEN_PAGE: "GROUP_OPEN_PAGE",
    OPEN_OPTIONS: "GROUP_OPEN_OPTIONS",
    SET_QUICK_ACCESS_PIN: "GROUP_SET_QUICK_ACCESS_PIN",
    DELETE_PAGE: "GROUP_DELETE_PAGE",
    RENAME_PAGE: "GROUP_RENAME_PAGE",
    UPDATE_SETTINGS: "GROUP_UPDATE_SETTINGS"
  };

  const state = {
    isOpen: false,
    isPreviewOpen: true,
    dragging: false,
    dragMoved: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    settings: {},
    data: { version: 1, groups: [] },
    fileBound: false,
    needsPermission: false,
    draft: null,
    groupMenuActiveIndex: -1,
    suppressNextGroupMenuFocus: false,
    expandedGroupIds: []
  };

  const root = document.createElement("div");
  root.id = "group-extension-root";
  root.innerHTML = `
    <div class="group-shell" data-side="right">
      <button class="group-ball" type="button" title="group" aria-label="group">
        <span class="group-ball-mark">g</span>
      </button>
      <span class="group-recent-label"></span>
      <section class="group-panel" hidden>
        <div class="group-setup" hidden>
          <strong class="group-setup-title">绑定 group.json</strong>
          <p class="group-setup-copy">先选择或创建一个 JSON 文件，之后页面会保存到这个本地文件里。</p>
          <button class="group-open-options" type="button">去设置</button>
        </div>
        <div class="group-save-view">
          <label>
            <span>分组</span>
            <div class="group-combobox">
              <input class="group-group-input" autocomplete="off" aria-autocomplete="list" aria-expanded="false" />
              <div class="group-group-menu" role="listbox" hidden></div>
            </div>
          </label>
          <label>
            <span>页面名</span>
            <input class="group-page-input" autocomplete="off" />
          </label>
          <div class="group-actions">
            <button class="group-save-button" type="button">保存</button>
            <button class="group-preview-button" type="button">搜索打开</button>
            <button class="group-manage-button" type="button">管理</button>
          </div>
        </div>
        <div class="group-preview" hidden>
          <input class="group-search-input" placeholder="搜索分组或页面，Enter 打开首个分组" autocomplete="off" />
          <div class="group-quick-access"></div>
          <div class="group-tree"></div>
        </div>
      </section>
      <div class="group-toast" hidden></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const shell = root.querySelector(".group-shell");
  const ball = root.querySelector(".group-ball");
  const panel = root.querySelector(".group-panel");
  const setupView = root.querySelector(".group-setup");
  const saveView = root.querySelector(".group-save-view");
  const groupInput = root.querySelector(".group-group-input");
  const pageInput = root.querySelector(".group-page-input");
  const groupMenu = root.querySelector(".group-group-menu");
  const saveButton = root.querySelector(".group-save-button");
  const previewButton = root.querySelector(".group-preview-button");
  const manageButton = root.querySelector(".group-manage-button");
  const openOptionsButton = root.querySelector(".group-open-options");
  const preview = root.querySelector(".group-preview");
  const searchInput = root.querySelector(".group-search-input");
  const quickAccess = root.querySelector(".group-quick-access");
  const tree = root.querySelector(".group-tree");
  const toast = root.querySelector(".group-toast");
  const recentLabel = root.querySelector(".group-recent-label");

  ball.addEventListener("click", () => {
    if (state.dragMoved) {
      state.dragMoved = false;
      return;
    }
    runSafely(togglePanel(!state.isOpen));
  });
  ball.addEventListener("pointerdown", startDrag);
  saveButton.addEventListener("click", () => runSafely(saveCurrentPage()));
  previewButton.addEventListener("click", () => togglePreview(!state.isPreviewOpen));
  manageButton.addEventListener("click", openOptions);
  openOptionsButton.addEventListener("click", openOptions);
  quickAccess.addEventListener("click", handlePageActionClick);
  tree.addEventListener("click", handleTreeClick);
  searchInput.addEventListener("input", () => renderTree(searchTree(state.data, searchInput.value)));
  searchInput.addEventListener("keydown", handleSearchKeydown);
  groupInput.addEventListener("focus", handleGroupInputFocus);
  groupInput.addEventListener("pointerdown", handleGroupInputPointerDown);
  groupInput.addEventListener("input", handleGroupInputInput);
  groupInput.addEventListener("keydown", handleGroupInputKeydown);
  groupMenu.addEventListener("mousedown", (event) => event.preventDefault());
  groupMenu.addEventListener("click", handleGroupMenuClick);
  pageInput.addEventListener("keydown", handleInputKeydown);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  shell.addEventListener("mouseenter", () => shell.classList.remove("group-edge-hidden"));
  shell.addEventListener("mouseleave", () => {
    if (!state.isOpen && state.settings.edgeHide === true) {
      shell.classList.add("group-edge-hidden");
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    showToast(event.reason?.message || "group 操作失败");
  });
  window.addEventListener("error", (event) => {
    showToast(event.message || "group 操作失败");
  });

  runSafely(refreshState(false));

  async function togglePanel(open) {
    state.isOpen = open;
    panel.hidden = !open;
    shell.classList.toggle("group-open", open);
    shell.classList.remove("group-edge-hidden");

    if (open) {
      await refreshState(true);
      if (state.fileBound) {
        state.suppressNextGroupMenuFocus = true;
        groupInput.focus();
        groupInput.select();
        hideGroupMenu();
      }
    } else {
      state.suppressNextGroupMenuFocus = false;
      hideGroupMenu();
      if (state.settings.edgeHide === true) {
        shell.classList.add("group-edge-hidden");
      }
    }
  }

  async function refreshState(includeDraft) {
    const response = await sendMessage({ type: MESSAGE_TYPES.GET_STATE });
    state.fileBound = Boolean(response?.bound && response?.ok);
    state.needsPermission = Boolean(response?.bound && response?.reason === "permission_denied");
    state.data = response?.data || { version: 1, groups: [] };
    state.settings = response?.settings || {};

    applySettings();
    renderGroupOptions();
    setSetupVisible(!state.fileBound);

    if (includeDraft && state.fileBound) {
      const draftResponse = await sendMessage({
        type: MESSAGE_TYPES.GET_PAGE_DRAFT,
        payload: {
          title: document.title,
          url: location.href
        }
      });
      state.draft = draftResponse?.draft || { title: document.title, url: location.href };
      groupInput.value = state.settings.recentGroupName || state.data.groups[0]?.name || "";
      pageInput.value = state.draft.title || document.title || location.hostname;
    }

    renderQuickAccess();
    renderTree(searchTree(state.data, searchInput.value));
  }

  function applySettings() {
    const settings = state.settings || {};
    shell.style.setProperty("--group-accent", settings.accentColor || "#3b82f6");
    shell.style.setProperty("--group-ball-size", `${settings.ballSize || 44}px`);
    shell.style.setProperty("--group-ball-opacity", String(settings.ballOpacity ?? 0.72));
    shell.style.setProperty("--group-edge-offset", `${settings.edgeOffset ?? 12}px`);
    shell.dataset.theme = settings.themeMode || "system";
    applySavedPosition(settings.ballPosition);
    recentLabel.textContent = "";
  }

  function applySavedPosition(position) {
    if (!position || !["left", "right"].includes(position.side)) return;
    const offset = state.settings.edgeOffset ?? 12;
    const top = clampTop(position.top);
    shell.dataset.side = position.side;
    shell.style.top = `${top}px`;
    shell.style.transform = "none";
    if (position.side === "left") {
      shell.style.left = `${offset}px`;
      shell.style.right = "auto";
    } else {
      shell.style.right = `${offset}px`;
      shell.style.left = "auto";
    }
  }

  function setSetupVisible(visible) {
    const title = setupView.querySelector(".group-setup-title");
    const copy = setupView.querySelector(".group-setup-copy");
    title.textContent = state.needsPermission ? "授权 JSON 读写" : "绑定 group.json";
    copy.textContent = state.needsPermission
      ? "已找到绑定文件，但 Chrome 需要你在设置页点击授权读写。"
      : "先选择或创建一个 JSON 文件，之后页面会保存到这个本地文件里。";
    setupView.hidden = !visible;
    saveView.hidden = visible;
    preview.hidden = visible || !state.isPreviewOpen;
    previewButton.textContent = state.isPreviewOpen ? "收起" : "搜索打开";
  }

  function renderGroupOptions() {
    if (!groupMenu.hidden) {
      renderGroupMenu({ showAll: true, resetActive: true });
    }
  }

  function renderGroupMenu(options = {}) {
    if (options.resetActive) {
      state.groupMenuActiveIndex = -1;
    }

    const names = getGroupMenuNames(options.showAll);
    if (!state.fileBound || !names.length) {
      hideGroupMenu();
      return;
    }

    if (state.groupMenuActiveIndex >= names.length) {
      state.groupMenuActiveIndex = -1;
    }

    groupMenu.innerHTML = names.map((name, index) => `
      <button class="group-group-option ${index === state.groupMenuActiveIndex ? "group-group-option-active" : ""}" type="button" role="option" data-group-name="${escapeAttribute(name)}" aria-selected="${index === state.groupMenuActiveIndex ? "true" : "false"}">
        ${escapeHtml(name)}
      </button>
    `).join("");
    groupMenu.hidden = false;
    groupInput.setAttribute("aria-expanded", "true");
  }

  function hideGroupMenu() {
    state.groupMenuActiveIndex = -1;
    groupMenu.hidden = true;
    groupMenu.innerHTML = "";
    groupInput.setAttribute("aria-expanded", "false");
  }

  function getGroupMenuNames(showAll = false) {
    const value = showAll ? "" : groupInput.value.trim().toLowerCase();
    return (state.data.groups || [])
      .map((group) => String(group.name || "").trim())
      .filter(Boolean)
      .filter((name) => !value || name.toLowerCase().includes(value));
  }

  function handleGroupInputFocus() {
    if (state.suppressNextGroupMenuFocus) {
      state.suppressNextGroupMenuFocus = false;
      hideGroupMenu();
      return;
    }
    renderGroupMenu({ showAll: true, resetActive: true });
  }

  function handleGroupInputPointerDown() {
    state.suppressNextGroupMenuFocus = false;
    renderGroupMenu({ showAll: true, resetActive: true });
  }

  function handleGroupInputInput() {
    state.suppressNextGroupMenuFocus = false;
    renderGroupMenu({ resetActive: true });
  }

  function handleGroupMenuClick(event) {
    const option = event.target.closest?.(".group-group-option");
    if (!option || !groupMenu.contains(option)) return;
    selectGroupName(option.dataset.groupName || option.textContent);
  }

  function selectGroupName(name) {
    if (!name) return;
    groupInput.value = name;
    state.suppressNextGroupMenuFocus = true;
    hideGroupMenu();
    groupInput.focus();
    hideGroupMenu();
  }

  async function saveCurrentPage() {
    if (!state.fileBound) {
      showToast("请先绑定 group.json");
      return;
    }

    const groupName = groupInput.value.trim();
    const pageTitle = pageInput.value.trim();
    const url = state.draft?.url || location.href;
    const response = await sendMessage({
      type: MESSAGE_TYPES.SAVE_CURRENT_PAGE,
      payload: { groupName, pageTitle, url }
    });

    if (response?.ok && response.status === "saved") {
      flashBall();
      showToast(`已保存到「${response.group.name}」`);
      await refreshState(false);
      togglePanel(false);
      return;
    }

    if (response?.ok && response.status === "duplicate") {
      showToast(`已在「${response.existingGroupName}」中`);
      return;
    }

    showToast(response?.message || "保存失败");
  }

  function togglePreview(open) {
    state.isPreviewOpen = open;
    preview.hidden = !open || !state.fileBound;
    previewButton.textContent = open ? "收起" : "搜索打开";
    if (open) {
      searchInput.focus();
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
  }

  function renderQuickAccess() {
    quickAccess.innerHTML = "";
    if (!state.fileBound) return;

    const pages = getQuickAccessPages(state.data, 5);
    if (!pages.length) {
      quickAccess.innerHTML = `<div class="group-quick-empty">打开或固定页面后显示快捷访问</div>`;
      return;
    }

    quickAccess.innerHTML = `<div class="group-quick-list" aria-label="快捷访问">${pages.map(renderQuickAccessItem).join("")}</div>`;
  }

  function renderQuickAccessItem(page) {
    const title = getPageDisplayName(page);
    return `
      <button class="group-quick-access-item group-quick-open" type="button" data-page-id="${escapeAttribute(page.id)}" data-url="${escapeAttribute(page.url)}" title="${escapeAttribute(page.url)}">
        <span class="group-quick-title">${escapeHtml(title)}</span>
      </button>
    `;
  }

  function renderTree(groups) {
    tree.innerHTML = "";
    if (!state.fileBound) return;

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "group-empty";
      empty.textContent = "没有匹配结果";
      tree.appendChild(empty);
      return;
    }

    for (const group of groups) {
      const groupNode = document.createElement("section");
      const expanded = state.expandedGroupIds.includes(group.id);
      groupNode.className = `group-node${expanded ? "" : " group-node-collapsed"}`;
      const pageRows = group.pages.map((page) => {
        const pageName = getPageDisplayName(page);
        return `
        <div class="group-page-row">
          <span class="group-branch-line" aria-hidden="true"></span>
          <button class="group-page-link" type="button" data-page-id="${escapeAttribute(page.id)}" data-url="${escapeAttribute(page.url)}" title="${escapeAttribute(page.url)}">
            <span class="group-page-title">${escapeHtml(pageName)}</span>
          </button>
          <div class="group-page-actions">
            <button class="group-pin-page ${page.quickAccessPinned ? "group-pin-page-active" : ""}" type="button" data-page-id="${escapeAttribute(page.id)}" data-pinned="${page.quickAccessPinned ? "false" : "true"}" title="${page.quickAccessPinned ? "取消固定" : "固定到快捷访问"}">
              ${page.quickAccessPinned ? "取消" : "固定"}
            </button>
            <button class="group-rename-page" type="button" data-page-id="${escapeAttribute(page.id)}" data-page-name="${escapeAttribute(pageName)}" title="重命名页面">重命名</button>
            <button class="group-remove-page" type="button" data-page-id="${escapeAttribute(page.id)}" title="移除页面">移除</button>
          </div>
        </div>
      `;
      }).join("");
      groupNode.innerHTML = `
        <div class="group-node-header">
          <button class="group-node-main" type="button" data-group-id="${escapeAttribute(group.id)}" aria-expanded="${String(expanded)}">
            <span class="group-caret" aria-hidden="true"></span>
            <span class="group-node-copy">
              <span class="group-node-name">${escapeHtml(group.name)}</span>
              <span class="group-node-subtitle">${group.pages.length} 个页面</span>
            </span>
          </button>
          <button class="group-open-all" type="button" data-group-id="${escapeAttribute(group.id)}">打开全部</button>
        </div>
        <div class="group-pages">${pageRows || `<div class="group-empty">这个分组还没有页面</div>`}</div>
      `;

      tree.appendChild(groupNode);
    }
  }

  function handleTreeClick(event) {
    const toggleButton = event.target.closest?.(".group-node-main");
    if (toggleButton && tree.contains(toggleButton)) {
      const groupNode = toggleButton.closest(".group-node");
      const collapsed = groupNode.classList.toggle("group-node-collapsed");
      const groupId = toggleButton.dataset.groupId;
      state.expandedGroupIds = collapsed
        ? state.expandedGroupIds.filter((id) => id !== groupId)
        : state.expandedGroupIds.includes(groupId)
          ? state.expandedGroupIds
          : [...state.expandedGroupIds, groupId];
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      return;
    }

    const renamePageButton = event.target.closest?.(".group-rename-page");
    if (renamePageButton && tree.contains(renamePageButton)) {
      event.stopPropagation?.();
      runSafely(renamePage(renamePageButton.dataset.pageId, renamePageButton.dataset.pageName));
      return;
    }

    const removePageButton = event.target.closest?.(".group-remove-page");
    if (removePageButton && tree.contains(removePageButton)) {
      event.stopPropagation?.();
      runSafely(removePage(removePageButton.dataset.pageId));
      return;
    }

    const openAllButton = event.target.closest?.(".group-open-all");
    if (openAllButton && tree.contains(openAllButton)) {
      runSafely(openGroup(openAllButton.dataset.groupId));
      return;
    }

    handlePageActionClick(event);
  }

  function handlePageActionClick(event) {
    const pinButton = event.target.closest?.(".group-pin-page");
    if (pinButton && panel.contains(pinButton)) {
      runSafely(setQuickAccessPin(pinButton.dataset.pageId, pinButton.dataset.pinned === "true"));
      return;
    }

    const pageButton = event.target.closest?.(".group-page-link, .group-quick-open");
    if (pageButton && panel.contains(pageButton)) {
      runSafely(openPage(pageButton.dataset.url, pageButton.dataset.pageId));
    }
  }

  async function openGroup(groupId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.OPEN_GROUP,
      payload: { groupId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? `已打开 ${response.opened} 个页面` : response?.message || "打开失败");
  }

  async function openPage(url, pageId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.OPEN_PAGE,
      payload: { url, pageId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已打开页面" : response?.message || "打开失败");
  }

  async function setQuickAccessPin(pageId, pinned) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.SET_QUICK_ACCESS_PIN,
      payload: { pageId, pinned }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? (pinned ? "已固定到快捷访问" : "已取消固定") : response?.message || "操作失败");
  }

  async function renamePage(pageId, currentName) {
    if (!pageId) return;
    const name = window.prompt?.("重命名页面", currentName || "");
    if (!name || !name.trim()) return;

    const response = await sendMessage({
      type: MESSAGE_TYPES.RENAME_PAGE,
      payload: { pageId, name: name.trim() }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已重命名页面" : response?.message || "重命名失败");
  }

  async function removePage(pageId) {
    if (!pageId || !window.confirm?.("移除这个页面？")) return;

    const response = await sendMessage({
      type: MESSAGE_TYPES.DELETE_PAGE,
      payload: { pageId }
    });
    if (response?.ok) {
      state.data = response.data || state.data;
      renderQuickAccess();
      renderTree(searchTree(state.data, searchInput.value));
    }
    showToast(response?.ok ? "已移除页面" : response?.message || "移除失败");
  }

  function openOptions() {
    sendMessage({ type: MESSAGE_TYPES.OPEN_OPTIONS });
  }

  function startDrag(event) {
    state.dragging = true;
    state.dragMoved = false;
    state.startX = event.clientX;
    state.startY = event.clientY;
    const rect = shell.getBoundingClientRect();
    state.startLeft = rect.left;
    state.startTop = rect.top;
    ball.setPointerCapture(event.pointerId);
    ball.addEventListener("pointermove", drag);
    ball.addEventListener("pointerup", stopDrag, { once: true });
  }

  function drag(event) {
    if (!state.dragging) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) state.dragMoved = true;
    shell.style.left = `${state.startLeft + dx}px`;
    shell.style.top = `${Math.max(8, state.startTop + dy)}px`;
    shell.style.right = "auto";
    shell.style.transform = "none";
  }

  function stopDrag(event) {
    state.dragging = false;
    ball.releasePointerCapture(event.pointerId);
    ball.removeEventListener("pointermove", drag);
    const position = snapToEdge();
    runSafely(saveBallPosition(position));
  }

  function snapToEdge() {
    const rect = shell.getBoundingClientRect();
    const offset = state.settings.edgeOffset ?? 12;
    const top = clampTop(rect.top, rect.height);
    let side = "right";
    if (rect.left + rect.width / 2 < window.innerWidth / 2) {
      side = "left";
      shell.dataset.side = "left";
      shell.style.left = `${offset}px`;
      shell.style.right = "auto";
    } else {
      side = "right";
      shell.dataset.side = "right";
      shell.style.right = `${offset}px`;
      shell.style.left = "auto";
    }
    shell.style.top = `${top}px`;
    return { side, top };
  }

  function clampTop(value, height = shell.getBoundingClientRect().height || 44) {
    const top = Number(value);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    if (!Number.isFinite(top)) return Math.min(maxTop, Math.max(8, window.innerHeight * 0.45));
    return Math.min(maxTop, Math.max(8, top));
  }

  async function saveBallPosition(ballPosition) {
    if (!ballPosition) return;
    state.settings = {
      ...state.settings,
      ballPosition
    };
    await sendMessage({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: { ballPosition }
    });
  }

  function handleInputKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSafely(saveCurrentPage());
    }
  }

  function handleGroupInputKeydown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const names = getGroupMenuNames();
      if (!names.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const startIndex = direction === 1 ? 0 : names.length - 1;
      state.groupMenuActiveIndex = state.groupMenuActiveIndex === -1
        ? startIndex
        : (state.groupMenuActiveIndex + direction + names.length) % names.length;
      renderGroupMenu();
      return;
    }

    if (event.key === "Enter" && !groupMenu.hidden && state.groupMenuActiveIndex >= 0) {
      event.preventDefault();
      selectGroupName(getGroupMenuNames()[state.groupMenuActiveIndex]);
      return;
    }

    if (event.key === "Escape" && !groupMenu.hidden) {
      event.preventDefault();
      hideGroupMenu();
      return;
    }

    handleInputKeydown(event);
  }

  function handleSearchKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const [firstGroup] = searchTree(state.data, searchInput.value);
    if (!firstGroup) {
      showToast("没有匹配分组");
      return;
    }
    runSafely(openGroup(firstGroup.id));
  }

  function handleDocumentPointerDown(event) {
    if (!state.isOpen) return;
    if (!isEventInsideRoot(event)) {
      runSafely(togglePanel(false));
      return;
    }
    if (!isEventInsideGroupPicker(event)) {
      hideGroupMenu();
    }
  }

  function isEventInsideRoot(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path)) return path.includes(root);
    return root.contains(event.target);
  }

  function isEventInsideGroupPicker(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path)) return path.includes(groupInput) || path.includes(groupMenu);
    return groupInput.contains(event.target) || groupMenu.contains(event.target);
  }

  function flashBall() {
    ball.classList.add("group-ball-saved");
    window.setTimeout(() => ball.classList.remove("group-ball-saved"), 900);
  }

  function showToast(message) {
    window.clearTimeout(showToast.timer);
    toast.textContent = "";
    toast.hidden = true;
  }

  function searchTree(data, query) {
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    const value = String(query || "").trim().toLowerCase();
    if (!value) return groups;
    return groups.reduce((results, group) => {
      const groupMatches = group.name.toLowerCase().includes(value);
      const pages = groupMatches
        ? group.pages
        : group.pages.filter((page) =>
            [page.name, page.title, page.domain, page.url].some((field) =>
              String(field || "").toLowerCase().includes(value)
            )
          );
      if (groupMatches || pages.length) {
        results.push({ ...group, pages });
      }
      return results;
    }, []);
  }

  function getQuickAccessPages(data, limit = 5) {
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    return groups
      .flatMap((group) =>
        (Array.isArray(group.pages) ? group.pages : []).map((page) => ({
          ...page,
          groupId: group.id,
          groupName: group.name,
          openCount: normalizeOpenCount(page.openCount),
          quickAccessPinned: page.quickAccessPinned === true
        }))
      )
      .filter((page) => page.quickAccessPinned || page.openCount > 0)
      .sort((left, right) => {
        if (left.quickAccessPinned !== right.quickAccessPinned) {
          return left.quickAccessPinned ? -1 : 1;
        }
        if (left.openCount !== right.openCount) return right.openCount - left.openCount;
        return String(right.lastOpenedAt || "").localeCompare(String(left.lastOpenedAt || ""));
      })
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  function getPageDisplayName(page) {
    return page?.name || page?.title || page?.url || "";
  }

  function normalizeOpenCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.floor(number));
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        const runtime = globalThis.chrome?.runtime;
        if (!runtime?.sendMessage) {
          resolve(runtimeFailure(new Error("Extension context invalidated.")));
          return;
        }

        runtime.sendMessage(message, (response) => {
          try {
            const runtimeError = runtime.lastError;
            resolve(response || runtimeFailure(runtimeError));
          } catch (error) {
            resolve(runtimeFailure(error));
          }
        });
      } catch (error) {
        resolve(runtimeFailure(error));
      }
    });
  }

  function runtimeFailure(error) {
    const message = error?.message || String(error || "操作失败");
    if (/extension context invalidated/i.test(message)) {
      return {
        ok: false,
        reason: "context_invalidated",
        message: "插件刚刚刷新过，请刷新当前页面后继续使用"
      };
    }
    return { ok: false, reason: "runtime_error", message };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#96;");
  }

  function runSafely(promise) {
    Promise.resolve(promise).catch((error) => {
      showToast(error?.message || "group 操作失败");
    });
  }
})();
