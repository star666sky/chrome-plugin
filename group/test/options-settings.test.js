import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("options page does not expose recent group name display setting", () => {
  const source = readFileSync("src/options/options.js", "utf8");

  assert.doesNotMatch(source, /showRecentGroupName/);
  assert.doesNotMatch(source, /显示最近分组名/);
});
