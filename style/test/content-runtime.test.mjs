import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("content runtime toggles by message and lazy-loads the inspector module", async () => {
  const source = await readFile(new URL("../src/content/content.js", import.meta.url), "utf8");

  assert.equal(source.includes("STYLE_TOGGLE_INSPECTOR"), true);
  assert.equal(source.includes("STYLE_SETTINGS_UPDATED"), true);
  assert.equal(source.includes("chrome.runtime.getURL(\"src/shared/inspector.js\")"), true);
  assert.equal(source.includes("__style_inspector_root__"), true);
  assert.equal(source.includes("selectedElement"), true);
  assert.equal(source.includes("selectionScope"), true);
  assert.equal(source.includes("getSelectedElements"), true);
  assert.equal(source.includes("const selectedItem = buildItem(inspector, element);"), true);
  assert.equal(source.includes("inspector.filterInformativeItems"), true);
  assert.equal(source.includes("bringOverlayLabelToFront"), true);
  assert.equal(source.includes("planLabelPlacements"), true);
  assert.equal(source.includes("applyLabelPlacement"), true);
  assert.equal(source.includes("createConnector"), true);
  assert.equal(source.includes("avoidRect"), true);
  assert.equal(source.includes("style-inspector-connector"), true);
  assert.equal(source.includes("box.append(label);"), true);
  assert.equal(source.includes("data-style-inspector-key"), true);
  assert.equal(source.includes(" / ${count}"), false);
  assert.equal(source.includes("boundary.append(label)"), false);
  assert.equal(source.includes("style-inspector-value-list"), true);
  assert.equal(source.includes("style-inspector-value-row"), true);
  assert.equal(source.includes("line.style.setProperty(\"--si-row-color\", layerColor(row.type));"), true);
  assert.equal(source.includes("style-inspector-color-card"), true);
  assert.equal(source.includes("style-inspector-color-row"), true);
  assert.equal(source.includes("style-inspector-color-swatch"), true);
  assert.equal(source.includes("bindLabelHover"), true);
  assert.equal(source.includes("is-label-hover"), true);
  assert.match(
    source,
    /function renderSelectedSelf\(inspector, item\)[\s\S]*settings\.showColor[\s\S]*renderOverlayItems\(inspector, \[item\], "selected-child"\)[\s\S]*renderBoxModelLayers\(item, item\.model\)[\s\S]*renderOverlayItems\(inspector, \[item\], "selected-child"\)/
  );
  assert.equal(source.includes("root.replaceChildren(renderSelectedSelf(inspector, items[0]))"), true);
  assert.equal(source.includes("model.size?.value || \"content\""), false);
  assert.equal(source.includes("querySelectorAll(\"*\")"), true);
  assert.equal(source.includes("\"click\""), true);
  assert.equal(source.includes("\"keydown\""), true);
});

test("content css keeps overlays fixed and transparent to page interaction", async () => {
  const source = await readFile(new URL("../src/content/content.css", import.meta.url), "utf8");

  assert.equal(source.includes("#__style_inspector_root__"), true);
  assert.match(source, /pointer-events:\s*none/);
  assert.match(source, /position:\s*fixed/);
  assert.equal(source.includes("style-inspector-layer-margin"), true);
  assert.equal(source.includes("style-inspector-layer-padding"), true);
  assert.equal(source.includes("style-inspector-layer-border"), true);
  assert.equal(source.includes("style-inspector-gap-line"), true);
  assert.equal(source.includes("is-front"), true);
  assert.equal(source.includes("is-top"), true);
  assert.equal(source.includes("is-right"), true);
  assert.equal(source.includes("is-bottom"), true);
  assert.equal(source.includes("is-left"), true);
  assert.equal(source.includes("background: color-mix(in srgb, var(--si-accent)"), true);
  assert.equal(source.includes("background: color-mix(in srgb, var(--si-layer-accent)"), true);
  assert.equal(source.includes("background: color-mix(in srgb, var(--si-theme-accent)"), true);
  assert.equal(source.includes(".style-inspector-value-list"), true);
  assert.equal(source.includes(".style-inspector-value-row"), true);
  assert.equal(source.includes("var(--si-row-color)"), true);
  assert.match(source, /\.style-inspector-value-list[\s\S]*background:\s*transparent/);
  assert.match(source, /\.style-inspector-value-list[\s\S]*border:\s*0/);
  assert.match(source, /\.style-inspector-value-list[\s\S]*box-shadow:\s*none/);
  assert.equal(source.includes("background: rgba(15, 23, 42, 0.92);"), false);
  assert.equal(source.includes("border-color: var(--si-size);"), false);
  assert.equal(source.includes(".style-inspector-color-card"), true);
  assert.equal(source.includes(".style-inspector-color-row"), true);
  assert.equal(source.includes(".style-inspector-color-swatch"), true);
  assert.equal(source.includes(".style-inspector-connector"), true);
  assert.equal(source.includes(".style-inspector-box.is-label-hover"), true);
  assert.match(source, /\.style-inspector-label[\s\S]*pointer-events:\s*auto/);
  assert.match(source, /\.style-inspector-label\.is-top::after[\s\S]*width:\s*1px/);
  assert.match(source, /\.style-inspector-label\.is-right::after[\s\S]*height:\s*1px/);
  assert.match(source, /\.style-inspector-box\.is-selected-child \.style-inspector-label[\s\S]*opacity:\s*1/);
  assert.match(source, /\.style-inspector-box\.is-selected-child \.style-inspector-label[\s\S]*visibility:\s*visible/);
  assert.equal(/\.style-inspector-box\.is-selected-child \.style-inspector-label[\s\S]*opacity:\s*0/.test(source), false);
  assert.equal(/\.style-inspector-box\.is-selected-child \.style-inspector-label[\s\S]*visibility:\s*hidden/.test(source), false);
  assert.equal(source.includes(".style-inspector-label::after"), true);
  assert.match(source, /\.style-inspector-box\.is-front[\s\S]*z-index/);
});
