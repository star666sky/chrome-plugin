import { fetchPullRequestDiff } from "./bitbucket-client.js";
import { reviewDiffChunk } from "./deepseek-client.js";
import { chunkDiff, mergeFindings } from "./review-engine.js";
import {
  REVIEW_HISTORY_KEY,
  createReviewRecord,
  findLatestReviewForPullRequest,
  upsertReviewHistory
} from "./review-history.js";
import { normalizeSettings, validateSettings } from "./settings.js";
import { parsePullRequestUrl } from "./url.js";

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "get-settings":
      return { settings: await loadSettings() };
    case "save-settings":
      return { settings: await saveSettings(message.settings) };
    case "reset-settings":
      return { settings: await saveSettings({}) };
    case "open-options":
      await chrome.runtime.openOptionsPage();
      return {};
    case "get-review-history":
      return await getReviewHistory(message.url || sender.tab?.url);
    case "review-current-pr":
      return {
        ...(await reviewCurrentPullRequest(message.url || sender.tab?.url, sender.tab?.id))
      };
    default:
      throw new Error(`Unknown extension message: ${message?.type || "missing type"}`);
  }
}

async function reviewCurrentPullRequest(url, tabId) {
  const settings = validateSettings(await loadSettings());
  const pullRequest = parsePullRequestUrl(url);
  const progress = (status) => notifyProgress(tabId, status);

  progress("Reading pull request metadata...");
  const { pullRequestInfo, commits, changedFiles, diffText } = await fetchPullRequestDiff(pullRequest, settings, progress);
  const chunks = chunkDiff(diffText, settings.maxDiffCharsPerChunk);

  if (!chunks.length) {
    throw new Error("No reviewable diff chunks were created.");
  }

  const reviewedChunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    progress(`Reviewing diff chunk ${index + 1} of ${chunks.length}...`);
    reviewedChunks.push(
      await reviewDiffChunk({
        settings,
        pullRequest,
        pullRequestInfo,
        commits,
        changedFiles,
        diffChunk: chunks[index],
        chunkIndex: index,
        totalChunks: chunks.length
      })
    );
  }

  const findings = mergeFindings(reviewedChunks);
  progress("Review complete.");

  const result = {
    pullRequest,
    pullRequestInfo,
    commits,
    changedFiles,
    chunksReviewed: chunks.length,
    findings
  };
  const history = await saveReviewHistory(url, result);

  return {
    result,
    history
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);
  return normalizeSettings(stored);
}

async function saveSettings(input) {
  const settings = normalizeSettings(input);
  await chrome.storage.local.set(settings);
  return settings;
}

function notifyProgress(tabId, status) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "review-progress", status }).catch(() => {});
}

async function getReviewHistory(url) {
  const history = await loadReviewHistory();
  let currentReview = null;

  try {
    currentReview = findLatestReviewForPullRequest(history, parsePullRequestUrl(url));
  } catch {
    currentReview = null;
  }

  return {
    history,
    currentReview
  };
}

async function loadReviewHistory() {
  const stored = await chrome.storage.local.get({ [REVIEW_HISTORY_KEY]: [] });
  return Array.isArray(stored[REVIEW_HISTORY_KEY]) ? stored[REVIEW_HISTORY_KEY] : [];
}

async function saveReviewHistory(url, result) {
  const history = upsertReviewHistory(await loadReviewHistory(), createReviewRecord({ url, result }));
  await chrome.storage.local.set({ [REVIEW_HISTORY_KEY]: history });
  return history;
}
