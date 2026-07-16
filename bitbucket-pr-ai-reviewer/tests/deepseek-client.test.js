const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/image-attachments");
const { loadSourceModule } = require("./helpers/load-source-module");

async function loadDeepSeekClient() {
  return await loadSourceModule("src/deepseek-client.js", [
    [/import \{[\s\S]*?\} from "\.\/review-engine\.js";/, `
      const buildFindingFeedbackPrompt = (value) => value;
      const buildReviewPrompt = (value) => value;
      const buildVisualEvidencePrompt = (value) => value;
      const extractChatCompletionText = () => "";
      const parseFindingFeedbackResponse = () => ({});
      const parseReviewResponse = () => [];
      const parseVisualEvidenceResponse = (text) => JSON.parse(text).summary;
    `],
    [/import "\.\/image-attachments\.js";/, ""]
  ]);
}

const settings = {
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekApiKey: "secret",
  deepseekModel: "vision-model"
};

test("keeps the existing string user message when a request has no images", async () => {
  const { buildChatCompletionBody } = await loadDeepSeekClient();
  const body = buildChatCompletionBody(settings, { system: "system", user: "user" }, []);

  assert.equal(body.messages[0].content, "system");
  assert.equal(body.messages[1].content, "user");
});

test("puts images only in the multimodal user message", async () => {
  const { buildChatCompletionBody } = await loadDeepSeekClient();
  const dataUrl = "data:image/png;base64,AQID";
  const body = buildChatCompletionBody(settings, { system: "system", user: "user" }, [{ type: "image/png", dataUrl }]);

  assert.equal(body.messages[0].content, "system");
  assert.deepEqual(body.messages[1].content, [
    { type: "text", text: "user" },
    { type: "image_url", image_url: { url: dataUrl } }
  ]);
});

test("recognizes only image-specific unsupported-model errors", async () => {
  const { isUnsupportedImageError } = await loadDeepSeekClient();

  assert.equal(isUnsupportedImageError(400, '{"error":{"message":"image_url input is not supported"}}'), true);
  assert.equal(isUnsupportedImageError(401, '{"error":{"message":"invalid api key"}}'), false);
  assert.equal(isUnsupportedImageError(500, "temporary server error"), false);
});
