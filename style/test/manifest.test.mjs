import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest declares all-url content access, options, and action toggle", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.equal(manifest.options_page, "src/options/options.html");
  assert.equal(Boolean(manifest.action), true);
  assert.deepEqual(manifest.icons, {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  });
  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  for (const iconPath of Object.values(manifest.icons)) {
    const icon = await readFile(new URL(`../${iconPath}`, import.meta.url));
    assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  assert.equal(manifest.content_scripts[0].matches.includes("<all_urls>"), true);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/content/content.js"]);
  assert.equal(
    manifest.web_accessible_resources[0].resources.includes("src/shared/inspector.js"),
    true
  );
});
