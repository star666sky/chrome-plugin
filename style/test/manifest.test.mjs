import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest declares all-url content access, options, and action toggle", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(manifest.options_page, "src/options/options.html");
  assert.equal(Boolean(manifest.action), true);
  assert.equal(manifest.content_scripts[0].matches.includes("<all_urls>"), true);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content.js"]);
  assert.equal(
    manifest.web_accessible_resources[0].resources.includes("src/shared/inspector.js"),
    true
  );
});
