import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("options page exposes display, selection, and visual controls", async () => {
  const html = await readFile(new URL("../src/options/options.html", import.meta.url), "utf8");

  for (const id of [
    "showPadding",
    "showMargin",
    "showSize",
    "showFont",
    "showColor",
    "selectionDescendants",
    "selectionSelf",
    "opacity",
    "labelSize",
    "highlightColor",
    "maxAnnotations",
    "paddingColor",
    "marginColor",
    "borderColor",
    "gapColor"
  ]) {
    assert.equal(html.includes(`id="${id}"`), true);
  }

  assert.equal(html.includes('name="mode"'), false);
  assert.equal(html.includes('value="global"'), false);
  assert.equal(html.includes('value="hover"'), false);
});

test("options script saves settings and broadcasts live overlay refresh", async () => {
  const source = await readFile(new URL("../src/options/options.js", import.meta.url), "utf8");

  assert.equal(source.includes("saveSettings"), true);
  assert.equal(source.includes("STYLE_SETTINGS_UPDATED"), true);
  assert.equal(source.includes("selectionScope"), true);
  assert.equal(source.includes("showFont"), true);
  assert.equal(source.includes("modeGlobal"), false);
  assert.equal(source.includes("modeHover"), false);
  assert.equal(source.includes("mode:"), false);
  assert.equal(source.includes("chrome.tabs.query"), true);
});

test("options page uses available width instead of a narrow scrolling column", async () => {
  const css = await readFile(new URL("../src/options/options.css", import.meta.url), "utf8");

  assert.equal(css.includes("width: 360px"), false);
  assert.match(css, /\.shell[\s\S]*grid-template-columns/);
  assert.match(css, /@media\s*\(max-width/);
});
