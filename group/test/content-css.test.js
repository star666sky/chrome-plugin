import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content stylesheet preserves hidden elements over component display rules", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#group-extension-root\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i);
});

test("drag insert indicators render as highlighted lines", () => {
  const contentCss = readFileSync("src/content/content.css", "utf8");
  const optionsCss = readFileSync("src/options/options.css", "utf8");

  for (const css of [contentCss, optionsCss]) {
    assert.match(css, /group-drop-before::before/);
    assert.match(css, /group-drop-after::after/);
    assert.match(css, /height:\s*2px/);
  }
});
