(function exposePullRequestUrlMatcher(globalScope) {
  const PULL_REQUEST_PATH_PATTERN = /\/projects\/[^/]+\/repos\/[^/]+\/pull-requests\/\d+(?:\/|$)/i;

  function isPullRequestPageUrl(input) {
    try {
      return PULL_REQUEST_PATH_PATTERN.test(new URL(input).pathname);
    } catch {
      return false;
    }
  }

  const api = { isPullRequestPageUrl };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.BitbucketPrAiReviewerUrl = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
