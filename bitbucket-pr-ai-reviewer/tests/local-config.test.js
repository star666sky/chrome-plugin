const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..");

test("loads local default settings from the extension root", async () => {
  const settingsSource = await fs.readFile(path.join(ROOT, "src", "settings.js"), "utf8");
  const gitignore = await fs.readFile(path.resolve(ROOT, "..", ".gitignore"), "utf8");
  const example = await fs.readFile(path.join(ROOT, "local-default-settings.example.js"), "utf8");

  assert.match(settingsSource, /from "\.\.\/local-default-settings\.js"/);
  assert.match(gitignore, /^bitbucket-pr-ai-reviewer\/local-default-settings\.js$/m);
  assert.doesNotMatch(example, /bitbucketToken:\s*"[^"]+"/);
  assert.doesNotMatch(example, /deepseekApiKey:\s*"[^"]+"/);
});
