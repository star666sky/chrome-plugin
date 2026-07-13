const test = require("node:test");
const assert = require("node:assert/strict");

const { loadSourceModule } = require("./helpers/load-source-module");

test("passes the request AbortSignal to every Bitbucket fetch", async () => {
  const { fetchPullRequestDiff } = await loadSourceModule("src/bitbucket-client.js");
  const controller = new AbortController();
  const signals = [];

  globalThis.fetch = async (url, options = {}) => {
    signals.push(options.signal);
    if (String(url).includes("/commits")) return jsonResponse({ values: [], isLastPage: true });
    if (String(url).includes("/changes")) return jsonResponse({ values: [], isLastPage: true });
    if (String(url).includes("/diff")) return textResponse("diff --git a/a.js b/a.js");
    return jsonResponse({ id: 1, title: "PR" });
  };

  await fetchPullRequestDiff(
    { apiBase: "https://code.example/rest/api/latest/projects/P/repos/R/pull-requests/1" },
    { bitbucketAuthScheme: "Bearer", bitbucketToken: "token", contextLines: 3 },
    () => {},
    controller.signal
  );

  assert.equal(signals.length, 4);
  assert.ok(signals.every((signal) => signal === controller.signal));
});

function jsonResponse(value) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    async json() {
      return value;
    },
    async text() {
      return JSON.stringify(value);
    }
  };
}

function textResponse(value) {
  return {
    ok: true,
    headers: { get: () => "text/plain" },
    async text() {
      return value;
    }
  };
}
