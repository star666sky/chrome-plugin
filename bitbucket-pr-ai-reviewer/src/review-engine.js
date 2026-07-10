import { DEFAULT_REVIEW_RULES } from "./settings.js";

const ALLOWED_SEVERITIES = new Set(["urgent", "suggestion"]);

export const REVIEW_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: {
            type: "string",
            enum: ["urgent", "suggestion"]
          },
          filePath: {
            type: "string"
          },
          line: {
            type: ["integer", "null"]
          },
          title: {
            type: "string"
          },
          detail: {
            type: "string"
          },
          suggestion: {
            type: "string"
          }
        },
        required: ["severity", "filePath", "line", "title", "detail", "suggestion"]
      }
    }
  },
  required: ["findings"]
};

export function chunkDiff(diff, maxChars = 12000) {
  const text = String(diff || "").trim();
  const size = Math.max(1, Number.parseInt(maxChars, 10) || 12000);

  if (!text) return [];

  const sections = text.split(/\n(?=diff --git )/g);
  const chunks = [];
  let current = "";

  for (const section of sections) {
    if (section.length > size) {
      flushCurrent();
      chunks.push(...chunkByLines(section, size));
      continue;
    }

    const next = current ? `${current}\n${section}` : section;
    if (next.length > size) {
      flushCurrent();
      current = section;
    } else {
      current = next;
    }
  }

  flushCurrent();
  return chunks;

  function flushCurrent() {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  }
}

export function buildReviewPrompt({
  pullRequest,
  pullRequestInfo,
  commits,
  changedFiles,
  diffChunk,
  chunkIndex,
  totalChunks,
  reviewRules
}) {
  const files = (changedFiles || []).map(formatChangedFile).join("\n") || "No changed file list was available.";
  const commitMessages = formatCommits(commits);
  const rules = String(reviewRules || DEFAULT_REVIEW_RULES).trim();

  return {
    system: [
      "You are a senior code reviewer.",
      "Review only the supplied pull request diff chunk.",
      "Find concrete issues that a developer should act on before merging.",
      "Do not invent files, lines, or behavior outside the diff.",
      "Return only valid JSON matching the requested schema."
    ].join(" "),
    user: [
      `Pull request: ${pullRequest.projectKey}/${pullRequest.repoSlug}#${pullRequest.pullRequestId}`,
      `Chunk: ${chunkIndex + 1} of ${totalChunks}`,
      "",
      "Pull request context:",
      `PR title: ${pullRequestInfo?.title || "Unknown"}`,
      `PR description: ${pullRequestInfo?.description || "No description"}`,
      `Source branch: ${pullRequestInfo?.fromRef || "Unknown"}`,
      `Target branch: ${pullRequestInfo?.toRef || "Unknown"}`,
      `Author: ${pullRequestInfo?.authorName || "Unknown"}`,
      "",
      "Commit messages:",
      commitMessages,
      "",
      "Review focus:",
      "先根据 PR 标题、描述和 commit message 判断这次提交想解决什么，再审查 diff 是否真正满足这个目的。",
      "尤其关注逻辑问题、行为回归、边界条件、接口契约不一致、状态流转错误、权限范围变化和缺少必要测试。",
      "如果代码实现与提交目的不一致，或者可能引入新逻辑问题，请优先作为 urgent 输出。",
      "",
      "Changed files:",
      files,
      "",
      "Review rules:",
      rules,
      "",
      "Return JSON exactly in this shape:",
      '{"findings":[{"severity":"urgent|suggestion","filePath":"path/to/file","line":123,"title":"short title","detail":"why this matters","suggestion":"specific fix"}]}',
      "Use null for line when the line is unclear. Use an empty findings array when no issues are found.",
      "Output language rule: except code snippets, file paths, identifiers, API names, component names, library names, command names, and other proper nouns, write title, detail, and suggestion in UTF-8 Simplified Chinese.",
      "",
      "Diff chunk:",
      "```diff",
      diffChunk,
      "```"
    ].join("\n")
  };
}

export function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string") return response.output_text;

  const pieces = [];
  for (const output of response.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") {
        pieces.push(content.text);
      } else if (typeof content.output_text === "string") {
        pieces.push(content.output_text);
      }
    }
  }

  return pieces.join("\n").trim();
}

export function extractChatCompletionText(response) {
  if (!response) return "";
  const firstChoice = Array.isArray(response.choices) ? response.choices[0] : null;
  const content = firstChoice?.message?.content ?? firstChoice?.delta?.content ?? "";

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }

  return String(content || "").trim();
}

export function parseReviewResponse(text) {
  try {
    return normalizeFindings(JSON.parse(text));
  } catch (error) {
    const preview = String(text || "").slice(0, 500);
    throw new Error(`DeepSeek returned malformed JSON. Preview: ${preview}`);
  }
}

export function normalizeFindings(input) {
  const rawFindings = Array.isArray(input) ? input : input?.findings;
  if (!Array.isArray(rawFindings)) return [];

  return rawFindings
    .map((finding) => {
      const severity = String(finding?.severity || "").toLowerCase();
      const title = String(finding?.title || "").trim();
      const detail = String(finding?.detail || "").trim();
      const suggestion = String(finding?.suggestion || "").trim();
      const filePath = String(finding?.filePath || finding?.path || "").trim();
      const parsedLine = Number.parseInt(finding?.line, 10);

      if (!ALLOWED_SEVERITIES.has(severity) || !title) {
        return null;
      }

      return {
        severity,
        filePath,
        line: Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : null,
        title,
        detail,
        suggestion
      };
    })
    .filter(Boolean);
}

export function mergeFindings(chunks) {
  return chunks.flatMap((chunk) => chunk.findings || []);
}

function chunkByLines(text, size) {
  const chunks = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > size && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function formatChangedFile(file) {
  if (typeof file === "string") return `- ${file}`;

  const path =
    file?.path?.toString ||
    file?.path ||
    file?.srcPath?.toString ||
    file?.srcPath ||
    file?.displayId ||
    "unknown";
  const type = file?.type ? ` (${file.type})` : "";
  return `- ${path}${type}`;
}

function formatCommits(commits) {
  if (!Array.isArray(commits) || !commits.length) {
    return "No commit messages were available.";
  }

  return commits
    .slice(0, 30)
    .map((commit) => {
      const id = commit.displayId || commit.id || "unknown";
      const message = String(commit.message || "").trim().replace(/\s+/g, " ");
      return `- ${id}: ${message || "No commit message"}`;
    })
    .join("\n");
}
