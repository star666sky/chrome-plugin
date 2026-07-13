const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/image-attachments");
const { loadSourceModule } = require("./helpers/load-source-module");

function installChromeStub() {
  globalThis.chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: { onMessage: { addListener() {} }, openOptionsPage: async () => {} },
    tabs: { sendMessage: () => Promise.resolve() },
    storage: {
      local: {
        async get() {
          return {
            bitbucketToken: "token",
            deepseekApiKey: "key",
            deepseekModel: "vision-model"
          };
        },
        async set() {}
      }
    }
  };
}

async function loadServiceWorker(deps) {
  globalThis.__reviewRequestTestDeps = deps;
  installChromeStub();

  return await loadSourceModule("src/service-worker.js", [
    [/import \{ fetchPullRequestDiff \} from "\.\/bitbucket-client\.js";/, "const { fetchPullRequestDiff } = globalThis.__reviewRequestTestDeps;"],
    [/import \{ extractVisualEvidence, reviewDiffChunk, reviewFindingFeedback \} from "\.\/deepseek-client\.js";/, "const { extractVisualEvidence, reviewDiffChunk, reviewFindingFeedback } = globalThis.__reviewRequestTestDeps;"],
    [/import \{ chunkDiff, mergeFindings \} from "\.\/review-engine\.js";/, "const { chunkDiff, mergeFindings } = globalThis.__reviewRequestTestDeps;"],
    [/import \{[\s\S]*?\} from "\.\/review-history\.js";/, `
      const REVIEW_HISTORY_KEY = "bbai-review-history";
      const {
        createReviewKey,
        createReviewRecord,
        findLatestReviewForPullRequest,
        updateReviewRecord,
        upsertReviewHistory
      } = globalThis.__reviewRequestTestDeps;
    `],
    [/import \{ normalizeSettings, validateSettings \} from "\.\/settings\.js";/, "const { normalizeSettings, validateSettings } = globalThis.__reviewRequestTestDeps;"],
    [/import \{ parsePullRequestUrl \} from "\.\/url\.js";/, "const { parsePullRequestUrl } = globalThis.__reviewRequestTestDeps;"],
    [/import "\.\/image-attachments\.js";/, ""]
  ]);
}

function makeDeps() {
  const calls = {
    extractVisualEvidence: 0,
    reviewDiffChunk: []
  };

  return {
    calls,
    async fetchPullRequestDiff() {
      return {
        pullRequestInfo: { title: "PR" },
        commits: [],
        changedFiles: ["src/a.js"],
        diffText: "diff --git a/src/a.js b/src/a.js"
      };
    },
    async extractVisualEvidence() {
      calls.extractVisualEvidence += 1;
      return "截图显示保存按钮处于禁用状态";
    },
    async reviewDiffChunk(input) {
      calls.reviewDiffChunk.push(input);
      return { findings: [] };
    },
    async reviewFindingFeedback() {
      return { verdict: "confirmed", response: "仍然成立", finding: null };
    },
    chunkDiff() {
      return ["chunk-1", "chunk-2"];
    },
    mergeFindings() {
      return [];
    },
    createReviewKey() {
      return "review-key";
    },
    createReviewRecord({ result }) {
      return { id: "record-1", reviewKey: "review-key", reviewedAt: "now", result };
    },
    findLatestReviewForPullRequest() {
      return null;
    },
    updateReviewRecord(record, result) {
      return { ...record, result };
    },
    upsertReviewHistory(history, record) {
      return [record, ...history];
    },
    normalizeSettings(value) {
      return { maxDiffCharsPerChunk: 12000, ...value };
    },
    validateSettings(value) {
      return { maxDiffCharsPerChunk: 12000, ...value };
    },
    parsePullRequestUrl() {
      return { origin: "https://code.example", projectKey: "P", repoSlug: "repo", pullRequestId: "1" };
    }
  };
}

function makeImage() {
  return {
    type: "image/png",
    dataUrl: "data:image/png;base64,AQID",
    name: "must-not-persist.png"
  };
}

test("whole-PR image feedback extracts visual evidence once and reuses its text for every chunk", async () => {
  const deps = makeDeps();
  const { reviewCurrentPullRequest } = await loadServiceWorker(deps);
  const response = await reviewCurrentPullRequest("https://code.example/pr/1", 1, {
    feedback: "结合截图检查按钮状态",
    baseReviewId: "",
    requestId: "request-1",
    images: [makeImage()],
    signal: new AbortController().signal
  });

  assert.equal(deps.calls.extractVisualEvidence, 1);
  assert.equal(deps.calls.reviewDiffChunk.length, 2);
  assert.deepEqual(deps.calls.reviewDiffChunk.map((call) => call.visualEvidence), [
    "截图显示保存按钮处于禁用状态",
    "截图显示保存按钮处于禁用状态"
  ]);
  assert.doesNotMatch(JSON.stringify(response), /data:image|must-not-persist|"images"/);
});

test("cancelling a request aborts its active signal", async () => {
  const deps = makeDeps();
  const { cancelReviewRequest, runReviewRequest } = await loadServiceWorker(deps);
  const operation = runReviewRequest("request-cancel", (signal) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  );

  cancelReviewRequest("request-cancel");

  await assert.rejects(operation, (error) => error?.name === "AbortError");
});
