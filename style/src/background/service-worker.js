import { loadSettings } from "../shared/settings.js";
import { STYLE_GET_SETTINGS, STYLE_TOGGLE_INSPECTOR } from "../shared/messages.js";

const ACTIVE_BADGE_TEXT = "ON";
const ACTIVE_BADGE_COLOR = "#16a34a";
const ACTIVE_BADGE_TEXT_COLOR = "#ffffff";
const DEFAULT_ACTION_TITLE = "Style Inspector";
const ACTIVE_ACTION_TITLE = "Style Inspector - monitoring";

function updateActionState(tabId, enabled) {
  if (typeof tabId !== "number" || !globalThis.chrome?.action) {
    return;
  }

  chrome.action.setBadgeText?.({
    tabId,
    text: enabled ? ACTIVE_BADGE_TEXT : ""
  });
  chrome.action.setBadgeBackgroundColor?.({
    tabId,
    color: ACTIVE_BADGE_COLOR
  });
  chrome.action.setBadgeTextColor?.({
    tabId,
    color: ACTIVE_BADGE_TEXT_COLOR
  });
  chrome.action.setTitle?.({
    tabId,
    title: enabled ? ACTIVE_ACTION_TITLE : DEFAULT_ACTION_TITLE
  });
}

async function sendToggleMessage(tab) {
  const tabId = tab?.id;
  if (typeof tabId !== "number" || !globalThis.chrome?.tabs?.sendMessage) {
    return;
  }

  chrome.tabs.sendMessage(tabId, { type: STYLE_TOGGLE_INSPECTOR }, (response) => {
    void chrome.runtime?.lastError;
    if (typeof response?.enabled === "boolean") {
      updateActionState(tabId, response.enabled);
    }
  });
}

chrome.action.onClicked.addListener((tab) => {
  void sendToggleMessage(tab);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== STYLE_GET_SETTINGS) {
    return false;
  }

  loadSettings()
    .then((settings) => sendResponse({ ok: true, settings }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Failed to load settings" }));

  return true;
});
