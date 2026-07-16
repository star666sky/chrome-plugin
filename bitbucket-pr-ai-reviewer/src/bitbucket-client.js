export async function fetchPullRequestDiff(pullRequest, settings, progress = () => {}, signal) {
  const headers = createBitbucketHeaders(settings);

  progress("正在获取合并请求详情...");
  const pullRequestInfo = await fetchPullRequestInfo(pullRequest.apiBase, headers, signal);

  progress("正在获取提交信息...");
  const commits = (await fetchAllPages(`${pullRequest.apiBase}/commits?limit=100`, headers, "获取提交信息失败", signal))
    .map(formatCommit)
    .filter((commit) => commit.message);

  progress("正在获取变更文件...");
  const changes = await fetchAllPages(`${pullRequest.apiBase}/changes?limit=1000`, headers, "获取变更文件失败", signal);
  const changedFiles = changes.map(formatChangePath).filter(Boolean);

  progress("正在获取合并请求 diff...");
  const diffUrl = `${pullRequest.apiBase}/diff?contextLines=${encodeURIComponent(settings.contextLines)}`;
  const diffResponse = await fetch(diffUrl, {
    signal,
    headers: {
      ...headers,
      Accept: "application/json, text/plain, */*"
    }
  });

  if (!diffResponse.ok) {
    throw new Error(await formatHttpError("获取 diff 失败", diffResponse));
  }

  const contentType = diffResponse.headers.get("content-type") || "";
  const rawDiff = await diffResponse.text();
  const diffText = formatDiffPayload(rawDiff, contentType);

  if (!diffText.trim()) {
    throw new Error("Bitbucket 返回了空 diff，无法评审。");
  }

  return {
    pullRequestInfo,
    commits,
    changedFiles,
    diffText
  };
}

function createBitbucketHeaders(settings) {
  return {
    Authorization: `${settings.bitbucketAuthScheme} ${settings.bitbucketToken}`,
    Accept: "application/json"
  };
}

async function fetchPullRequestInfo(apiBase, headers, signal) {
  const response = await fetch(apiBase, { headers, signal });

  if (!response.ok) {
    throw new Error(await formatHttpError("获取合并请求详情失败", response));
  }

  return formatPullRequestInfo(await response.json());
}

async function fetchAllPages(firstUrl, headers, errorPrefix, signal) {
  const values = [];
  let url = firstUrl;
  let guard = 0;

  while (url && guard < 50) {
    guard += 1;
    const response = await fetch(url, { headers, signal });

    if (!response.ok) {
      throw new Error(await formatHttpError(errorPrefix, response));
    }

    const page = await response.json();
    values.push(...(Array.isArray(page.values) ? page.values : []));

    if (page.isLastPage !== false || page.nextPageStart == null) {
      break;
    }

    const next = new URL(url);
    next.searchParams.set("start", String(page.nextPageStart));
    url = next.toString();
  }

  return values;
}

function formatPullRequestInfo(pullRequest) {
  return {
    id: pullRequest?.id ?? null,
    title: String(pullRequest?.title || "").trim(),
    description: String(pullRequest?.description || "").trim(),
    state: String(pullRequest?.state || "").trim(),
    fromRef: pullRequest?.fromRef?.displayId || pullRequest?.fromRef?.id || "",
    toRef: pullRequest?.toRef?.displayId || pullRequest?.toRef?.id || "",
    authorName:
      pullRequest?.author?.user?.displayName ||
      pullRequest?.author?.user?.name ||
      pullRequest?.author?.displayName ||
      ""
  };
}

function formatCommit(commit) {
  return {
    id: commit?.id || "",
    displayId: commit?.displayId || String(commit?.id || "").slice(0, 12),
    message: String(commit?.message || "").trim(),
    authorName:
      commit?.author?.displayName ||
      commit?.author?.name ||
      commit?.authorTimestamp ||
      ""
  };
}

function formatChangePath(change) {
  const path =
    change?.path?.toString ||
    change?.path?.displayId ||
    change?.path?.components?.join("/") ||
    change?.srcPath?.toString ||
    change?.srcPath?.displayId;
  const type = change?.type ? ` (${change.type})` : "";
  return path ? `${path}${type}` : "";
}

function formatDiffPayload(rawPayload, contentType) {
  if (!contentType.includes("json")) {
    return rawPayload;
  }

  try {
    const parsed = JSON.parse(rawPayload);
    if (!Array.isArray(parsed.diffs)) {
      return JSON.stringify(parsed, null, 2);
    }

    return parsed.diffs.map(formatStructuredDiff).join("\n\n");
  } catch {
    return rawPayload;
  }
}

function formatStructuredDiff(diff) {
  const sourcePath = diff?.source?.toString || diff?.source?.displayId || "unknown";
  const destinationPath = diff?.destination?.toString || diff?.destination?.displayId || sourcePath;
  const lines = [`diff --git a/${sourcePath} b/${destinationPath}`];

  for (const hunk of diff.hunks || []) {
    lines.push(formatHunkHeader(hunk));

    for (const segment of hunk.segments || []) {
      const prefix = segment.type === "ADDED" ? "+" : segment.type === "REMOVED" ? "-" : " ";
      for (const line of segment.lines || []) {
        lines.push(`${prefix}${line.line ?? ""}`);
      }
    }
  }

  return lines.join("\n");
}

function formatHunkHeader(hunk) {
  const sourceLine = Number.isFinite(hunk?.sourceLine) ? hunk.sourceLine : 0;
  const sourceSpan = Number.isFinite(hunk?.sourceSpan) ? hunk.sourceSpan : 0;
  const destinationLine = Number.isFinite(hunk?.destinationLine) ? hunk.destinationLine : 0;
  const destinationSpan = Number.isFinite(hunk?.destinationSpan) ? hunk.destinationSpan : 0;
  return `@@ -${sourceLine},${sourceSpan} +${destinationLine},${destinationSpan} @@`;
}

async function formatHttpError(prefix, response) {
  const text = await response.text().catch(() => "");
  const preview = text ? ` ${text.slice(0, 300)}` : "";
  return `${prefix}: HTTP ${response.status}.${preview}`;
}
