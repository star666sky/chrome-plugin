const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "META",
  "LINK",
  "TITLE",
  "TEMPLATE",
  "NOSCRIPT",
  "BR"
]);

const TRANSPARENT_COLORS = new Set([
  "transparent",
  "rgba(0, 0, 0, 0)",
  "rgba(0,0,0,0)"
]);

const CSS_COLOR_PATTERN = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8}\b)/i;

function getRect(element) {
  if (element?.rect) {
    return element.rect;
  }
  if (typeof element?.getBoundingClientRect === "function") {
    return element.getBoundingClientRect();
  }
  return { width: 0, height: 0, left: 0, top: 0 };
}

function getStyle(element) {
  if (element?.style && typeof element.style.display === "string") {
    return element.style;
  }
  if (typeof globalThis.getComputedStyle === "function") {
    return globalThis.getComputedStyle(element);
  }
  return {};
}

function toNumber(value) {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? number : 0;
}

function formatPx(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded : String(rounded).replace(/\.?0+$/, "")}px`;
}

function compactSides(top, right, bottom, left) {
  const values = [top, right, bottom, left].map((value) => String(value || "0px"));
  if (values.every((value) => value === values[0])) {
    return values[0];
  }
  if (values[0] === values[2] && values[1] === values[3]) {
    return `${values[0]} ${values[1]}`;
  }
  return values.join(" ");
}

function getClassTokens(element) {
  const className = element?.className;
  if (!className) {
    return [];
  }
  if (typeof className === "string") {
    return className.split(/\s+/).filter(Boolean);
  }
  if (typeof className.baseVal === "string") {
    return className.baseVal.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(className)) {
    return className.filter(Boolean);
  }
  return String(className).split(/\s+/).filter(Boolean);
}

function findToken(element, prefixes) {
  const tokens = getClassTokens(element);
  return tokens.find((token) => prefixes.some((prefix) => token === prefix || token.startsWith(prefix)));
}

function tokenValue(element, prefixes, value, style) {
  const token = findToken(element, prefixes);
  return token ? `${token}\uFF08${computedTokenDisplayValue(element, token, value, style)}\uFF09` : value;
}

function sideTokenValue(element, sidePrefixes, shorthandPrefixes, value, allValues, style) {
  const sideToken = findToken(element, sidePrefixes);
  if (sideToken) {
    return `${sideToken}\uFF08${computedTokenDisplayValue(element, sideToken, value, style)}\uFF09`;
  }

  const allSidesMatch = allValues?.every((item) => item === value);
  if (allSidesMatch) {
    return tokenValue(element, shorthandPrefixes, value, style);
  }

  return value;
}

function rootFontSize(element) {
  const root = element?.ownerDocument?.documentElement || globalThis.document?.documentElement;
  if (root) {
    const fontSize = toNumber(getStyle(root).fontSize);
    if (fontSize) {
      return fontSize;
    }
  }
  return 16;
}

function elementFontSize(element, style) {
  return toNumber(style?.fontSize) || toNumber(getStyle(element).fontSize) || rootFontSize(element);
}

function arbitraryTokenRawValue(token) {
  return String(token || "").match(/\[([^\]]+)\]/)?.[1] || "";
}

function resolvedLengthTokenValue(rawValue, element, style) {
  const normalized = String(rawValue || "").trim().replace(/_/g, " ");
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(/\s+/);
  const resolved = parts.map((part) => {
    const match = part.match(/^(-?\d*\.?\d+)(px|em|rem)$/i);
    if (!match) {
      return null;
    }

    const number = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "px") {
      return formatPx(number);
    }
    if (unit === "em") {
      return formatPx(number * elementFontSize(element, style));
    }
    return formatPx(number * rootFontSize(element));
  });

  return resolved.every(Boolean) ? resolved.join(" ") : "";
}

function computedTokenDisplayValue(element, token, value, style) {
  const rawValue = arbitraryTokenRawValue(token);
  const resolvedValue = resolvedLengthTokenValue(rawValue, element, style);
  if (!resolvedValue) {
    return value;
  }

  const units = Array.from(String(rawValue).matchAll(/-?\d*\.?\d+(px|em|rem)\b/gi)).map((match) =>
    match[1].toLowerCase()
  );
  const usesRem = units.includes("rem");
  const usesEm = units.includes("em");
  if (usesEm || usesRem) {
    const base = usesEm ? elementFontSize(element, style) : rootFontSize(element);
    const baseText = `font ${formatPx(base)}`;
    return resolvedValue === value ? `${value}, ${baseText}` : `${value}, ${resolvedValue}, ${baseText}`;
  }

  return resolvedValue;
}

function hasUsefulSpacing(...values) {
  return values.some((value) => toNumber(value) !== 0);
}

function isVisibleColor(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  return !TRANSPARENT_COLORS.has(value.trim().toLowerCase());
}

function hasVisibleBorder(style) {
  return isVisibleColor(style.borderTopColor) && toNumber(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
}

function extractShadowColor(value) {
  const shadow = String(value || "");
  return shadow.match(CSS_COLOR_PATTERN)?.[0] || shadow;
}

function uniqueValues(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function cssVariableNames(value) {
  return uniqueValues(Array.from(String(value || "").matchAll(/var\(\s*(--[\w-]+)/g)).map((match) => match[1]));
}

function customPropertyValue(element, name) {
  if (!name) {
    return "";
  }

  const candidates = [
    element,
    element?.ownerDocument?.documentElement,
    globalThis.document?.documentElement,
    element?.ownerDocument?.body,
    globalThis.document?.body
  ].filter(Boolean);

  for (const candidate of candidates) {
    const inlineValue = candidate.style?.getPropertyValue?.(name);
    if (inlineValue) {
      return inlineValue.trim();
    }
    const computedValue = getStyle(candidate)?.getPropertyValue?.(name);
    if (computedValue) {
      return computedValue.trim();
    }
  }

  return "";
}

function colorVariableCandidates(element) {
  const candidates = [];
  const visited = new Set();
  let current = element;
  while (current) {
    candidates.push(current);
    current = current.parentElement;
  }
  candidates.push(
    element?.ownerDocument?.documentElement,
    globalThis.document?.documentElement,
    element?.ownerDocument?.body,
    globalThis.document?.body
  );

  const variables = [];
  for (const candidate of candidates.filter(Boolean)) {
    if (visited.has(candidate)) {
      continue;
    }
    visited.add(candidate);

    for (const style of [candidate.style, getStyle(candidate)].filter(Boolean)) {
      const names = new Set();
      for (let index = 0; index < Number(style.length || 0); index += 1) {
        const name = style.item?.(index) || style[index];
        if (String(name).startsWith("--")) {
          names.add(name);
        }
      }
      for (const name of Object.keys(style)) {
        if (name.startsWith("--")) {
          names.add(name);
        }
      }

      for (const name of names) {
        const value = style.getPropertyValue?.(name) || style[name];
        if (value) {
          variables.push({ name, value: String(value).trim() });
        }
      }
    }
  }

  return variables;
}

function cssVariableColorValue(element, name, visited = new Set()) {
  if (!name || visited.has(name)) {
    return "";
  }

  visited.add(name);
  const value = customPropertyValue(element, name);
  if (!value) {
    return "";
  }

  const directColor = extractShadowColor(value);
  if (rgbParts(directColor)) {
    return directColor;
  }

  for (const nestedName of cssVariableNames(value)) {
    const nestedColor = cssVariableColorValue(element, nestedName, visited);
    if (nestedColor) {
      return nestedColor;
    }
  }

  return "";
}

function matchingColorVariables(element, color) {
  const targetHex = hexString(color);
  if (!targetHex) {
    return [];
  }

  return uniqueValues(
    colorVariableCandidates(element)
      .filter((variable) => {
        const colorValue = cssVariableColorValue(element, variable.name) || extractShadowColor(variable.value);
        return hexString(extractShadowColor(colorValue)) === targetHex;
      })
      .map((variable) => variable.name)
  );
}

function stylePropertyValue(style, property) {
  const direct = style?.getPropertyValue?.(property);
  if (direct) {
    return direct.trim();
  }
  const camel = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  return String(style?.[camel] || "").trim();
}

function normalizeSelector(selector) {
  return String(selector || "").replace(/\\/g, "");
}

function splitSelectorList(selector) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of String(selector || "")) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function selectorHasToken(selector, token) {
  const normalized = normalizeSelector(selector);
  return normalized.includes(`.${token}`) || normalized.includes(`.${token}:`);
}

function selectorState(selector) {
  const normalized = normalizeSelector(selector);
  return ["hover", "active", "focus-visible", "focus", "disabled"].find((state) =>
    normalized.includes(`:${state}`)
  ) || "";
}

function selectorWithoutState(selector, state) {
  return normalizeSelector(selector)
    .replace(new RegExp(`:${state}(?=[\\s.#:[>+~)]|$)`, "g"), "")
    .trim();
}

function selectorMatchesElement(element, selector, state = "") {
  const baseSelector = state ? selectorWithoutState(selector, state) : normalizeSelector(selector);
  if (baseSelector && typeof element?.matches === "function") {
    try {
      if (element.matches(baseSelector)) {
        return true;
      }
    } catch {
      // Escaped utility selectors are handled by class-token matching.
    }
  }

  return getClassTokens(element).some((token) => selectorHasToken(selector, token));
}

function selectorMatchesElementState(element, selector, state) {
  return selectorMatchesElement(element, selector, state);
}

function cssRulesFromDocument(documentRef) {
  const rules = [];

  function collect(ruleList) {
    for (const rule of Array.from(ruleList || [])) {
      if (rule.selectorText) {
        rules.push(rule);
      }
      if (rule.cssRules) {
        collect(rule.cssRules);
      }
    }
  }

  for (const sheet of Array.from(documentRef?.styleSheets || [])) {
    try {
      collect(sheet.cssRules);
    } catch {
      // Ignore cross-origin stylesheets.
    }
  }
  return rules;
}

function declarationForToken(element, token, properties, expectedState = "") {
  if (!token) {
    return "";
  }

  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      if (!selectorHasToken(selector, token)) {
        continue;
      }

      const state = selectorState(selector);
      if (expectedState ? state !== expectedState : state) {
        continue;
      }

      for (const property of properties) {
        const value = stylePropertyValue(rule.style, property);
        if (value) {
          return value;
        }
      }
    }
  }

  return "";
}

