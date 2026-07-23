import { createEmptyData, normalizeData } from "./domain.js";
import {
  createJsonFile as createLocalJsonFile,
  getFileStatus,
  pickExistingJsonFile as pickExistingLocalJsonFile,
  readGroupData as readLocalGroupData,
  requestStoredFilePermission,
  saveAsJsonFile as saveAsLocalJsonFile,
  writeGroupData as writeLocalGroupData
} from "./file-store.js";

const CONFIG_PATH = "src/shared/data-location.config.json";
const DATA_LOCATION_KEY = "groupDataLocation";
const VALID_MODES = new Set(["extension", "localFile", "publicUrl"]);
const FALLBACK_CONFIG = {
  defaultMode: "localFile",
  extension: {
    storageKey: "groupExtensionData",
    fileName: "chrome-storage.json"
  },
  localFile: {
    fileName: "group.json",
    pickerId: "group-json",
    startIn: "documents"
  },
  publicUrl: {
    url: "https://claire-storage.oss-cn-hangzhou.aliyuncs.com/files/group.json",
    fileName: "group.json"
  }
};

let defaultConfigPromise = null;

export async function getDefaultDataLocationConfig() {
  defaultConfigPromise ||= loadDefaultDataLocationConfig();
  return defaultConfigPromise;
}

export async function loadDataLocation() {
  const config = await getDefaultDataLocationConfig();
  const stored = await chromeStorageGet(DATA_LOCATION_KEY);
  return sanitizeDataLocation(stored?.[DATA_LOCATION_KEY], config);
}

export async function saveDataLocation(patch) {
  const config = await getDefaultDataLocationConfig();
  const current = await loadDataLocation();
  const next = sanitizeDataLocation({ ...current, ...patch }, config);
  await chromeStorageSet({ [DATA_LOCATION_KEY]: next });
  return next;
}

export async function getDataStatus() {
  const location = await loadDataLocation();
  if (location.mode === "localFile") {
    const status = await getFileStatus();
    return { ...status, mode: location.mode, location };
  }
  if (location.mode === "publicUrl") {
    return {
      bound: Boolean(location.publicUrl),
      fileName: location.publicUrl,
      boundAt: "",
      permission: location.publicUrl ? "granted" : "missing",
      mode: location.mode,
      location
    };
  }
  return {
    bound: true,
    fileName: "chrome.storage.local",
    boundAt: "",
    permission: "granted",
    mode: location.mode,
    location
  };
}

export async function pickExistingJsonFile() {
  const config = await getDefaultDataLocationConfig();
  const result = await pickExistingLocalJsonFile(config.localFile);
  if (result.ok) await saveDataLocation({ mode: "localFile" });
  return result;
}

export async function createJsonFile() {
  const config = await getDefaultDataLocationConfig();
  const result = await createLocalJsonFile(config.localFile);
  if (result.ok) await saveDataLocation({ mode: "localFile" });
  return result;
}

export async function saveAsJsonFile(data) {
  const config = await getDefaultDataLocationConfig();
  const result = await saveAsLocalJsonFile(data, config.localFile);
  if (result.ok) await saveDataLocation({ mode: "localFile" });
  return result;
}

export { requestStoredFilePermission };

export async function readGroupData() {
  const location = await loadDataLocation();
  if (location.mode === "extension") return readExtensionGroupData();
  if (location.mode === "publicUrl") return readPublicUrlGroupData(location.publicUrl);
  return readLocalGroupData();
}

export async function writeGroupData(data) {
  const location = await loadDataLocation();
  if (location.mode === "extension") return writeExtensionGroupData(data);
  if (location.mode === "publicUrl") return writePublicUrlGroupData(location.publicUrl, data);
  return writeLocalGroupData(data);
}

async function readExtensionGroupData() {
  const config = await getDefaultDataLocationConfig();
  const storageKey = config.extension.storageKey;
  const stored = await chromeStorageGet(storageKey);
  return {
    ok: true,
    data: normalizeData(stored?.[storageKey] || createEmptyData()),
    fileName: config.extension.fileName
  };
}

