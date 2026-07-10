import {
  buildReviewPrompt,
  extractChatCompletionText,
  parseReviewResponse
} from "./review-engine.js";

export async function reviewDiffChunk({
  settings,
  pullRequest,
  pullRequestInfo,
  commits,
  changedFiles,
  diffChunk,
  chunkIndex,
  totalChunks
}) {
  const prompt = buildReviewPrompt({
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffChunk,
    chunkIndex,
    totalChunks,
    reviewRules: settings.reviewRules
  });

  const response = await fetch(`${settings.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.deepseekApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.deepseekModel,
      messages: [
        {
          role: "system",
          content: prompt.system
        },
        {
          role: "user",
          content: prompt.user
        }
      ],
      temperature: 0.1,
      response_format: {
        type: "json_object"
      }
    })
  });

  if (!response.ok) {
    throw new Error(await formatDeepSeekError(response));
  }

  const payload = await response.json();
  const text = extractChatCompletionText(payload);
  const findings = parseReviewResponse(text);

  return {
    findings,
    rawText: text
  };
}

async function formatDeepSeekError(response) {
  const text = await response.text().catch(() => "");
  const preview = text ? ` ${text.slice(0, 500)}` : "";
  return `DeepSeek review request failed: HTTP ${response.status}.${preview}`;
}
