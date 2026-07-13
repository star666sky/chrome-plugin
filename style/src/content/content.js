(() => {
  const ROOT_ID = "__style_inspector_root__";
  const TOGGLE_MESSAGE = "STYLE_TOGGLE_INSPECTOR";
  const UPDATE_MESSAGE = "STYLE_SETTINGS_UPDATED";
  const GET_SETTINGS_MESSAGE = "STYLE_GET_SETTINGS";

  const FALLBACK_SETTINGS = {
    mode: "global",
    selectionScope: "descendants",
    showPadding: true,
    showMargin: true,
    showBorder: true,
    showGap: true,
    showSize: true,
    showColor: false,
    opacity: 0.06,
    labelSize: 11,
    highlightColor: "#22c55e",
    layerColors: {
      padding: "#f59e0b",
      margin: "#38bdf8",
      border: "#ef4444",
      gap: "#a78bfa",
      size: "#22c55e",
      color: "#fb7185"
    },
    maxAnnotations: 260,
    theme: "dark"
  };

  const TYPE_COLORS = {
    padding: "#f59e0b",
    margin: "#38bdf8",
    gap: "#a78bfa",
    size: "#22c55e",
    color: "#fb7185"
  };

  let enabled = false;
  let root = null;
  let settings = { ...FALLBACK_SETTINGS };
  let inspectorPromise = null;
  let cleanupCallbacks = [];
  let frameHandle = 0;
  let hoverTarget = null;
  let selectedElement = null;
  let hoveredOverlayKey = null;
  let nextOverlayKey = 1;
  const overlayKeys = new WeakMap();

  function getInspectorModule() {
    if (!inspectorPromise) {
      inspectorPromise = import(chrome.runtime.getURL("src/shared/inspector.js"));
    }
    return inspectorPromise;
  }

  function requestSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: GET_SETTINGS_MESSAGE }, (response) => {
        if (chrome.runtime.lastError || !response?.settings) {
          resolve({ ...FALLBACK_SETTINGS });
          return;
        }
        resolve(response.settings);
      });
    });
  }

  function hexToRgb(hex) {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : FALLBACK_SETTINGS.highlightColor;
    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16)
    };
  }

  function alphaColor(hex, alpha) {
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function layerColor(type) {
    return settings.layerColors?.[type] || TYPE_COLORS[type] || settings.highlightColor;
  }

  function numberValue(value) {
    const number = Number.parseFloat(String(value || "0"));
    return Number.isFinite(number) ? number : 0;
  }

  function addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanupCallbacks.push(() => target.removeEventListener(type, listener, options));
  }

  function ensureRoot() {
    let existing = document.getElementById(ROOT_ID);
    if (!existing) {
      existing = document.createElement("div");
      existing.id = ROOT_ID;
      document.documentElement.append(existing);
    }
    root = existing;
    root.dataset.mode = settings.mode;
    root.style.setProperty("--si-label-size", `${settings.labelSize}px`);
    root.style.setProperty("--si-theme-accent", settings.highlightColor);
    root.style.setProperty("--si-theme-fill", alphaColor(settings.highlightColor, settings.opacity));
    for (const type of ["padding", "margin", "border", "gap", "size", "color"]) {
      const color = layerColor(type);
      root.style.setProperty(`--si-${type}`, color);
      root.style.setProperty(`--si-${type}-fill`, alphaColor(color, settings.opacity));
    }
  }

  function removeRoot() {
    root?.remove();
    root = null;
  }

  function getPageElements(inspector) {
    const body = document.body;
    if (!body) {
      return [];
    }

    const elements = Array.from(body.querySelectorAll("*"));
    const results = [];

    for (const element of elements) {
      if (element.id === ROOT_ID || root?.contains(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!inspector.shouldInspectElement({ tagName: element.tagName, rect, style })) {
        continue;
      }

      const rows = inspector.createMetricRows(element, style, settings);
      if (!rows.length) {
        continue;
      }

      results.push({ element, rect, rows, style });
      if (results.length >= settings.maxAnnotations) {
        break;
      }
    }

    return inspector.dedupeRepeatedElements(results);
  }

  function rowSummary(rows) {
    return rows
      .slice(0, 4)
      .map((row) => `${row.label}: ${row.value}`)
      .join("\n");
  }

  function createBox(item, variant = "global") {
    const primaryType = settings.showColor ? "color" : item.rows[0]?.type || "size";
    const accent = layerColor(primaryType);
    const box = document.createElement("div");
    box.className = `style-inspector-box is-${primaryType} is-${variant}`;
    box.dataset.styleInspectorKey = getOverlayKey(item.element);
    box.style.left = `${Math.max(item.rect.left, 0)}px`;
    box.style.top = `${Math.max(item.rect.top, 0)}px`;
    box.style.width = `${Math.max(item.rect.width, 0)}px`;
    box.style.height = `${Math.max(item.rect.height, 0)}px`;
    box.style.setProperty("--si-accent", accent);
    box.style.setProperty("--si-fill", alphaColor(accent, settings.opacity));
    return box;
  }

  function applyLabelPlacement(label, placement) {
    label.classList.remove("is-top", "is-right", "is-bottom", "is-left");
    label.classList.add(`is-${placement.position}`);
    label.style.left = `${Math.round(placement.left)}px`;
    label.style.top = `${Math.round(placement.top)}px`;
    label.style.maxWidth = `${Math.round(placement.width)}px`;
  }

  function connectorPoints(rect, placement) {
    const labelCenterY = placement.top + placement.height / 2;
    const labelCenterX = placement.left + placement.width / 2;
    const elementCenterY = rect.top + rect.height / 2;
    const elementCenterX = rect.left + rect.width / 2;

    if (placement.position === "right") {
      return {
        start: { x: rect.left + rect.width, y: elementCenterY },
        end: { x: placement.left, y: labelCenterY }
      };
    }

    if (placement.position === "left") {
      return {
        start: { x: rect.left, y: elementCenterY },
        end: { x: placement.left + placement.width, y: labelCenterY }
      };
    }

    if (placement.position === "bottom") {
      return {
        start: { x: elementCenterX, y: rect.top + rect.height },
        end: { x: labelCenterX, y: placement.top }
      };
    }

    return {
      start: { x: elementCenterX, y: rect.top },
      end: { x: labelCenterX, y: placement.top + placement.height }
    };
  }

  function createConnector(item, placement) {
    const { start, end } = connectorPoints(item.rect, placement);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const line = document.createElement("span");
    line.className = "style-inspector-connector";
    line.style.left = `${Math.round(start.x)}px`;
    line.style.top = `${Math.round(start.y)}px`;
    line.style.width = `${Math.max(Math.round(Math.hypot(dx, dy)), 2)}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    return line;
  }

  function bindLabelHover(box, label) {
    label.addEventListener("mouseenter", () => {
      box.classList.add("is-label-hover", "is-front");
    });
    label.addEventListener("mouseleave", () => {
      box.classList.remove("is-label-hover", "is-front");
    });
  }

  function getOverlayKey(element) {
    if (!overlayKeys.has(element)) {
      overlayKeys.set(element, String(nextOverlayKey));
      nextOverlayKey += 1;
    }
    return overlayKeys.get(element);
  }

  function findOverlayKeyFromTarget(target) {
    let current = target;
    while (current && current !== document.documentElement) {
      if (overlayKeys.has(current)) {
        return overlayKeys.get(current);
      }
      current = current.parentElement;
    }
    return null;
  }

  function bringOverlayLabelToFront(target) {
    if (!root || !target) {
      return;
    }

    const key = findOverlayKeyFromTarget(target);
    if (key === hoveredOverlayKey) {
      return;
    }

    if (hoveredOverlayKey) {
      root
        .querySelector(`[data-style-inspector-key="${hoveredOverlayKey}"]`)
        ?.classList.remove("is-front");
    }

    hoveredOverlayKey = key;
    if (hoveredOverlayKey) {
      root
        .querySelector(`[data-style-inspector-key="${hoveredOverlayKey}"]`)
        ?.classList.add("is-front");
    }
  }

  function setRect(node, rect) {
    node.style.left = `${Math.max(rect.left, 0)}px`;
    node.style.top = `${Math.max(rect.top, 0)}px`;
    node.style.width = `${Math.max(rect.width, 0)}px`;
    node.style.height = `${Math.max(rect.height, 0)}px`;
  }

  function createLayer(className, rect, type, text) {
    const node = document.createElement("div");
    node.className = `style-inspector-layer ${className}`;
    setRect(node, rect);
    node.style.setProperty("--si-layer-accent", layerColor(type));
    node.style.setProperty("--si-layer-fill", alphaColor(layerColor(type), settings.opacity));
    if (text) {
      const label = document.createElement("span");
      label.className = "style-inspector-layer-label";
      label.textContent = text;
      node.append(label);
    }
    return node;
  }

  function boxNumbers(style) {
    return {
      margin: {
        top: numberValue(style.marginTop),
        right: numberValue(style.marginRight),
        bottom: numberValue(style.marginBottom),
        left: numberValue(style.marginLeft)
      },
      border: {
        top: numberValue(style.borderTopWidth),
        right: numberValue(style.borderRightWidth),
        bottom: numberValue(style.borderBottomWidth),
        left: numberValue(style.borderLeftWidth)
      },
      padding: {
        top: numberValue(style.paddingTop),
        right: numberValue(style.paddingRight),
        bottom: numberValue(style.paddingBottom),
        left: numberValue(style.paddingLeft)
      }
    };
  }

  function insetRect(rect, sides) {
    return {
      left: rect.left + sides.left,
      top: rect.top + sides.top,
      width: rect.width - sides.left - sides.right,
      height: rect.height - sides.top - sides.bottom
    };
  }

  function outsetRect(rect, sides) {
    return {
      left: rect.left - sides.left,
      top: rect.top - sides.top,
      width: rect.width + sides.left + sides.right,
      height: rect.height + sides.top + sides.bottom
    };
  }

  function appendSideSection(panel, title, type, sides) {
    if (!sides) {
      return;
    }

    const section = document.createElement("section");
    section.className = `style-inspector-model-section is-${type}`;
    section.style.setProperty("--si-section-color", layerColor(type));

    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);

    const grid = document.createElement("div");
    grid.className = "style-inspector-model-grid";
    for (const key of ["top", "right", "bottom", "left"]) {
      const cell = document.createElement("div");
      cell.className = `style-inspector-model-cell is-${key}`;
      const name = document.createElement("span");
      name.textContent = key;
      const value = document.createElement("strong");
      value.textContent = sides[key];
      cell.append(name, value);
      grid.append(cell);
    }

    section.append(grid);
    panel.append(section);
  }

  function renderAnalysisPanel(item, model) {
    const panel = document.createElement("aside");
    panel.className = "style-inspector-analysis-panel";

    const title = document.createElement("div");
    title.className = "style-inspector-analysis-title";
    title.textContent = `${item.element.tagName.toLowerCase()} selected`;
    panel.append(title);

    if (model.size) {
      const size = document.createElement("div");
      size.className = "style-inspector-size-line";
      size.textContent = model.size.value;
      panel.append(size);
    }

    appendSideSection(panel, "Margin", "margin", model.margin);
    appendSideSection(panel, "Border", "border", model.border);
    appendSideSection(panel, "Padding", "padding", model.padding);

    if (model.gap) {
      const gap = document.createElement("section");
      gap.className = "style-inspector-model-section is-gap";
      gap.style.setProperty("--si-section-color", layerColor("gap"));
      gap.innerHTML = `<h3>Gap</h3><div class="style-inspector-gap-values"><span>row</span><strong></strong><span>column</span><strong></strong></div>`;
      const values = gap.querySelectorAll("strong");
      values[0].textContent = model.gap.row;
      values[1].textContent = model.gap.column;
      panel.append(gap);
    }

    return panel;
  }

  function renderBoxModelLayers(item, model) {
    const fragment = document.createDocumentFragment();
    const numbers = boxNumbers(item.style);
    const borderBox = item.rect;

    if (model.margin) {
      fragment.append(
        createLayer(
          "style-inspector-layer-margin",
          outsetRect(borderBox, numbers.margin),
          "margin",
          "margin"
        )
      );
    }

    if (model.border) {
      fragment.append(createLayer("style-inspector-layer-border", borderBox, "border", "border"));
    }

    if (model.padding) {
      fragment.append(
        createLayer(
          "style-inspector-layer-padding",
          insetRect(borderBox, numbers.border),
          "padding",
          "padding"
        )
      );
    }

    fragment.append(
      createLayer(
        "style-inspector-layer-content",
        insetRect(insetRect(borderBox, numbers.border), numbers.padding),
        "size",
        null
      )
    );

    if (model.gap) {
      const gapLine = document.createElement("div");
      gapLine.className = "style-inspector-gap-line";
      gapLine.style.left = `${Math.max(borderBox.left + borderBox.width / 2, 0)}px`;
      gapLine.style.top = `${Math.max(borderBox.top + borderBox.height / 2, 0)}px`;
      gapLine.style.setProperty("--si-layer-accent", layerColor("gap"));
      gapLine.textContent = model.gap.row === model.gap.column ? model.gap.row : `${model.gap.row} / ${model.gap.column}`;
      fragment.append(gapLine);
    }

    fragment.append(renderAnalysisPanel(item, model));
    return fragment;
  }

  function buildItem(inspector, element) {
    if (!element || root?.contains(element)) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!inspector.shouldInspectElement({ tagName: element.tagName, rect, style })) {
      return null;
    }

    const rows = inspector.createMetricRows(element, style, settings);
    const model = inspector.createBoxModel(element, style, settings);
    return { element, rect, rows, style, model };
  }

  function getSelectedElements(inspector, element) {
    if (settings.selectionScope === "self") {
      const item = buildItem(inspector, element);
      return item ? [item] : [];
    }

    const results = [];
    for (const child of Array.from(element.querySelectorAll("*"))) {
      if (root?.contains(child)) {
        continue;
      }

      const item = buildItem(inspector, child);
      if (!item || !item.rows.length) {
        continue;
      }

      results.push(item);
      if (results.length >= settings.maxAnnotations) {
        break;
      }
    }

    const deduped = inspector.dedupeRepeatedElements(results);
    if (deduped.length) {
      return deduped;
    }

    const fallback = buildItem(inspector, element);
    return fallback ? [fallback] : [];
  }

  function renderSelectionBoundary(element) {
    const rect = element.getBoundingClientRect();
    const boundary = document.createElement("div");
    boundary.className = "style-inspector-selection-boundary";
    setRect(boundary, rect);
    return boundary;
  }

  function renderSelectedSelf(inspector, item) {
    if (settings.showColor) {
      return renderOverlayItems(inspector, [item], "selected-child");
    }

    const fragment = document.createDocumentFragment();
    fragment.append(renderBoxModelLayers(item, item.model));
    if (item.rows.length) {
      fragment.append(renderOverlayItems(inspector, [item], "selected-child"));
    }
    return fragment;
  }

  function renderSelectedDescendants(inspector, element) {
    const items = getSelectedElements(inspector, element);
    if (!items.length) {
      root?.replaceChildren();
      return;
    }

    if (settings.selectionScope === "self") {
      root.replaceChildren(renderSelectedSelf(inspector, items[0]));
      return;
    }

    const fragment = document.createDocumentFragment();
    fragment.append(renderSelectionBoundary(element));
    fragment.append(
      renderOverlayItems(inspector, items, "selected-child", {
        avoidRect: element.getBoundingClientRect()
      })
    );
    root.replaceChildren(fragment);
  }

  function renderLabel(item) {
    const label = document.createElement("div");
    label.className = "style-inspector-label";

    if (settings.showColor) {
      label.classList.add("style-inspector-color-card");
      for (const row of item.rows) {
        const line = document.createElement("div");
        line.className = `style-inspector-color-row is-${row.label}`;

        const swatch = document.createElement("span");
        swatch.className = "style-inspector-color-swatch";
        swatch.style.background = row.color || row.raw || row.value;
        if (row.label === "shadow") {
          swatch.style.boxShadow = row.raw || row.value;
        }
        swatch.title = row.value;

        const name = document.createElement("span");
        name.className = "style-inspector-color-name";
        name.textContent = row.state ? `${row.state} ${row.label}` : row.label;

        const value = document.createElement("strong");
        value.className = "style-inspector-color-value";
        value.textContent = row.value;

        line.append(swatch, name, value);
        label.append(line);
      }
      return label;
    }

    label.classList.add("style-inspector-value-list");
    for (const row of item.rows.slice(0, 4)) {
      const line = document.createElement("div");
      line.className = `style-inspector-value-row is-${row.type}`;

      const name = document.createElement("span");
      name.textContent = row.label;

      const value = document.createElement("strong");
      value.textContent = row.value;

      line.append(name, value);
      label.append(line);
    }
    return label;
  }

  function labelTextForItem(item) {
    return rowSummary(item.rows) || item.element.tagName.toLowerCase();
  }

  function renderOverlayItems(inspector, items, variant = "global", options = {}) {
    const fragment = document.createDocumentFragment();
    const placements = inspector.planLabelPlacements(
      items.map((item) => ({
        rect: item.rect,
        label: labelTextForItem(item)
      })),
      {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        labelSize: settings.labelSize,
        avoidRect: options.avoidRect
      }
    );

    items.forEach((item, index) => {
      const box = createBox(item, variant);
      const label = renderLabel(item);
      applyLabelPlacement(label, placements[index]);
      bindLabelHover(box, label);
      box.append(createConnector(item, placements[index]));
      box.append(label);
      fragment.append(box);
    });

    return fragment;
  }

  async function renderGlobal() {
    const inspector = await getInspectorModule();
    if (!enabled || settings.mode !== "global" || !root) {
      return;
    }

    if (selectedElement) {
      renderSelectedElement(inspector, selectedElement);
      return;
    }

    root.replaceChildren(renderOverlayItems(inspector, getPageElements(inspector)));
  }

  function renderTooltip(item, x, y) {
    const tooltip = document.createElement("div");
    tooltip.className = "style-inspector-tooltip";
    tooltip.style.left = `${Math.min(x + 14, window.innerWidth - 280)}px`;
    tooltip.style.top = `${Math.min(y + 14, window.innerHeight - 160)}px`;

    const title = document.createElement("div");
    title.className = "style-inspector-tooltip-title";
    title.textContent = item.element.tagName.toLowerCase();
    tooltip.append(title);

    for (const row of item.rows) {
      const line = document.createElement("div");
      line.className = `style-inspector-tooltip-row is-${row.type}`;

      const name = document.createElement("span");
      name.textContent = row.label;
      line.append(name);

      const value = document.createElement("strong");
      value.textContent = row.value;
      line.append(value);

      tooltip.append(line);
    }

    return tooltip;
  }

  async function renderHover(target, x, y) {
    const inspector = await getInspectorModule();
    if (!enabled || settings.mode !== "hover" || !root || !target || root.contains(target)) {
      return;
    }

    if (selectedElement) {
      renderSelectedElement(inspector, selectedElement);
      return;
    }

    const item = buildItem(inspector, target);
    if (!item || !item.rows.length) {
      root.replaceChildren();
      return;
    }

    root.replaceChildren(createBox(item, "hover"), renderTooltip(item, x, y));
  }

  function renderSelectedElement(inspector, element) {
    renderSelectedDescendants(inspector, element);
  }

  function scheduleRender() {
    if (frameHandle) {
      return;
    }
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      if (settings.mode === "global") {
        void renderGlobal();
      }
    });
  }

  function bindRuntimeEvents() {
    addListener(window, "resize", scheduleRender);
    addListener(document, "scroll", scheduleRender, true);
    addListener(
      document,
      "mousemove",
      (event) => {
        if (settings.mode !== "hover") {
          bringOverlayLabelToFront(event.target);
          return;
        }
        const target = event.target;
        if (target === hoverTarget) {
          void renderHover(target, event.clientX, event.clientY);
          return;
        }
        hoverTarget = target;
        void renderHover(target, event.clientX, event.clientY);
      },
      true
    );
    addListener(
      document,
      "click",
      (event) => {
        if (!enabled || root?.contains(event.target)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        selectedElement = event.target;
        getInspectorModule().then((inspector) => renderSelectedElement(inspector, selectedElement));
      },
      true
    );
    addListener(
      document,
      "keydown",
      (event) => {
        if (event.key !== "Escape" || !selectedElement) {
          return;
        }
        selectedElement = null;
        if (settings.mode === "global") {
          void renderGlobal();
        } else {
          root?.replaceChildren();
        }
      },
      true
    );
  }

  async function enableInspector() {
    settings = await requestSettings();
    enabled = true;
    ensureRoot();
    bindRuntimeEvents();

    if (settings.mode === "global") {
      await renderGlobal();
    }
  }

  function disableInspector() {
    enabled = false;
    hoverTarget = null;
    selectedElement = null;
    cleanupCallbacks.forEach((cleanup) => cleanup());
    cleanupCallbacks = [];
    if (frameHandle) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }
    removeRoot();
  }

  async function toggleInspector() {
    if (enabled) {
      disableInspector();
      return { enabled: false };
    }
    await enableInspector();
    return { enabled: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === TOGGLE_MESSAGE) {
      toggleInspector()
        .then(sendResponse)
        .catch((error) => sendResponse({ enabled, error: error?.message || "toggle failed" }));
      return true;
    }

    if (message?.type === UPDATE_MESSAGE) {
      settings = { ...settings, ...message.settings };
      if (enabled) {
        ensureRoot();
        if (settings.mode === "global") {
          void renderGlobal();
        } else {
          root?.replaceChildren();
        }
      }
      sendResponse?.({ ok: true });
      return false;
    }

    return false;
  });
})();
