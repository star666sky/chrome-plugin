(() => {
  if (document.getElementById("group-extension-root")) return;

  const MESSAGE_TYPES = {
    GET_STATE: "GROUP_GET_STATE",
    GET_PAGE_DRAFT: "GROUP_GET_PAGE_DRAFT",
    SAVE_CURRENT_PAGE: "GROUP_SAVE_CURRENT_PAGE",
    OPEN_GROUP: "GROUP_OPEN_GROUP",
    OPEN_OPTIONS: "GROUP_OPEN_OPTIONS",
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
    draft: null
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
            <input class="group-group-input" list="group-options" autocomplete="off" />
            <datalist id="group-options"></datalist>
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
  const groupOptions = root.querySelector("#group-options");
  const saveButton = root.querySelector(".group-save-button");
  const previewButton = root.querySelector(".group-preview-button");
  const manageButton = root.querySelector(".group-manage-button");
  const openOptionsButton = root.querySelector(".group-open-options");
  const preview = root.querySelector(".group-preview");
  const searchInput = root.querySelector(".group-search-input");
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
  searchInput.addEventListener("input", () => renderTree(searchTree(state.data, searchInput.value)));
  searchInput.addEventListener("keydown", handleSearchKeydown);
  groupInput.addEventListener("keydown", handleInputKeydown);
  pageInput.addEventListener("keydown", handleInputKeydown);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  shell.addEventListener("mouseenter", () => shell.classList.remove("group-edge-hidden"));
  shell.addEventListener("mouseleave", () => {
    if (!state.isOpen && state.settings.edgeHide !== false) {
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
        groupInput.focus();
        groupInput.select();
      }
    } else if (state.settings.edgeHide !== false) {
      shell.classList.add("group-edge-hidden");
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
    recentLabel.textContent = settings.showRecentGroupName && settings.recentGroupName
      ? settings.recentGroupName
      : "";
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
    groupOptions.innerHTML = "";
    for (const group of state.data.groups || []) {
      const option = document.createElement("option");
      option.value = group.name;
      groupOptions.appendChild(option);
    }
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
      renderTree(searchTree(state.data, searchInput.value));
    }
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
      groupNode.className = "group-node";
      groupNode.innerHTML = `
        <div class="group-node-header">
          <span class="group-node-name"></span>
          <span class="group-count"></span>
          <button class="group-open-all" type="button">打开全部</button>
        </div>
        <div class="group-pages"></div>
      `;
      groupNode.querySelector(".group-node-name").textContent = group.name;
      groupNode.querySelector(".group-count").textContent = `${group.pages.length}`;
      groupNode.querySelector(".group-open-all").addEventListener("click", () => openGroup(group.id));
      const pages = groupNode.querySelector(".group-pages");

      for (const page of group.pages) {
        const pageRow = document.createElement("div");
        pageRow.className = "group-page-row";
        pageRow.innerHTML = `
          <span class="group-page-title"></span>
          <span class="group-page-domain"></span>
        `;
        pageRow.querySelector(".group-page-title").textContent = page.title;
        pageRow.querySelector(".group-page-domain").textContent = page.domain;
        pages.appendChild(pageRow);
      }

      tree.appendChild(groupNode);
    }
  }

  async function openGroup(groupId) {
    const response = await sendMessage({
      type: MESSAGE_TYPES.OPEN_GROUP,
      payload: { groupId }
    });
    showToast(response?.ok ? `已打开 ${response.opened} 个页面` : response?.message || "打开失败");
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
    if (!state.isOpen || isEventInsideRoot(event)) return;
    runSafely(togglePanel(false));
  }

  function isEventInsideRoot(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    if (Array.isArray(path)) return path.includes(root);
    return root.contains(event.target);
  }

  function flashBall() {
    ball.classList.add("group-ball-saved");
    window.setTimeout(() => ball.classList.remove("group-ball-saved"), 900);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
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
            [page.title, page.domain, page.url].some((field) =>
              String(field || "").toLowerCase().includes(value)
            )
          );
      if (groupMatches || pages.length) {
        results.push({ ...group, pages });
      }
      return results;
    }, []);
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

  function runSafely(promise) {
    Promise.resolve(promise).catch((error) => {
      showToast(error?.message || "group 操作失败");
    });
  }
})();
