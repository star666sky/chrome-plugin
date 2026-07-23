export const FEISHU_TASK_DETAIL_URL_TEMPLATE = "https://project.feishu.cn/b2rl2h/issue/detail/{key}";

export function validateFeishuTaskKey(key) {
  if (String(key || "").trim().length === 0) {
    return { valid: false, message: "请输入任务 key" };
  }

  return { valid: true, message: "" };
}

export function normalizeFeishuTaskKey(key) {
  const trimmedKey = String(key).trim();
  const prefixedNumericKey = trimmedKey.match(/^[a-zA-Z]-(\d+)$/);

  return prefixedNumericKey ? prefixedNumericKey[1] : trimmedKey;
}

export function buildFeishuTaskUrl(key) {
  const keyResult = validateFeishuTaskKey(key);
  if (!keyResult.valid) {
    throw new Error(keyResult.message);
  }

  return FEISHU_TASK_DETAIL_URL_TEMPLATE.replace("{key}", encodeURIComponent(normalizeFeishuTaskKey(key)));
}
