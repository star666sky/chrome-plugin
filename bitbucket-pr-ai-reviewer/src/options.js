import { normalizeSettings } from "./settings.js";

const form = document.querySelector("#settings-form");
const status = document.querySelector("#status");
const resetButton = document.querySelector("#reset-button");

loadSettings();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = normalizeSettings(Object.fromEntries(new FormData(form).entries()));
  const response = await chrome.runtime.sendMessage({ type: "save-settings", settings });

  if (!response?.ok) {
    showStatus(response?.error || "设置保存失败。", true);
    return;
  }

  fillForm(response.settings);
  showStatus("设置已保存。");
});

resetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "reset-settings" });

  if (!response?.ok) {
    showStatus(response?.error || "默认设置恢复失败。", true);
    return;
  }

  fillForm(response.settings);
  showStatus("已恢复默认设置。");
});

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "get-settings" });

  if (!response?.ok) {
    showStatus(response?.error || "设置加载失败。", true);
    return;
  }

  fillForm(response.settings);
}

function fillForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  }
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.className = `status ${isError ? "status--error" : "status--ok"}`;
}
