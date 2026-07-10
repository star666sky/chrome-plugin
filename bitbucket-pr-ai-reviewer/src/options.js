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
    showStatus(response?.error || "Settings were not saved.", true);
    return;
  }

  fillForm(response.settings);
  showStatus("Settings saved.");
});

resetButton.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "reset-settings" });

  if (!response?.ok) {
    showStatus(response?.error || "Settings were not reset.", true);
    return;
  }

  fillForm(response.settings);
  showStatus("Defaults restored.");
});

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "get-settings" });

  if (!response?.ok) {
    showStatus(response?.error || "Settings could not be loaded.", true);
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
