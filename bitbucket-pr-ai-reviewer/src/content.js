(function initBitbucketAiReviewer() {
  if (window.__bitbucketAiReviewerLoaded) return;
  window.__bitbucketAiReviewerLoaded = true;

  const BALL_SIZE = 52;
  const PANEL_WIDTH = 420;
  const PANEL_MARGIN = 16;
  const POSITION_KEY = "bbai-floating-ball-position";

  const state = {
    open: false,
    status: "Ready to review this pull request.",
    loading: false,
    error: "",
    result: null,
    history: [],
    restoredReviewId: "",
    position: loadPosition(),
    dragging: false,
    movedDuringDrag: false
  };

  const root = document.createElement("aside");
  root.className = "bbai-panel";
  document.documentElement.appendChild(root);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle-panel") {
      state.open = !state.open;
      render();
    }

    if (message?.type === "review-progress") {
      state.status = message.status;
      render();
    }
  });

  render();
  loadReviewHistory();

  function render() {
    root.className = `bbai-panel ${state.open ? "bbai-panel--open" : "bbai-panel--closed"}`;
    applyPosition();

    if (!state.open) {
      root.innerHTML = `
        <button class="bbai-ball" type="button" aria-label="Open AI review panel" title="AI Review">
          AI
        </button>
      `;
      bindBallDrag(root.querySelector(".bbai-ball"));
      return;
    }

    root.innerHTML = `
      <div class="bbai-header">
        <div>
          <div class="bbai-title">AI Review</div>
          <div class="bbai-subtitle">Bitbucket pull request scanner</div>
        </div>
        <button class="bbai-icon-button" type="button" data-action="close" aria-label="Collapse panel">x</button>
      </div>
      <div class="bbai-body">
        <div class="bbai-actions">
          <button class="bbai-primary" type="button" data-action="review" ${state.loading ? "disabled" : ""}>
            ${state.loading ? "Reviewing..." : "Review PR"}
          </button>
          <button class="bbai-secondary" type="button" data-action="settings">Settings</button>
        </div>
        <div class="bbai-status ${state.error ? "bbai-status--error" : ""}">${escapeHtml(state.error || state.status)}</div>
        ${renderHistory()}
        ${renderSummary()}
        ${renderReviewContext()}
        ${renderFindings()}
      </div>
    `;

    root.querySelector('[data-action="close"]').addEventListener("click", () => {
      state.open = false;
      render();
    });
    root.querySelector('[data-action="settings"]').addEventListener("click", openSettings);
    root.querySelector('[data-action="review"]').addEventListener("click", runReview);
    root.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => restoreHistory(button.dataset.historyId));
    });
  }

  function bindBallDrag(ball) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    ball.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      offsetX = event.clientX - state.position.left;
      offsetY = event.clientY - state.position.top;
      state.dragging = true;
      state.movedDuringDrag = false;
      ball.setPointerCapture(pointerId);
      root.classList.add("bbai-panel--dragging");
    });

    ball.addEventListener("pointermove", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      const nextLeft = event.clientX - offsetX;
      const nextTop = event.clientY - offsetY;
      const moved = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);

      if (moved > 4) state.movedDuringDrag = true;
      state.position = clampPosition(nextLeft, nextTop, BALL_SIZE, BALL_SIZE);
      applyPosition();
    });

    ball.addEventListener("pointerup", (event) => {
      if (!state.dragging || event.pointerId !== pointerId) return;

      state.dragging = false;
      root.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      ball.releasePointerCapture(pointerId);
      pointerId = null;

      if (!state.movedDuringDrag) {
        state.open = true;
        render();
      }
    });

    ball.addEventListener("pointercancel", () => {
      state.dragging = false;
      root.classList.remove("bbai-panel--dragging");
      savePosition(state.position);
      pointerId = null;
    });
  }

  function applyPosition() {
    const width = state.open ? Math.min(PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2) : BALL_SIZE;
    const height = state.open ? Math.min(560, window.innerHeight - PANEL_MARGIN * 2) : BALL_SIZE;
    const position = clampPosition(state.position.left, state.position.top, width, height);

    root.style.left = `${position.left}px`;
    root.style.top = `${position.top}px`;
    root.style.right = "auto";
  }

  function loadPosition() {
    try {
      const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");

      if (Number.isFinite(parsed?.left) && Number.isFinite(parsed?.top)) {
        return clampPosition(parsed.left, parsed.top, BALL_SIZE, BALL_SIZE);
      }
    } catch {
      // Ignore malformed localStorage and use the default position.
    }

    return clampPosition(window.innerWidth - BALL_SIZE - PANEL_MARGIN, Math.round(window.innerHeight * 0.4), BALL_SIZE, BALL_SIZE);
  }

  function savePosition(position) {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }

  function clampPosition(left, top, width, height) {
    const maxLeft = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
    const maxTop = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);

    return {
      left: Math.min(Math.max(PANEL_MARGIN, Math.round(left)), maxLeft),
      top: Math.min(Math.max(PANEL_MARGIN, Math.round(top)), maxTop)
    };
  }

  async function runReview() {
    state.loading = true;
    state.error = "";
    state.result = null;
    state.status = "Starting review...";
    render();

    try {
      const response = await chrome.runtime.sendMessage({
        type: "review-current-pr",
        url: location.href
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Review failed.");
      }

      state.result = response.result;
      state.history = Array.isArray(response.history) ? response.history : state.history;
      state.restoredReviewId = "";
      state.status = summarizeResult(response.result);
    } catch (error) {
      state.error = error.message || String(error);
    } finally {
      state.loading = false;
      render();
    }
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
      if (response.currentReview?.result && !state.result) {
        state.result = response.currentReview.result;
        state.restoredReviewId = response.currentReview.id;
        state.status = `Loaded recent review from ${formatTime(response.currentReview.reviewedAt)}.`;
      }
      render();
    } catch {
      // History restore is best-effort and should not block review usage.
    }
  }

  function restoreHistory(historyId) {
    const record = state.history.find((item) => item.id === historyId);
    if (!record?.result) return;

    state.result = record.result;
    state.restoredReviewId = record.id;
    state.error = "";
    state.status = `Loaded recent review from ${formatTime(record.reviewedAt)}.`;
    render();
  }

  function renderHistory() {
    if (!state.history.length) return "";

    return `
      <section class="bbai-history" aria-label="Recent reviews">
        <div class="bbai-section-title">Recent reviews</div>
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
      <button class="bbai-history-item ${isActive ? "bbai-history-item--active" : ""}" type="button" data-history-id="${escapeHtml(record.id)}">
        <span class="bbai-history-title">${escapeHtml(record.title || "Review result")}</span>
        <span class="bbai-history-meta">${escapeHtml(formatTime(record.reviewedAt))} / ${total} finding(s)</span>
      </button>
    `;
  }

  function renderSummary() {
    if (!state.result) return "";

    const findings = Array.isArray(state.result.findings) ? state.result.findings : [];
    const changedFiles = Array.isArray(state.result.changedFiles) ? state.result.changedFiles : [];
    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.filter((finding) => finding.severity === "suggestion").length;

    return `
      <div class="bbai-summary">
        <div><strong>${changedFiles.length}</strong><span>files</span></div>
        <div><strong>${state.result.chunksReviewed}</strong><span>chunks</span></div>
        <div><strong>${urgent}</strong><span>urgent</span></div>
        <div><strong>${suggestions}</strong><span>suggestions</span></div>
      </div>
    `;
  }

  function renderReviewContext() {
    if (!state.result?.pullRequestInfo && !state.result?.commits?.length) return "";

    const info = state.result.pullRequestInfo || {};
    const commits = Array.isArray(state.result.commits) ? state.result.commits.slice(0, 3) : [];

    return `
      <section class="bbai-context">
        <div class="bbai-section-title">Review context</div>
        <div class="bbai-context-title">${escapeHtml(info.title || "No PR title")}</div>
        ${info.description ? `<div class="bbai-context-desc">${escapeHtml(info.description)}</div>` : ""}
        ${
          commits.length
            ? `<div class="bbai-commits">${commits.map((commit) => `<div>${escapeHtml(commit.displayId || "commit")}: ${escapeHtml(commit.message || "")}</div>`).join("")}</div>`
            : ""
        }
      </section>
    `;
  }

  function renderFindings() {
    if (!state.result) return "";
    const findings = Array.isArray(state.result.findings) ? state.result.findings : [];
    if (!findings.length) {
      return `<div class="bbai-empty">No issues found.</div>`;
    }

    return `
      <div class="bbai-findings">
        ${findings.map(renderFinding).join("")}
      </div>
    `;
  }

  function renderFinding(finding) {
    const location = [finding.filePath, finding.line ? `line ${finding.line}` : ""].filter(Boolean).join(" / ");

    return `
      <article class="bbai-finding bbai-finding--${finding.severity}">
        <div class="bbai-finding-top">
          <span class="bbai-severity">${finding.severity}</span>
          <span class="bbai-location">${escapeHtml(location || "No file path")}</span>
        </div>
        <h3>${escapeHtml(finding.title)}</h3>
        <p>${escapeHtml(finding.detail)}</p>
        <div class="bbai-fix">${escapeHtml(finding.suggestion)}</div>
      </article>
    `;
  }

  function summarizeResult(result) {
    const findings = Array.isArray(result.findings) ? result.findings : [];
    if (!findings.length) return "Review complete. No issues found.";

    const urgent = findings.filter((finding) => finding.severity === "urgent").length;
    const suggestions = findings.length - urgent;
    return `Review complete. ${urgent} urgent issue(s), ${suggestions} suggestion(s).`;
  }

  function formatTime(value) {
    if (!value) return "unknown time";
    return new Date(value).toLocaleString();
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
