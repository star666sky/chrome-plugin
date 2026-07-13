import {
  buildFindingFeedbackPrompt,
  buildReviewPrompt,
  extractChatCompletionText,
  parseFindingFeedbackResponse,
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
  totalChunks,
  followUpFeedback = "",
  previousFindings = []
}) {
  const prompt = buildReviewPrompt({
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffChunk,
    chunkIndex,
    totalChunks,
    reviewRules: settings.reviewRules,
    followUpFeedback,
    previousFindings
  });

  const text = await requestJsonCompletion(settings, prompt);
  const findings = parseReviewResponse(text);

  return {
    findings,
    rawText: text
  };
}

export async function reviewFindingFeedback({
  settings,
  pullRequest,
  pullRequestInfo,
  commits,
  changedFiles,
  diffText,
  finding,
  category,
  feedback,
  feedbackRounds
}) {
  const prompt = buildFindingFeedbackPrompt({
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    diffText,
    finding,
    category,
    feedback,
    feedbackRounds,
    reviewRules: settings.reviewRules
  });

  const text = await requestJsonCompletion(settings, prompt);
  return {
    ...parseFindingFeedbackResponse(text),
    rawText: text
  };
}

async function requestJsonCompletion(settings, prompt) {
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
  return extractChatCompletionText(payload);
}

async function formatDeepSeekError(response) {
  const text = await response.text().catch(() => "");
  const preview = text ? ` ${text.slice(0, 500)}` : "";
  return `DeepSeek 评审请求失败：HTTP ${response.status}.${preview}`;
}
