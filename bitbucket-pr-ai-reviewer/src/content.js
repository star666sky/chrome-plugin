(function initBitbucketAiReviewer() {
  if (window.__bitbucketAiReviewerLoaded) return;
  window.__bitbucketAiReviewerLoaded = true;

  const BALL_SIZE = 56;
  const PANEL_GAP = 24;
  const PANEL_MARGIN = 16;
  const DETAIL_GAP = 12;
  const DETAIL_WIDTH = 360;
  const DETAIL_EXTRA_HEIGHT = 72;
  const POSITION_KEY = "bbai-floating-ball-position";
  const CLOSE_ANIMATION_MS = 360;
  const DEFAULT_STATUS = "准备评审当前合并请求。";
  const DockedPosition = window.BitbucketPrAiReviewerPosition;
  const ImageAttachments = window.BitbucketPrAiReviewerImages;

  const state = {
    open: false,
    status: DEFAULT_STATUS,
    loading: false,
    error: "",
    result: null,
    history: [],
    restoredReviewId: "",
    position: loadPosition(),
    dragging: false,
    movedDuringDrag: false,
    closing: false,
    closeTimer: null,
    detailClosing: false,
    detailCloseTimer: null,
    detailOrigin: null,
    feedbackFindingIndex: null,
    findingFeedbackDraft: "",
    findingFeedbackCategory: "",
    findingFeedbackLoading: false,
    findingFeedbackImages: [],
    overallFeedbackOpen: false,
    overallFeedbackDraft: "",
    overallFeedbackImages: [],
    imageProcessingKind: "",
    imageSessionVersion: 0,
    activeRequestId: ""
  };

  const root = document.createElement("aside");
  root.className = "bbai-panel";
  document.documentElement.appendChild(root);

  const ballRoot = document.createElement("aside");
  ballRoot.className = "bbai-panel bbai-panel--closed";
  document.documentElement.appendChild(ballRoot);

  const detailRoot = document.createElement("aside");
  detailRoot.className = "bbai-panel bbai-detail-panel";
  detailRoot.hidden = true;
  document.documentElement.appendChild(detailRoot);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle-panel") {
      if (!isPullRequestPage()) {
        closePanel({ immediate: true });
        render();
        return;
      }

      togglePanel();
    }

    if (message?.type === "review-progress") {
      if (!isPullRequestPage()) return;
      if (message.requestId && message.requestId !== state.activeRequestId) return;
      if (message.url && message.url !== location.href) return;

      state.status = message.status;
      render();
    }
  });

  installLocationChangeWatcher();
  installOutsideCloseHandler();
  window.addEventListener("pagehide", () => {
    cancelActiveRequest();
    clearAllFeedbackImages();
  });
  render();
  if (isPullRequestPage()) loadReviewHistory();

  function render() {
    if (!isPullRequestPage()) {
      closePanel({ immediate: true });
      root.hidden = true;
      root.innerHTML = "";
      ballRoot.hidden = true;
      ballRoot.innerHTML = "";
      detailRoot.hidden = true;
      detailRoot.innerHTML = "";
      return;
    }

    renderBall();
    applyPosition();

    const shouldShowPanel = state.open || state.closing;
    root.hidden = !shouldShowPanel;

    if (!shouldShowPanel) {
      root.className = "bbai-panel";
      root.innerHTML = "";
      detailRoot.hidden = true;
      detailRoot.innerHTML = "";
      return;
    }

    if (state.closing && root.innerHTML) {
      root.className = "bbai-panel bbai-panel--open bbai-panel--closing";
      detailRoot.hidden = true;
      applyPosition();
      return;
    }

    const reviewBusy = state.loading || state.findingFeedbackLoading;
    root.innerHTML = `
      <div class="bbai-header">
        <div class="bbai-title-block">
          <div class="bbai-kicker">审查控制台</div>
          <div class="bbai-title">代码评审</div>
          <div class="bbai-subtitle">当前合并请求</div>
        </div>
        <button class="bbai-icon-button" type="button" data-action="close" aria-label="收起面板">×</button>
      </div>
      <div class="bbai-body">
        <div class="bbai-command-panel">
          <button class="bbai-primary" type="button" data-action="review" ${reviewBusy ? "disabled" : ""}>
            <span class="bbai-primary-main">${state.loading ? "评审中" : "开始评审"}</span>
            <span class="bbai-primary-sub">${state.loading ? "正在分析变更内容" : state.findingFeedbackLoading ? "正在复审单条意见" : "扫描变更与风险"}</span>
          </button>
          <button class="bbai-secondary" type="button" data-action="settings">设置</button>
        </div>
        <div class="bbai-status-card ${getStatusCardClass()}">
          <span class="bbai-status-orb" aria-hidden="true"></span>
          <div>
            <div class="bbai-status-label">${reviewBusy ? "正在评审" : "状态"}</div>
            <div class="bbai-status">${escapeHtml(getStatusText())}</div>
          </div>
        </div>
        ${renderHistory()}
      </div>
    `;
    root.className = "bbai-panel bbai-panel--open";
    renderReviewDetail();
    applyPosition();

    root.querySelector('[data-action="close"]').addEventListener("click", () => {
      closePanel();
    });
    root.querySelector('[data-action="settings"]').addEventListener("click", openSettings);
    root.querySelector('[data-action="review"]').addEventListener("click", () => runReview());
    root.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => restoreHistory(button.dataset.historyId, button));
    });
    root.querySelectorAll("[data-history-delete-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteHistoryRecord(button.dataset.historyDeleteId);
      });
    });
    bindDetailInteractions();
  }

  function renderBall() {
    ballRoot.hidden = false;
    ballRoot.className = `bbai-panel bbai-panel--closed${state.open || state.closing ? " bbai-panel--orb-active" : ""}`;

    let ball = ballRoot.querySelector(".bbai-ball");
    if (!ball) {
      ballRoot.innerHTML = `
        <button class="bbai-ball" type="button" title="AI 评审">
          <span class="bbai-fusion-field" aria-hidden="true">
            <span class="bbai-fusion-halo bbai-fusion-halo--outer"></span>
            <span class="bbai-fusion-halo bbai-fusion-halo--middle"></span>
            <span class="bbai-fusion-halo bbai-fusion-halo--inner"></span>
            <span class="bbai-fusion-scan"></span>
            <span class="bbai-fusion-orbit bbai-fusion-orbit--outer"></span>
            <span class="bbai-fusion-orbit bbai-fusion-orbit--inner"></span>
            <span class="bbai-fusion-core">
              <span class="bbai-code-core">&lt;/&gt;</span>
            </span>
          </span>
        </button>
      `;
      ball = ballRoot.querySelector(".bbai-ball");
      bindBallDrag(ball);
    }

    ball.setAttribute("aria-label", state.open ? "收起 AI 评审面板" : "打开 AI 评审面板");
  }

  function isPullRequestPage() {
    return Boolean(window.BitbucketPrAiReviewerUrl?.isPullRequestPageUrl(location.href));
  }

  function installLocationChangeWatcher() {
    let currentUrl = location.href;

    const notifyLocationChange = () => {
      window.dispatchEvent(new Event("bbai-location-change"));
    };

    ["pushState", "replaceState"].forEach((methodName) => {
      const originalMethod = history[methodName];
      history[methodName] = function wrappedHistoryMethod(...args) {
        const result = originalMethod.apply(this, args);
        notifyLocationChange();
        return result;
      };
    });

    window.addEventListener("popstate", notifyLocationChange);
    window.addEventListener("hashchange", notifyLocationChange);
    window.addEventListener("bbai-location-change", () => {
      if (location.href === currentUrl) return;

      currentUrl = location.href;
      resetPageState();
      render();
      if (isPullRequestPage()) loadReviewHistory();
    });
  }

  function resetPageState() {
    cancelActiveRequest();
    state.open = false;
    state.status = DEFAULT_STATUS;
    state.loading = false;
    state.error = "";
    state.result = null;
    state.history = [];
    state.restoredReviewId = "";
    state.dragging = false;
    state.movedDuringDrag = false;
    state.closing = false;
    state.detailClosing = false;
    state.detailOrigin = null;
    state.activeRequestId = "";
    resetFeedbackState({ includeLoading: true });
    clearCloseTimer();
    clearDetailCloseTimer();
  }

  function installOutsideCloseHandler() {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!state.open || state.closing || state.dragging) return;

        const target = event.target;
        if (root.contains(target) || ballRoot.contains(target) || detailRoot.contains(target)) return;

        closePanel();
      },
      true
    );
  }

  function togglePanel() {
    if (state.open || state.closing) {
      closePanel();
      return;
    }

    openPanel();
  }

  function openPanel() {
    clearCloseTimer();
    state.open = true;
    state.closing = false;
    render();
  }

  function closePanel({ immediate = false } = {}) {
    clearCloseTimer();
    clearDetailCloseTimer();
    clearAllFeedbackImages();
    if (state.detailClosing) {
      state.detailClosing = false;
      state.restoredReviewId = "";
      state.result = null;
      state.detailOrigin = null;
      resetFeedbackState();
    }

    if (immediate || !state.open) {
      state.open = false;
      state.closing = false;
      return;
    }

    state.closing = true;
    render();
    state.closeTimer = window.setTimeout(() => {
      state.open = false;
      state.closing = false;
      state.closeTimer = null;
      render();
    }, CLOSE_ANIMATION_MS);
  }

  function clearCloseTimer() {
    if (!state.closeTimer) return;
    window.clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }

  function closeReviewDetail({ immediate = false, sourceElement = null } = {}) {
    clearDetailCloseTimer();

    if (immediate || !state.restoredReviewId) {
      state.detailClosing = false;
      state.restoredReviewId = "";
      state.result = null;
      state.detailOrigin = null;
      resetFeedbackState();
      return;
    }

    state.detailOrigin = getDetailOrigin(sourceElement || getSelectedHistoryButton()) || state.detailOrigin;
    state.detailClosing = true;
    if (!state.loading) {
      state.status = "已收起评审详情。";
    }
    render();
    state.detailCloseTimer = window.setTimeout(() => {
      state.detailClosing = false;
      state.restoredReviewId = "";
      state.result = null;
      state.detailOrigin = null;
      resetFeedbackState();
      state.detailCloseTimer = null;
      render();
    }, CLOSE_ANIMATION_MS);
  }

  function clearDetailCloseTimer() {
    if (!state.detailCloseTimer) return;
    window.clearTimeout(state.detailCloseTimer);
    state.detailCloseTimer = null;
  }

  function bindBallDrag(ball) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let offsetY = 0;

    ball.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      offsetY = event.clientY - state.position.top;
      state.dragging = true;
      state.movedDuringDrag = false;
      ball.setPointerCapture(pointerId);
      ballRoot.classList.add("bbai-panel--dragging");
    });

    ball.addEventListener("pointermove", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      const nextTop = event.clientY - offsetY;
      const moved = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);

      if (moved > 4) state.movedDuringDrag = true;
      state.position = DockedPosition.clampDockedPosition({ top: nextTop }, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
      applyPosition();
    });

    ball.addEventListener("pointerup", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      state.dragging = false;
      ballRoot.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      ball.releasePointerCapture(pointerId);
      pointerId = null;

      if (!state.movedDuringDrag) {
        togglePanel();
      }
    });

    ball.addEventListener("pointercancel", () => {
      state.dragging = false;
      ballRoot.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      pointerId = null;
    });
  }

  function applyPosition() {
    const ballPosition = DockedPosition.clampDockedPosition(state.position, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
    const ballStyle = DockedPosition.createDockedStyle(ballPosition);
    state.position = ballPosition;
    ballRoot.style.left = ballStyle.left;
    ballRoot.style.right = "var(--bbai-orb-right-offset, 0px)";
    ballRoot.style.top = ballStyle.top;

    if (!state.open && !state.closing) return;

    const fallbackPanelHeight = Math.min(560, window.innerHeight - PANEL_MARGIN * 2);
    const panelHeight = Math.min(root.offsetHeight || fallbackPanelHeight, window.innerHeight - PANEL_MARGIN * 2);
    const panelTop = state.position.top + BALL_SIZE / 2 - panelHeight / 2;
    const panelPosition = DockedPosition.clampDockedPosition({ top: panelTop }, panelHeight, window.innerHeight, PANEL_MARGIN);
    const panelStyle = DockedPosition.createDockedStyle(panelPosition);

    root.style.left = panelStyle.left;
    root.style.right = `${BALL_SIZE + PANEL_GAP}px`;
    root.style.top = panelStyle.top;
    root.style.setProperty("--bbai-sink-x", `${PANEL_GAP + BALL_SIZE / 2}px`);
    root.style.setProperty("--bbai-sink-y", `${state.position.top - panelPosition.top + BALL_SIZE / 2}px`);
    applyDetailPosition(panelPosition.top, panelHeight);
  }

  function applyDetailPosition(panelTop, panelHeight) {
    if (detailRoot.hidden) return;

    const panelWidth = root.offsetWidth || Math.min(380, window.innerWidth - 104);
    const panelRight = BALL_SIZE + PANEL_GAP;
    const availableWidth = window.innerWidth - panelRight - panelWidth - DETAIL_GAP - PANEL_MARGIN;
    const detailWidth = Math.min(DETAIL_WIDTH, Math.max(280, availableWidth));
    const detailLeft = Math.max(PANEL_MARGIN, window.innerWidth - panelRight - panelWidth - DETAIL_GAP - detailWidth);
    const detailHeight = Math.min(panelHeight + DETAIL_EXTRA_HEIGHT, window.innerHeight - PANEL_MARGIN * 2);
    const detailPosition = DockedPosition.clampDockedPosition(
      { top: panelTop - (detailHeight - panelHeight) / 2 },
      detailHeight,
      window.innerHeight,
      PANEL_MARGIN
    );

    detailRoot.style.left = `${detailLeft}px`;
    detailRoot.style.right = "auto";
    detailRoot.style.top = `${detailPosition.top}px`;
    detailRoot.style.width = `${detailWidth}px`;
    detailRoot.style.height = `${detailHeight}px`;
    applyDetailOrigin(detailLeft, detailPosition.top, detailWidth, detailHeight);
  }

  function applyDetailOrigin(detailLeft, detailTop, detailWidth, detailHeight) {
    const origin = state.detailOrigin || {
      x: detailLeft + detailWidth,
      y: detailTop + detailHeight / 2
    };

    detailRoot.style.setProperty("--bbai-detail-origin-x", `${origin.x - detailLeft}px`);
    detailRoot.style.setProperty("--bbai-detail-origin-y", `${origin.y - detailTop}px`);
  }

  function loadPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");

      if (Number.isFinite(parsed?.top)) {
        return DockedPosition.clampDockedPosition(parsed, BALL_SIZE, window.innerHeight, PANEL_MARGIN);
      }
    } catch {
      // Ignore malformed localStorage and use the default position.
    }

    return DockedPosition.getDefaultDockedPosition(window.innerHeight, BALL_SIZE, PANEL_MARGIN);
  }

  function savePosition(position) {
    localStorage.setItem(POSITION_KEY, JSON.stringify({ top: position.top }));
  }

  async function runReview({ feedback = "", baseReviewId = "", imageKind = "" } = {}) {
    if (state.loading || state.findingFeedbackLoading) return;

    const normalizedFeedback = String(feedback || "").trim();
    const isFollowUp = Boolean(normalizedFeedback);
    const requestId = createRequestId();
    const requestUrl = location.href;

    if (isFollowUp && !baseReviewId) {
      state.error = "请先选择一条评审记录，再提交补充审查。";
      render();
      return;
    }

    clearDetailCloseTimer();
    state.activeRequestId = requestId;
    state.loading = true;
    state.error = "";
    if (!isFollowUp) {
      state.result = null;
      state.restoredReviewId = "";
      resetFeedbackState();
    }
    state.detailClosing = false;
    if (!isFollowUp) state.detailOrigin = null;
    state.status = isFollowUp ? "正在根据补充反馈重新审查整个 PR..." : "正在启动评审...";
    render();

    try {
      const images = imageKind ? await serializeFeedbackImages(imageKind) : [];
      const response = await chrome.runtime.sendMessage({
        type: "review-current-pr",
        url: location.href,
        feedback: normalizedFeedback,
        baseReviewId,
        requestId,
        images
      });

      if (!isCurrentRequest(requestId, requestUrl)) return;

      if (!response?.ok) {
        throw new Error(response?.error || "评审失败。");
      }

      state.result = response.result;
      state.history = Array.isArray(response.history) ? response.history : state.history;
      state.restoredReviewId = state.history[0]?.id || "";
      state.status = summarizeResult(response.result);
      if (isFollowUp) {
        clearFeedbackImages("overall");
        state.overallFeedbackOpen = false;
        state.overallFeedbackDraft = "";
      }
    } catch (error) {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.error = error.message || String(error);
      }
    } finally {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.loading = false;
        state.activeRequestId = "";
        render();
      }
    }
  }

  function bindDetailInteractions() {
    detailRoot.querySelector('[data-action="close-detail"]')?.addEventListener("click", () => {
      closeReviewDetail();
    });

    detailRoot.querySelectorAll('[data-action="toggle-finding-feedback"]').forEach((button) => {
      button.addEventListener("click", () => toggleFindingFeedback(button.dataset.findingIndex));
    });

    detailRoot.querySelectorAll("[data-feedback-category]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.findingFeedbackLoading) return;
        const category = button.dataset.feedbackCategory || "";
        state.findingFeedbackCategory = state.findingFeedbackCategory === category ? "" : category;
        state.error = "";
        render();
      });
    });

    detailRoot.querySelector('[data-action="finding-feedback-input"]')?.addEventListener("input", (event) => {
      state.findingFeedbackDraft = event.target.value;
    });
    bindFeedbackImageInteractions("finding", '[data-action="finding-feedback-input"]');

    detailRoot.querySelector('[data-action="submit-finding-feedback"]')?.addEventListener("click", (event) => {
      submitFindingFeedback(event.currentTarget.dataset.findingIndex);
    });

    detailRoot.querySelector('[data-action="cancel-finding-feedback"]')?.addEventListener("click", () => {
      if (state.findingFeedbackLoading) return;
      state.feedbackFindingIndex = null;
      state.findingFeedbackDraft = "";
      state.findingFeedbackCategory = "";
      clearFeedbackImages("finding");
      state.error = "";
      render();
    });

    detailRoot.querySelector('[data-action="toggle-overall-feedback"]')?.addEventListener("click", () => {
      if (state.loading || state.findingFeedbackLoading) return;
      if (state.overallFeedbackOpen) {
        clearFeedbackImages("overall");
      } else {
        clearFeedbackImages("finding");
        state.feedbackFindingIndex = null;
        state.findingFeedbackDraft = "";
        state.findingFeedbackCategory = "";
      }
      state.overallFeedbackOpen = !state.overallFeedbackOpen;
      state.error = "";
      render();
    });

    detailRoot.querySelector('[data-action="overall-feedback-input"]')?.addEventListener("input", (event) => {
      state.overallFeedbackDraft = event.target.value;
    });
    bindFeedbackImageInteractions("overall", '[data-action="overall-feedback-input"]');

    detailRoot.querySelector('[data-action="submit-overall-feedback"]')?.addEventListener("click", () => {
      submitOverallFeedback();
    });

    detailRoot.querySelector('[data-action="cancel-overall-feedback"]')?.addEventListener("click", () => {
      if (state.loading) return;
      state.overallFeedbackOpen = false;
      state.overallFeedbackDraft = "";
      clearFeedbackImages("overall");
      state.error = "";
      render();
    });
  }

  function bindFeedbackImageInteractions(kind, textareaSelector) {
    const picker = detailRoot.querySelector(`.bbai-feedback-attachments[data-image-kind="${kind}"]`);
    const input = picker?.querySelector('[data-action="select-feedback-images"]');
    const dropzone = picker?.querySelector('[data-action="feedback-image-drop"]');
    const textarea = detailRoot.querySelector(textareaSelector);
    if (!picker || !input || !dropzone || !textarea) return;

    picker.querySelector('[data-action="choose-feedback-images"]')?.addEventListener("click", () => {
      if (!isFeedbackImageBusy()) input.click();
    });

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.value = "";
      addFeedbackImages(kind, files);
    });

    picker.querySelectorAll('[data-action="remove-feedback-image"]').forEach((button) => {
      button.addEventListener("click", () => removeFeedbackImage(kind, button.dataset.imageId));
    });

    dropzone.addEventListener("dragover", (event) => {
      if (!ImageAttachments.hasFileTransfer(event.dataTransfer?.types)) return;
      event.preventDefault();
      if (isFeedbackImageBusy()) return;
      dropzone.classList.add("bbai-feedback-dropzone--active");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("bbai-feedback-dropzone--active");
    });

    dropzone.addEventListener("drop", (event) => {
      dropzone.classList.remove("bbai-feedback-dropzone--active");
      if (!ImageAttachments.hasFileTransfer(event.dataTransfer?.types)) return;
      event.preventDefault();
      if (isFeedbackImageBusy()) return;
      addFeedbackImages(kind, Array.from(event.dataTransfer?.files || []));
    });

    textarea.addEventListener("paste", (event) => {
      if (isFeedbackImageBusy()) return;
      const files = Array.from(event.clipboardData?.items || [])
        .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!files.length) return;

      event.preventDefault();
      addFeedbackImages(kind, files);
    });
  }

  async function addFeedbackImages(kind, files) {
    if (isFeedbackImageBusy()) return;

    const attachments = getFeedbackImages(kind);
    let selected;
    try {
      selected = ImageAttachments.validateFiles(files, attachments.length);
    } catch (error) {
      state.error = error.message || String(error);
      render();
      return;
    }

    if (!selected.length) return;

    const sessionVersion = state.imageSessionVersion;
    state.imageProcessingKind = kind;
    state.error = "";
    render();

    try {
      for (const file of selected) {
        const attachment = await ImageAttachments.compressImageFile(file);
        if (sessionVersion !== state.imageSessionVersion) {
          ImageAttachments.releaseAttachments([attachment]);
          return;
        }
        attachments.push(attachment);
      }
    } catch (error) {
      if (sessionVersion === state.imageSessionVersion) {
        state.error = error.message || String(error);
      }
    } finally {
      if (sessionVersion === state.imageSessionVersion) {
        state.imageProcessingKind = "";
        render();
      }
    }
  }

  function removeFeedbackImage(kind, imageId) {
    if (isFeedbackImageBusy()) return;
    const attachments = getFeedbackImages(kind);
    const index = attachments.findIndex((attachment) => attachment.id === imageId);
    if (index < 0) return;

    ImageAttachments.releaseAttachments([attachments[index]]);
    attachments.splice(index, 1);
    state.error = "";
    render();
  }

  async function serializeFeedbackImages(kind) {
    return await Promise.all(
      getFeedbackImages(kind).map(async (attachment) => ({
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        dataUrl: await ImageAttachments.blobToDataUrl(attachment.blob)
      }))
    );
  }

  function getFeedbackImages(kind) {
    return kind === "overall" ? state.overallFeedbackImages : state.findingFeedbackImages;
  }

  function isFeedbackImageBusy() {
    return Boolean(state.loading || state.findingFeedbackLoading || state.imageProcessingKind);
  }

  function clearFeedbackImages(kind) {
    ImageAttachments.releaseAttachments(getFeedbackImages(kind));
    state.imageSessionVersion += 1;
    if (state.imageProcessingKind === kind) state.imageProcessingKind = "";
  }

  function clearAllFeedbackImages() {
    ImageAttachments.releaseAttachments(state.findingFeedbackImages);
    ImageAttachments.releaseAttachments(state.overallFeedbackImages);
    state.imageSessionVersion += 1;
    state.imageProcessingKind = "";
  }

  function cancelActiveRequest() {
    if (!state.activeRequestId) return;
    chrome.runtime.sendMessage({ type: "cancel-review-request", requestId: state.activeRequestId }).catch(() => {});
  }

  function toggleFindingFeedback(value) {
    if (state.findingFeedbackLoading || state.loading) return;

    const index = Number.parseInt(value, 10);
    if (!Number.isInteger(index) || index < 0) return;

    if (state.feedbackFindingIndex === index) {
      clearFeedbackImages("finding");
      state.feedbackFindingIndex = null;
    } else {
      clearFeedbackImages("finding");
      clearFeedbackImages("overall");
      state.feedbackFindingIndex = index;
      state.findingFeedbackDraft = "";
      state.findingFeedbackCategory = "";
      state.overallFeedbackOpen = false;
      state.overallFeedbackDraft = "";
    }
    state.error = "";
    render();
  }

  async function submitFindingFeedback(value) {
    if (state.findingFeedbackLoading || state.loading) return;

    const findingIndex = Number.parseInt(value, 10);
    const reviewId = state.restoredReviewId;
    const feedback = state.findingFeedbackDraft.trim();
    const requestId = createRequestId();
    const requestUrl = location.href;

    if (!reviewId || !Number.isInteger(findingIndex) || findingIndex < 0) {
      state.error = "找不到要复审的意见，请重新打开评审详情。";
      render();
      return;
    }

    if (!feedback) {
      state.error = "请先填写要反馈给 AI 的内容。";
      render();
      return;
    }

    state.activeRequestId = requestId;
    state.findingFeedbackLoading = true;
    state.error = "";
    state.status = "正在提交反馈并重新审查这条意见...";
    render();

    try {
      const images = await serializeFeedbackImages("finding");
      const response = await chrome.runtime.sendMessage({
        type: "review-finding-feedback",
        url: location.href,
        reviewId,
        findingIndex,
        category: state.findingFeedbackCategory,
        feedback,
        requestId,
        images
      });

      if (!isCurrentRequest(requestId, requestUrl)) return;

      if (!response?.ok) {
        throw new Error(response?.error || "单条意见复审失败。");
      }

      state.history = Array.isArray(response.history) ? response.history : state.history;
      clearFeedbackImages("finding");
      if (state.restoredReviewId === reviewId) {
        state.result = response.result;
        state.feedbackFindingIndex = findingIndex;
        state.findingFeedbackDraft = "";
        state.findingFeedbackCategory = "";
        state.status = formatFeedbackVerdictStatus(response.verdict);
      } else {
        const selectedRecord = state.history.find((item) => item.id === state.restoredReviewId);
        if (selectedRecord?.result) state.result = selectedRecord.result;
      }
    } catch (error) {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.error = error.message || String(error);
      }
    } finally {
      if (isCurrentRequest(requestId, requestUrl)) {
        state.findingFeedbackLoading = false;
        state.activeRequestId = "";
        render();
      }
    }
  }

  function submitOverallFeedback() {
    const feedback = state.overallFeedbackDraft.trim();

    if (!feedback) {
      state.error = "请先填写希望 AI 补充审查的内容。";
      render();
      return;
    }

    runReview({
      feedback,
      baseReviewId: state.restoredReviewId,
      imageKind: "overall"
    });
  }

  function formatFeedbackVerdictStatus(verdict) {
    if (verdict === "dismissed") return "AI 已根据反馈撤回这条意见。";
    if (verdict === "revised") return "AI 已根据反馈修订这条意见。";
    return "AI 已复审并确认这条意见。";
  }

  async function openSettings() {
    await chrome.runtime.sendMessage({ type: "open-options" });
  }

  async function loadReviewHistory() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "get-review-history",
        url: location.href
      });

      if (!response?.ok) return;

      state.history = Array.isArray(response.history) ? response.history : [];
      render();
    } catch {
      // History restore is best-effort and should not block review usage.
    }
  }

  function restoreHistory(historyId, sourceElement = null) {
    if (historyId === state.restoredReviewId) {
      closeReviewDetail({ sourceElement });
      return;
    }

    const record = state.history.find((item) => item.id === historyId);
    if (!record?.result) return;

    clearDetailCloseTimer();
    state.detailOrigin = getDetailOrigin(sourceElement);
    state.result = record.result;
    state.restoredReviewId = record.id;
    state.detailClosing = false;
    state.error = "";
    resetFeedbackState();
    if (!state.loading) {
      state.status = `已载入 ${formatTime(record.reviewedAt)} 的评审记录。`;
    }
    render();
  }

  async function deleteHistoryRecord(historyId) {
    if (!historyId) return;
    if (state.loading || state.findingFeedbackLoading) {
      state.error = "请等待当前评审完成后再删除历史记录。";
      render();
      return;
    }

    const isDeletingSelected = historyId === state.restoredReviewId;
    state.error = "";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "delete-review-history",
        id: historyId
      });

      if (!response?.ok) {
        throw new Error(response?.error || "删除评审记录失败。");
      }

      state.history = Array.isArray(response.history) ? response.history : state.history;
      if (isDeletingSelected || (state.restoredReviewId && !state.history.some((item) => item.id === state.restoredReviewId))) {
        clearDetailCloseTimer();
        state.detailClosing = false;
        state.restoredReviewId = "";
        state.result = null;
        state.detailOrigin = null;
        resetFeedbackState();
      }
      state.status = "已删除这条评审记录。";
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      render();
    }
  }

  function getStatusCardClass() {
    if (state.error) return "bbai-status-card--error";
    if (state.loading || state.findingFeedbackLoading) return "bbai-status-card--loading";
    return "";
  }

  function getStatusText() {
    if (state.error) return state.error;
    if (state.loading || state.findingFeedbackLoading) return state.status || "正在评审当前合并请求...";
    return state.status;
  }

  function resetFeedbackState({ includeLoading = false } = {}) {
    clearAllFeedbackImages();
    state.feedbackFindingIndex = null;
    state.findingFeedbackDraft = "";
    state.findingFeedbackCategory = "";
    if (includeLoading) state.findingFeedbackLoading = false;
    state.overallFeedbackOpen = false;
    state.overallFeedbackDraft = "";
  }

  function createRequestId() {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isCurrentRequest(requestId, requestUrl) {
    return state.activeRequestId === requestId && location.href === requestUrl;
  }

  function getDetailOrigin(element) {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: rect.left,
      y: rect.top + rect.height / 2
    };
  }

  function getSelectedHistoryButton() {
    if (!state.restoredReviewId) return null;

    return Array.from(root.querySelectorAll("[data-history-id]")).find((button) => button.dataset.historyId === state.restoredReviewId) || null;
  }

  function getSelectedReviewRecord() {
    if (!state.restoredReviewId) return null;
    return state.history.find((item) => item.id === state.restoredReviewId) || null;
  }

  function renderReviewDetail() {
    const record = getSelectedReviewRecord();
    const previousScrollTop = detailRoot.querySelector(".bbai-detail-scroll")?.scrollTop || 0;

    if (!record?.result || state.closing || !state.open) {
      detailRoot.hidden = true;
      detailRoot.innerHTML = "";
      return;
    }

    detailRoot.hidden = false;
    detailRoot.className = `bbai-panel bbai-detail-panel bbai-detail-panel--open${state.detailClosing ? " bbai-detail-panel--closing" : ""}`;
    detailRoot.innerHTML = `
      <div class="bbai-detail-header">
        <div class="bbai-title-block">
          <div class="bbai-kicker">评审详情</div>
        </div>
        <button class="bbai-icon-button" type="button" data-action="close-detail" aria-label="收起评审详情">×</button>
      </div>
      <div class="bbai-detail-body">
        <div class="bbai-detail-summary">
          ${renderSummary(record.result)}
        </div>
        <div class="bbai-detail-scroll">
          ${renderFindings(record.result)}
        </div>
      </div>
      ${renderDetailFooter(record)}
    `;

    const detailScroll = detailRoot.querySelector(".bbai-detail-scroll");
    if (detailScroll) detailScroll.scrollTop = previousScrollTop;
  }

  function renderHistory() {
    if (!state.history.length) return "";

    return `
      <section class="bbai-history" aria-label="最近评审">
        <div class="bbai-section-title">最近评审</div>
        <div class="bbai-history-list">
          ${state.history.map(renderHistoryItem).join("")}
        </div>
      </section>
    `;
  }

  function renderHistoryItem(record) {
    const total = Number(record.urgentCount || 0) + Number(record.suggestionCount || 0);
    const isActive = record.id === state.restoredReviewId;

    return `
      <div class="bbai-history-entry">
        <button class="bbai-history-item ${isActive ? "bbai-history-item--active" : ""}" type="button" data-history-id="${escapeHtml(record.id)}">
          <span class="bbai-history-title">${escapeHtml(record.title || "评审结果")}</span>
          <span class="bbai-history-meta">${escapeHtml(formatTime(record.reviewedAt))} / ${total} 条发现</span>
        </button>
        <button class="bbai-history-delete" type="button" data-history-delete-id="${escapeHtml(record.id)}" aria-label="删除这条评审记录">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18"></path>
            <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2"></path>
            <path d="m5 6 1 14c.1 1.1 1 2 2.1 2h7.8c1.1 0 2-.9 2.1-2l1-14"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
          </svg>
        </button>
      </div>
    `;
  }

  function renderSummary(result = state.result) {
    if (!result) return "";

    const findings = getActiveFindings(result);
    const changedFiles = Array.isArray(result.changedFiles) ? result.changedFiles : [];
    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.filter((finding) => finding.severity === "suggestion").length;

    return `
      <div class="bbai-summary">
        <div><strong>${changedFiles.length}</strong><span>文件</span></div>
        <div><strong>${result.chunksReviewed}</strong><span>片段</span></div>
        <div><strong>${urgent}</strong><span>紧急</span></div>
        <div><strong>${suggestions}</strong><span>建议</span></div>
      </div>
    `;
  }

  function renderFindings(result = state.result) {
    if (!result) return "";
    const findings = Array.isArray(result.findings) ? result.findings : [];
    if (!findings.length) {
      return `<div class="bbai-empty">没有发现问题。</div>`;
    }

    return `
      <div class="bbai-findings">
        ${findings.map((finding, index) => renderFinding(finding, index)).join("")}
      </div>
    `;
  }

  function renderFinding(finding, index) {
    const location = [finding.filePath, finding.line ? `第 ${finding.line} 行` : ""].filter(Boolean).join(" / ");
    const dismissed = finding.reviewStatus === "dismissed";
    const feedbackOpen = state.feedbackFindingIndex === index;

    return `
      <article class="bbai-finding bbai-finding--${finding.severity}${dismissed ? " bbai-finding--dismissed" : ""}${feedbackOpen ? " bbai-finding--feedback-open" : ""}">
        <div class="bbai-finding-top">
          <span class="bbai-severity${dismissed ? " bbai-severity--dismissed" : ""}">${dismissed ? "已撤回" : formatSeverity(finding.severity)}</span>
          <button class="bbai-feedback-trigger${feedbackOpen ? " bbai-feedback-trigger--active" : ""}" type="button" data-action="toggle-finding-feedback" data-finding-index="${index}" ${state.loading || state.findingFeedbackLoading ? "disabled" : ""}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-3.8-.8L3 21l1.8-4.8A8.5 8.5 0 1 1 21 11.5Z"></path>
              <path d="M8 12h.01M12 12h.01M16 12h.01"></path>
            </svg>
            <span>${feedbackOpen ? "收起" : "反馈"}</span>
          </button>
        </div>
        <span class="bbai-location">${escapeHtml(location || "无文件路径")}</span>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${escapeHtml(finding.detail)}</p>
        <div class="bbai-fix">${escapeHtml(finding.suggestion)}</div>
        ${renderFeedbackRounds(finding.feedbackRounds)}
      </article>
    `;
  }

  function renderDetailFooter(record) {
    const index = state.feedbackFindingIndex;
    const finding = Number.isInteger(index) ? record?.result?.findings?.[index] : null;

    if (finding) {
      return renderFindingFeedbackComposer(index, finding, state.findingFeedbackLoading);
    }

    return renderOverallFeedback();
  }

  function renderFindingFeedbackComposer(index, finding, loading) {
    const categories = ["结论不准确", "遗漏上下文", "建议不合适"];
    const location = [finding.filePath, finding.line ? `第 ${finding.line} 行` : ""].filter(Boolean).join(" / ");
    const dismissed = finding.reviewStatus === "dismissed";

    return `
      <div class="bbai-detail-footer bbai-detail-footer--finding">
        <div class="bbai-finding-feedback${loading ? " bbai-finding-feedback--loading" : ""}">
          <div class="bbai-feedback-heading">
            <div class="bbai-feedback-context">
              <div class="bbai-feedback-context-top">
                <span class="bbai-severity${dismissed ? " bbai-severity--dismissed" : ""}">${dismissed ? "已撤回" : formatSeverity(finding.severity)}</span>
                <span>反馈给 AI</span>
              </div>
              <strong class="bbai-feedback-context-title">${escapeHtml(finding.title)}</strong>
              <span class="bbai-feedback-context-location">${escapeHtml(location || "无文件路径")}</span>
            </div>
            <span class="bbai-feedback-live">${loading ? "复审中" : "当前意见"}</span>
          </div>
          <div class="bbai-feedback-categories" aria-label="反馈类型">
            ${categories
              .map(
                (category) => `
                  <button class="bbai-feedback-chip${state.findingFeedbackCategory === category ? " bbai-feedback-chip--active" : ""}" type="button" data-feedback-category="${escapeHtml(category)}" ${loading ? "disabled" : ""}>${escapeHtml(category)}</button>
                `
              )
              .join("")}
          </div>
          ${ImageAttachments.renderAttachmentPicker({
            kind: "finding",
            attachments: state.findingFeedbackImages,
            disabled: loading || state.loading,
            processing: state.imageProcessingKind === "finding"
          })}
          <textarea class="bbai-feedback-textarea" data-action="finding-feedback-input" rows="3" maxlength="4000" placeholder="说明你认为遗漏、误判或需要重新检查的地方..." ${loading ? "disabled" : ""}>${escapeHtml(state.findingFeedbackDraft)}</textarea>
          <div class="bbai-feedback-actions">
            <button class="bbai-feedback-submit" type="button" data-action="submit-finding-feedback" data-finding-index="${index}" ${loading || state.imageProcessingKind ? "disabled" : ""}>
              <span>${loading ? "正在重新审查" : "重新审查此问题"}</span>
            </button>
            <button class="bbai-feedback-cancel" type="button" data-action="cancel-finding-feedback" ${loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderFeedbackRounds(rounds) {
    if (!Array.isArray(rounds) || !rounds.length) return "";

    return `
      <div class="bbai-feedback-rounds">
        ${rounds
          .map(
            (round) => `
              <div class="bbai-feedback-round">
                <div class="bbai-feedback-round-user">
                  <div class="bbai-feedback-round-label">
                    <span>你的反馈${round.category ? ` · ${escapeHtml(round.category)}` : ""}</span>
                    <time>${escapeHtml(formatTime(round.reviewedAt))}</time>
                  </div>
                  <p>${escapeHtml(round.feedback)}</p>
                </div>
                <div class="bbai-feedback-round-ai bbai-feedback-round-ai--${escapeHtml(round.verdict || "confirmed")}">
                  <div class="bbai-feedback-round-label">
                    <span>AI 复审 · ${formatFeedbackVerdict(round.verdict)}</span>
                  </div>
                  <p>${escapeHtml(round.response)}</p>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderOverallFeedback() {
    const busy = state.loading || state.findingFeedbackLoading;

    if (!state.overallFeedbackOpen) {
      return `
        <div class="bbai-overall-feedback">
          <span class="bbai-overall-feedback-icon" aria-hidden="true">✦</span>
          <div class="bbai-overall-feedback-copy">
            <strong>还发现了遗漏？</strong>
            <span>补充要求后重新审查整个 PR</span>
          </div>
          <button type="button" data-action="toggle-overall-feedback" ${busy ? "disabled" : ""}>补充审查</button>
        </div>
      `;
    }

    return `
      <div class="bbai-overall-feedback bbai-overall-feedback--open">
        <div class="bbai-overall-feedback-heading">
          <div>
            <strong>补充审查要求</strong>
            <span>AI 将重新检查整个 PR，并生成一条新的评审记录</span>
          </div>
        </div>
        ${ImageAttachments.renderAttachmentPicker({
          kind: "overall",
          attachments: state.overallFeedbackImages,
          disabled: state.loading || state.findingFeedbackLoading,
          processing: state.imageProcessingKind === "overall"
        })}
        <textarea class="bbai-feedback-textarea" data-action="overall-feedback-input" rows="3" maxlength="4000" placeholder="例如：重点检查权限边界，以及删除字段后是否还有遗漏调用..." ${state.loading ? "disabled" : ""}>${escapeHtml(state.overallFeedbackDraft)}</textarea>
        <div class="bbai-feedback-actions">
          <button class="bbai-feedback-submit" type="button" data-action="submit-overall-feedback" ${state.loading || state.imageProcessingKind ? "disabled" : ""}>${state.loading ? "正在重新审查" : "重新审查整个 PR"}</button>
          <button class="bbai-feedback-cancel" type="button" data-action="cancel-overall-feedback" ${state.loading ? "disabled" : ""}>取消</button>
        </div>
      </div>
    `;
  }

  function summarizeResult(result) {
    const findings = getActiveFindings(result);
    if (!findings.length) return "评审完成，未发现问题。";

    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.length - urgent;
    return `评审完成：${urgent} 个紧急问题，${suggestions} 条建议。`;
  }

  function getActiveFindings(result) {
    return (Array.isArray(result?.findings) ? result.findings : []).filter((finding) => finding?.reviewStatus !== "dismissed");
  }

  function formatFeedbackVerdict(verdict) {
    if (verdict === "dismissed") return "已撤回";
    if (verdict === "revised") return "已修订";
    return "仍然成立";
  }

  function formatSeverity(severity) {
    if (severity === "urgent") return "紧急";
    if (severity === "suggestion") return "建议";
    return severity || "提示";
  }

  function formatTime(value) {
    if (!value) return "未知时间";
    return new Date(value).toLocaleString("zh-CN");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
