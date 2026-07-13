export function parsePullRequestUrl(input) {
  const url = new URL(input);
  const match = url.pathname.match(
    /\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)(?:\/|$)/i
  );

  if (!match) {
    throw new Error("当前页面不是 Bitbucket 合并请求页面。");
  }

  const projectKey = decodeURIComponent(match[1]);
  const repoSlug = decodeURIComponent(match[2]);
  const pullRequestId = match[3];
  const encodedProject = encodeURIComponent(projectKey);
  const encodedRepo = encodeURIComponent(repoSlug);

  return {
    origin: url.origin,
    projectKey,
    repoSlug,
    pullRequestId,
    apiBase: `${url.origin}/rest/api/latest/projects/${encodedProject}/repos/${encodedRepo}/pull-requests/${pullRequestId}`
  };
}
