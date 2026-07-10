export const REVIEW_HISTORY_KEY = "bbai-review-history";
export const MAX_REVIEW_HISTORY = 3;

export function createReviewKey(pullRequest) {
  return [
    pullRequest?.origin || "",
    pullRequest?.projectKey || "",
    pullRequest?.repoSlug || "",
    pullRequest?.pullRequestId || ""
  ].join("|");
}

export function createReviewRecord({ url, result, reviewedAt = new Date().toISOString() }) {
  const reviewKey = createReviewKey(result?.pullRequest);
  const id = `${reviewedAt}-${reviewKey}`;
  const findings = Array.isArray(result?.findings) ? result.findings : [];

  return {
    id,
    reviewKey,
    reviewedAt,
    url,
    title: result?.pullRequestInfo?.title || `${result?.pullRequest?.repoSlug || "PR"}#${result?.pullRequest?.pullRequestId || ""}`,
    urgentCount: findings.filter((finding) => finding.severity === "urgent").length,
    suggestionCount: findings.filter((finding) => finding.severity === "suggestion").length,
    result
  };
}

export function upsertReviewHistory(history, record, limit = MAX_REVIEW_HISTORY) {
  const next = [record, ...(Array.isArray(history) ? history : []).filter((item) => item?.id !== record.id)]
    .filter(isValidRecord)
    .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)));

  return next.slice(0, limit);
}

export function findLatestReviewForPullRequest(history, pullRequest) {
  const reviewKey = createReviewKey(pullRequest);

  return (Array.isArray(history) ? history : []).find((record) => record?.reviewKey === reviewKey) || null;
}

function isValidRecord(record) {
  return Boolean(record?.id && record?.reviewKey && record?.reviewedAt && record?.result);
}
