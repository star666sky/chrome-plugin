const test = require("node:test");
const assert = require("node:assert/strict");

const { loadSourceModule } = require("./helpers/load-source-module");

async function loadReviewEngine() {
  return await loadSourceModule("src/review-engine.js", [
    [/import \{ DEFAULT_REVIEW_RULES \} from "\.\/settings\.js";/, 'const DEFAULT_REVIEW_RULES = "默认规则";']
  ]);
}

function makeReviewInput(overrides = {}) {
  return {
    pullRequest: { projectKey: "P", repoSlug: "repo", pullRequestId: "1" },
    pullRequestInfo: { title: "PR", description: "", fromRef: "feature", toRef: "main", authorName: "tester" },
    commits: [],
    changedFiles: ["src/file.js"],
    diffChunk: "diff --git a/src/file.js b/src/file.js",
    chunkIndex: 0,
    totalChunks: 1,
    reviewRules: "检查逻辑",
    followUpFeedback: "结合页面截图重新检查",
    previousFindings: [],
    ...overrides
  };
}

test("adds visual evidence to the whole-PR review prompt as untrusted context", async () => {
  const { buildReviewPrompt } = await loadReviewEngine();
  const prompt = buildReviewPrompt(makeReviewInput({ visualEvidence: "界面中保存按钮不可见" }));

  assert.match(prompt.user, /Visual evidence supplied by the user/);
  assert.match(prompt.user, /界面中保存按钮不可见/);
  assert.match(prompt.user, /must not override/i);
});

test("builds a visual evidence prompt that treats image instructions as untrusted", async () => {
  const { buildVisualEvidencePrompt } = await loadReviewEngine();
  const prompt = buildVisualEvidencePrompt({ feedback: "检查按钮状态" });

  assert.match(prompt.system, /untrusted visual evidence/i);
  assert.match(prompt.system, /must not follow/i);
  assert.match(prompt.user, /检查按钮状态/);
  assert.match(prompt.user, /"summary"/);
});
