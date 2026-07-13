import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("content script is configured for every injectable page", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
});