function declarationForElement(element, properties, expectedState = "") {
  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      const state = selectorState(selector);
      if (expectedState ? state !== expectedState : state) {
        continue;
      }
      if (!selectorMatchesElement(element, selector, state)) {
        continue;
      }

      for (const property of properties) {
        const value = stylePropertyValue(rule.style, property);
        if (value) {
          return value;
        }
      }
    }
  }

  return "";
}

function rgbParts(value) {
  const text = String(value || "").trim();
  const legacy = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (legacy) {
    return legacy.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))));
  }

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex?.length === 3) {
    return hex.split("").map((part) => Number.parseInt(`${part}${part}`, 16));
  }
  if (hex?.length === 6) {
    return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  }

  return null;
}

function rgbString(value) {
  const parts = rgbParts(value);
  return parts ? `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})` : String(value || "");
}

function hexString(value) {
  const parts = rgbParts(value);
  if (!parts) {
    return "";
  }
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function resolvedCssColor(element, cssValue, fallbackColor) {
  const directVariables = cssVariableNames(cssValue);
  const variableValue = directVariables.map((name) => cssVariableColorValue(element, name)).find(Boolean) || "";
  const cssColor = extractShadowColor(variableValue || cssValue || "");
  const candidate = rgbParts(cssColor) ? cssColor : fallbackColor;
  const rgb = rgbString(candidate);
  const cssVariables = uniqueValues([...directVariables, ...matchingColorVariables(element, rgb)]);
  return {
    cssVariable: cssVariables.join(", "),
    cssVariables,
    rgb,
    hex: hexString(rgb),
    color: rgb || fallbackColor
  };
}

function colorPropertiesForLabel(label) {
  if (label === "text") {
    return ["color"];
  }
  if (label === "bg") {
    return ["background-color", "background"];
  }
  if (label === "border") {
    return ["border-color", "border-top-color", "border"];
  }
  return ["box-shadow"];
}

function colorMetricRow(element, label, prefixes, color, raw = color, options = {}) {
  const token = options.token || findToken(element, prefixes);
  const properties = colorPropertiesForLabel(label);
  const cssValue =
    options.cssValue ||
    declarationForToken(element, token, properties, options.state) ||
    declarationForElement(element, properties, options.state);
  const colorInfo = resolvedCssColor(element, cssValue, color);
  const value = [token, colorInfo.cssVariables.join(", "), colorInfo.rgb, colorInfo.hex].filter(Boolean).join(" | ");
  return {
    type: "color",
    label,
    state: options.state || "",
    token: token || "",
    cssVariable: colorInfo.cssVariable,
    cssVariables: colorInfo.cssVariables,
    rgb: colorInfo.rgb,
    hex: colorInfo.hex,
    value: value || color,
    color: colorInfo.color,
    raw
  };
}

function visibleColorMetricRow(element, label, prefixes, color, raw = color, options = {}) {
  const row = colorMetricRow(element, label, prefixes, color, raw, options);
  return isVisibleColor(row.color) ? row : null;
}

function pseudoColorRows(element) {
  const rows = [];
  const seen = new Set();
  const tokens = getClassTokens(element);
  const groups = [
    { label: "text", properties: colorPropertiesForLabel("text") },
    { label: "bg", properties: colorPropertiesForLabel("bg") },
    { label: "border", properties: colorPropertiesForLabel("border") },
    { label: "shadow", properties: colorPropertiesForLabel("shadow") }
  ];

  for (const rule of cssRulesFromDocument(element?.ownerDocument || globalThis.document)) {
    for (const selector of splitSelectorList(rule.selectorText)) {
      const state = selectorState(selector);
      if (!state || !selectorMatchesElementState(element, selector, state)) {
        continue;
      }

      const token = tokens.find((item) => selectorHasToken(selector, item)) || "";
      for (const group of groups) {
        const cssValue = group.properties.map((property) => stylePropertyValue(rule.style, property)).find(Boolean);
        if (!cssValue) {
          continue;
        }

        const color =
          group.label === "shadow" ? extractShadowColor(cssValue) : resolvedCssColor(element, cssValue, cssValue).color;
        if (!isVisibleColor(color)) {
          continue;
        }

        const key = `${state}:${group.label}:${selector}:${cssValue}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        rows.push(colorMetricRow(element, group.label, [], color, cssValue, { state, token, cssValue }));
      }
    }
  }

  return rows;
}

function roundedSize(value) {
  const number = toNumber(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function sideValues(style, property) {
  return {
    top: style[`${property}Top`] || "0px",
    right: style[`${property}Right`] || "0px",
    bottom: style[`${property}Bottom`] || "0px",
    left: style[`${property}Left`] || "0px"
  };
}

function borderWidthValues(style) {
  return {
    top: style.borderTopWidth || "0px",
    right: style.borderRightWidth || "0px",
    bottom: style.borderBottomWidth || "0px",
    left: style.borderLeftWidth || "0px"
  };
}

function mapSides(values, mapper) {
  return {
    top: mapper(values.top, "top"),
    right: mapper(values.right, "right"),
    bottom: mapper(values.bottom, "bottom"),
    left: mapper(values.left, "left")
  };
}

function signatureClass(element) {
  return getClassTokens(element)
    .filter((token) => !/^(is-|has-|active|selected|current|hover|focus|disabled)/.test(token))
    .sort()
    .join(".");
}

function elementSignature(element) {
  const parent = element?.parentElement;
  const parentTag = String(parent?.tagName || "").toUpperCase();
  const parentClass = signatureClass(parent);
  const tag = String(element?.tagName || "").toUpperCase();
  const className = signatureClass(element);
  return `${parentTag}.${parentClass}>${tag}.${className}`;
}

function rowSignature(item) {
  if (!Array.isArray(item?.rows) || !item.rows.length) {
    return "";
  }

  return item.rows
    .map((row) => `${row.type || ""}:${row.label || ""}:${row.value || ""}`)
    .join("|");
}

function similarSizeSignature(item) {
  const rect = item?.rect || getRect(item?.element || item);
  const width = Math.round(toNumber(rect.width) / 16);
  const height = Math.round(toNumber(rect.height) / 16);
  return `${width}x${height}`;
}

function repeatedSignature(item) {
  const element = item.element || item;
  const metrics = rowSignature(item);
  const base = elementSignature(element);

  if (metrics) {
    return `${base}|${similarSizeSignature(item)}|${metrics}`;
  }

  if (isListLikeElement(element)) {
    return base;
  }

  return "";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function labelSize(label, labelSizePx) {
  const lines = String(label || "")
    .split(/\n+/)
    .filter(Boolean);
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const rowCount = Math.max(1, lines.length);
  const width = clamp(Math.round(longestLine * labelSizePx * 0.62 + 22), 74, 280);
  return {
    width,
    height: Math.round(rowCount * labelSizePx * 1.55 + 12)
  };
}

function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

function rectRight(rect) {
  return rect.left + rect.width;
}

function rectBottom(rect) {
  return rect.top + rect.height;
}

function outsideRect(rect, boundary) {
  return (
    rectRight(rect) <= boundary.left ||
    rect.left >= rectRight(boundary) ||
    rectBottom(rect) <= boundary.top ||
    rect.top >= rectBottom(boundary)
  );
}

function shiftedPositions(base, min, max, step) {
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  const positions = [];
  const seen = new Set();

  for (const offset of offsets) {
    const value = Math.round(clamp(base + offset * step, min, max));
    if (!seen.has(value)) {
      seen.add(value);
      positions.push(value);
    }
  }

  return positions;
}

function candidateLabelRects(rect, size, viewport, gap) {
  const maxLeft = viewport.width - size.width - gap;
  const maxTop = viewport.height - size.height - gap;
  return [
    {
      position: "top",
      left: clamp(rect.left, gap, maxLeft),
      top: clamp(rect.top - size.height - gap, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "right",
      left: clamp(rect.left + rect.width + gap, gap, maxLeft),
      top: clamp(rect.top, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "bottom",
      left: clamp(rect.left, gap, maxLeft),
      top: clamp(rect.top + rect.height + gap, gap, maxTop),
      width: size.width,
      height: size.height
    },
    {
      position: "left",
      left: clamp(rect.left - size.width - gap, gap, maxLeft),
      top: clamp(rect.top, gap, maxTop),
      width: size.width,
      height: size.height
    }
  ];
}

function externalLabelRects(rect, size, viewport, boundary, gap) {
  const maxLeft = viewport.width - size.width - gap;
  const maxTop = viewport.height - size.height - gap;
  const rectCenterX = rect.left + rect.width / 2 - size.width / 2;
  const rectCenterY = rect.top + rect.height / 2 - size.height / 2;
  const verticalPositions = shiftedPositions(rectCenterY, gap, maxTop, size.height + 4);
  const horizontalPositions = shiftedPositions(rectCenterX, gap, maxLeft, size.width + 4);
  const candidates = [];

  const push = (position, left, top) => {
    const candidate = {
      position,
      left,
      top,
      width: size.width,
      height: size.height
    };
    if (outsideRect(candidate, boundary)) {
      candidates.push(candidate);
    }
  };

  const rightLeft = rectRight(boundary) + gap;
  if (rightLeft <= maxLeft) {
    for (const top of verticalPositions) {
      push("right", rightLeft, top);
    }
  }

  const leftLeft = boundary.left - size.width - gap;
  if (leftLeft >= gap) {
    for (const top of verticalPositions) {
      push("left", leftLeft, top);
    }
  }

  const bottomTop = rectBottom(boundary) + gap;
  if (bottomTop <= maxTop) {
    for (const left of horizontalPositions) {
      push("bottom", left, bottomTop);
    }
  }

  const topTop = boundary.top - size.height - gap;
  if (topTop >= gap) {
    for (const left of horizontalPositions) {
      push("top", left, topTop);
    }
  }

  return candidates;
}

function isListLikeElement(element) {
  const tag = String(element?.tagName || "").toUpperCase();
  if (["LI", "TR", "OPTION"].includes(tag)) {
    return true;
  }
  const parent = String(element?.parentElement?.tagName || "").toUpperCase();
  return ["UL", "OL", "TBODY", "THEAD", "TFOOT"].includes(parent);
}

export function shouldInspectElement(element) {
  const tagName = String(element?.tagName || "").toUpperCase();
  if (!tagName || SKIPPED_TAGS.has(tagName)) {
    return false;
  }

  const rect = getRect(element);
  if (toNumber(rect.width) < 2 || toNumber(rect.height) < 2) {
    return false;
  }

  const style = getStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") {
    return false;
  }
  if (toNumber(style.opacity || 1) === 0) {
    return false;
  }

  return true;
}

export function createBoxModel(element, style, settings) {
  const paddingValues = sideValues(style, "padding");
  const marginValues = sideValues(style, "margin");
  const borderValues = borderWidthValues(style);
  const paddingList = Object.values(paddingValues);
  const marginList = Object.values(marginValues);
  const borderList = Object.values(borderValues);
  const width = style.width ? roundedSize(style.width) : "";
  const height = style.height ? roundedSize(style.height) : "";
  const rowGap = style.rowGap || style.gap || "normal";
  const columnGap = style.columnGap || style.gap || "normal";

  return {
    size:
      settings.showSize && width && height
        ? {
            type: "size",
            value: tokenValue(element, ["size-", "w-", "h-"], `${width}×${height}`, style),
            width,
            height
          }
        : null,
    padding:
      settings.showPadding && hasUsefulSpacing(...paddingList)
        ? mapSides(paddingValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["pt-", "padding-t-", "p-"]
                : side === "right"
                  ? ["pr-", "px-", "padding-r-"]
                  : side === "bottom"
                    ? ["pb-", "padding-b-", "p-"]
                    : ["pl-", "px-", "padding-l-"],
              ["p-", "padding-"],
              value,
              paddingList,
              style
            )
          )
        : null,
    margin:
      settings.showMargin && hasUsefulSpacing(...marginList)
        ? mapSides(marginValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["mt-", "my-", "margin-t-", "m-"]
                : side === "right"
                  ? ["mr-", "mx-", "margin-r-"]
                  : side === "bottom"
                    ? ["mb-", "my-", "margin-b-", "m-"]
                    : ["ml-", "mx-", "margin-l-"],
              ["m-", "margin-"],
              value,
              marginList,
              style
            )
          )
        : null,
    border:
      settings.showBorder && hasUsefulSpacing(...borderList)
        ? mapSides(borderValues, (value, side) =>
            sideTokenValue(
              element,
              side === "top"
                ? ["border-t-", "border-"]
                : side === "right"
                  ? ["border-r-"]
                  : side === "bottom"
                    ? ["border-b-", "border-"]
                    : ["border-l-"],
              ["border-"],
              value,
              borderList,
              style
            )
          )
        : null,
    gap:
      settings.showGap && ((rowGap && rowGap !== "normal") || (columnGap && columnGap !== "normal"))
        ? {
            row: tokenValue(element, ["gap-y-", "gap-"], rowGap, style),
            column: tokenValue(element, ["gap-x-", "gap-"], columnGap, style)
          }
        : null
  };
}

export function dedupeRepeatedElements(items) {
  const seen = new Set();

  return items.filter((item) => {
    const signature = repeatedSignature(item);
    if (!signature) {
      return true;
    }

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

export function planLabelPlacements(items, options = {}) {
  const viewport = {
    width: options.viewportWidth || 1024,
    height: options.viewportHeight || 768
  };
  const labelSizePx = options.labelSize || 11;
  const gap = options.gap || 5;
  const occupied = [];

  return items.map((item, index) => {
    const size = labelSize(item.label, labelSizePx);
    const externalCandidates = options.avoidRect
      ? externalLabelRects(item.rect, size, viewport, options.avoidRect, gap)
      : [];
    const fallbackCandidates = candidateLabelRects(item.rect, size, viewport, gap);
    const candidates = externalCandidates.length
      ? [...externalCandidates, ...fallbackCandidates.filter((candidate) => outsideRect(candidate, options.avoidRect))]
      : fallbackCandidates;
    const placement =
      candidates.find((candidate) => !occupied.some((taken) => overlaps(candidate, taken))) ||
      {
        ...fallbackCandidates[0],
        top: clamp(fallbackCandidates[0].top + (index % 8) * (size.height + 3), gap, viewport.height - size.height - gap)
      };

    occupied.push(placement);
    return placement;
  });
}

export function createMetricRows(element, style, settings) {
  const rows = [];

  if (settings.showColor) {
    const textRow = visibleColorMetricRow(element, "text", ["text-"], style.color);
    if (textRow) {
      rows.push(textRow);
    }
    const bgRow = visibleColorMetricRow(element, "bg", ["bg-"], style.backgroundColor);
    if (bgRow) {
      rows.push(bgRow);
    }
    if (hasVisibleBorder(style)) {
      const borderRow = visibleColorMetricRow(element, "border", ["border-"], style.borderTopColor);
      if (borderRow) {
        rows.push(borderRow);
      }
    }
    if (style.boxShadow && style.boxShadow !== "none") {
      rows.push(
        colorMetricRow(
          element,
          "shadow",
          ["shadow-"],
          extractShadowColor(style.boxShadow),
          style.boxShadow
        )
      );
    }
    rows.push(...pseudoColorRows(element));
    return rows;
  }

  if (
    settings.showPadding &&
    hasUsefulSpacing(style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft)
  ) {
    const value = compactSides(
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft
    );
    rows.push({
      type: "padding",
      label: "padding",
      value: tokenValue(element, ["p-", "px-", "py-", "pt-", "pr-", "pb-", "pl-", "padding-"], value, style)
    });
  }

  if (
    settings.showMargin &&
    hasUsefulSpacing(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft)
  ) {
    const value = compactSides(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft);
    rows.push({
      type: "margin",
      label: "margin",
      value: tokenValue(element, ["m-", "mx-", "my-", "mt-", "mr-", "mb-", "ml-", "margin-"], value, style)
    });
  }

  const gapValue = style.gap || style.rowGap || style.columnGap;
  if ((settings.showPadding || settings.showMargin) && gapValue && gapValue !== "normal") {
    rows.push({
      type: "gap",
      label: "gap",
      value: tokenValue(element, ["gap-", "gap-x-", "gap-y-"], gapValue, style)
    });
  }

  if (settings.showSize) {
    const width = style.width ? roundedSize(style.width) : "";
    const height = style.height ? roundedSize(style.height) : "";
    if (width && height) {
      rows.push({
        type: "size",
        label: "size",
        value: tokenValue(element, ["size-", "w-", "h-"], `${width}×${height}`, style)
      });
    }
  }

  return rows;
}
