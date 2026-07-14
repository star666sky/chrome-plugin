import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../src/shared/settings.js";

test("options page does not expose recent group name display setting", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.doesNotMatch(source, /showRecentGroupName/);
  assert.doesNotMatch(source, /显示最近分组名/);
});

test("floating ball remains visible unless edge hiding is explicitly enabled", () => {
  const source = readFileSync("src/content/content.js", "utf8");
  const optionsSource = readFileSync("src/options/options.js", "utf8");

  assert.equal(DEFAULT_SETTINGS.edgeHide, false);
  assert.doesNotMatch(source, /edgeHide\s*!==\s*false/);
  assert.match(source, /edgeHide\s*===\s*true/);
  assert.doesNotMatch(optionsSource, /edgeHide\s*!==\s*false/);
  assert.match(optionsSource, /edgeHide\s*===\s*true/);
});