async function writeExtensionGroupData(data) {
  const config = await getDefaultDataLocationConfig();
  const normalized = normalizeData(data);
  await chromeStorageSet({ [config.extension.storageKey]: normalized });
  return { ok: true, fileName: config.extension.fileName };
}

async function readPublicUrlGroupData(publicUrl) {
  if (!publicUrl) return failure("missing_url", "未配置公共 JSON URL");
  try {
    const response = await fetch(publicUrl, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return failure("read_error", `读取公共 JSON 失败：HTTP ${response.status}`);
    }
    const text = await response.text();
    const parsed = text.trim() ? JSON.parse(text) : createEmptyData();
    return { ok: true, data: normalizeData(parsed), fileName: publicUrl };
  } catch (error) {
    return failure("read_error", error?.message || "读取公共 JSON 失败");
  }
}

async function writePublicUrlGroupData(publicUrl, data) {
  if (!publicUrl) return failure("missing_url", "未配置公共 JSON URL");
  try {
    const normalized = normalizeData(data);
    const response = await fetch(publicUrl, {
      method: "PUT",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: `${JSON.stringify(normalized, null, 2)}\n`
    });
    if (!response.ok) {
      return failure("write_error", `写入公共 JSON 失败：HTTP ${response.status}`);
    }
    return { ok: true, fileName: publicUrl };
  } catch (error) {
    return failure("write_error", error?.message || "写入公共 JSON 失败");
  }
}

async function loadDefaultDataLocationConfig() {
  const runtimeConfig = await fetchRuntimeJson(CONFIG_PATH);
  return sanitizeConfig(runtimeConfig || FALLBACK_CONFIG);
}

async function fetchRuntimeJson(path) {
  const getUrl = globalThis.chrome?.runtime?.getURL;
  if (typeof getUrl !== "function" || typeof globalThis.fetch !== "function") return null;

  try {
    const response = await fetch(getUrl(path), { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function sanitizeConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  const extension = source.extension && typeof source.extension === "object" ? source.extension : {};
  const localFile = source.localFile && typeof source.localFile === "object" ? source.localFile : {};
  const publicUrl = source.publicUrl && typeof source.publicUrl === "object" ? source.publicUrl : {};
  return {
    defaultMode: VALID_MODES.has(source.defaultMode) ? source.defaultMode : FALLBACK_CONFIG.defaultMode,
    extension: {
      storageKey: nonEmptyString(extension.storageKey, FALLBACK_CONFIG.extension.storageKey),
      fileName: nonEmptyString(extension.fileName, FALLBACK_CONFIG.extension.fileName)
    },
    localFile: {
      fileName: nonEmptyString(localFile.fileName, FALLBACK_CONFIG.localFile.fileName),
      pickerId: nonEmptyString(localFile.pickerId, FALLBACK_CONFIG.localFile.pickerId),
      startIn: nonEmptyString(localFile.startIn, FALLBACK_CONFIG.localFile.startIn)
    },
    publicUrl: {
      url: validUrl(publicUrl.url) || FALLBACK_CONFIG.publicUrl.url,
      fileName: nonEmptyString(publicUrl.fileName, FALLBACK_CONFIG.publicUrl.fileName)
    }
  };
}

function sanitizeDataLocation(input, config) {
  const source = input && typeof input === "object" ? input : {};
  const mode = VALID_MODES.has(source.mode) ? source.mode : config.defaultMode;
  return {
    mode,
    publicUrl: validUrl(source.publicUrl) || config.publicUrl.url
  };
}

function validUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function nonEmptyString(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function failure(reason, message) {
  return { ok: false, reason, message };
}

function chromeStorageGet(key) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve({});
      return;
    }
    chrome.storage.local.get(key, resolve);
  });
}

function chromeStorageSet(value) {
  return new Promise((resolve) => {
    if (!globalThis.chrome?.storage?.local) {
      resolve();
      return;
    }
    chrome.storage.local.set(value, resolve);
  });
}
