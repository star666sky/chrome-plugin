import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content stylesheet preserves hidden elements over component display rules", () => {
  const css = readFileSync("src/content/content.css", "utf8");

  assert.match(css, /#group-extension-root\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i);
});
