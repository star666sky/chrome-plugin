import {
  buildFindingFeedbackPrompt,
  buildReviewPrompt,
  buildVisualEvidencePrompt,
  extractChatCompletionText,
  parseFindingFeedbackResponse,
  parseReviewResponse,
  parseVisualEvidenceResponse
} from "./review-engine.js";
import "./image-attachments.js";

const ImageAttachments = globalThis.BitbucketPrAiReviewerImages;

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
  previousFindings = [],
  visualEvidence = "",
  signal
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
    previousFindings,
    visualEvidence
  });

  const text = await requestJsonCompletion(settings, prompt, { signal });
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
  feedbackRounds,
  images = [],
  signal
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

  const text = await requestJsonCompletion(settings, prompt, { images, signal });
  return {
    ...parseFindingFeedbackResponse(text),
    rawText: text
  };
}

export async function extractVisualEvidence({ settings, feedback, images, signal }) {
  const prompt = buildVisualEvidencePrompt({ feedback });
  const text = await requestJsonCompletion(settings, prompt, { images, signal });
  return parseVisualEvidenceResponse(text);
}

export function buildChatCompletionBody(settings, prompt, images = []) {
  return {
    model: settings.deepseekModel,
    messages: [
      {
        role: "system",
        content: prompt.system
      },
      {
        role: "user",
        content: ImageAttachments.buildUserContent(prompt.user, images)
      }
    ],
    temperature: 0.1,
    response_format: {
      type: "json_object"
    }
  };
}

async function requestJsonCompletion(settings, prompt, { images = [], signal } = {}) {
  const response = await fetch(`${settings.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${settings.deepseekApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildChatCompletionBody(settings, prompt, images))
  });

  if (!response.ok) {
    throw new Error(await formatDeepSeekError(response, images.length > 0));
  }

  const payload = await response.json();
  return extractChatCompletionText(payload);
}

async function formatDeepSeekError(response, hasImages = false) {
  const text = await response.text().catch(() => "");
  if (hasImages && isUnsupportedImageError(response.status, text)) {
    return "当前模型或接口不支持图片复审，请更换支持视觉输入的模型。";
  }
  const preview = text ? ` ${text.slice(0, 500)}` : "";
  return `DeepSeek 评审请求失败：HTTP ${response.status}.${preview}`;
}

export function isUnsupportedImageError(status, text) {
  if (![400, 415, 422].includes(Number(status))) return false;

  const message = String(text || "");
  const mentionsImages = /(image_url|image input|vision|multimodal|image content|图片|视觉)/i.test(message);
  const unsupported = /(not supported|unsupported|does not support|invalid content|不支持)/i.test(message);
  return mentionsImages && unsupported;
}
