const test = require("node:test");
const assert = require("node:assert/strict");

const { loadSourceModule } = require("./helpers/load-source-module");

test("builds Feishu task detail URLs from prefixed or numeric keys", async () => {
  const {
    FEISHU_TASK_DETAIL_URL_TEMPLATE,
    buildFeishuTaskUrl,
    normalizeFeishuTaskKey,
    validateFeishuTaskKey
  } = await loadSourceModule("src/feishu-task-url.js");

  assert.equal(FEISHU_TASK_DETAIL_URL_TEMPLATE, "https://project.feishu.cn/b2rl2h/issue/detail/{key}");
  assert.equal(normalizeFeishuTaskKey("m-7040569864"), "7040569864");
  assert.equal(normalizeFeishuTaskKey(" f-7028807610 "), "7028807610");
  assert.equal(normalizeFeishuTaskKey("7028807610"), "7028807610");
  assert.deepEqual(validateFeishuTaskKey(""), { valid: false, message: "请输入任务 key" });
  assert.equal(buildFeishuTaskUrl("m-7040569864"), "https://project.feishu.cn/b2rl2h/issue/detail/7040569864");
});
