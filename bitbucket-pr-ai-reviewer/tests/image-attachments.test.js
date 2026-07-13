const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_IMAGE_BYTES,
  buildUserContent,
  normalizeImagePayloads,
  validateFiles
} = require("../src/image-attachments");

function makeDataUrl(type = "image/png", byteLength = 4) {
  return `data:${type};base64,${Buffer.alloc(byteLength, 1).toString("base64")}`;
}

function makePayload(type = "image/png", byteLength = 4, extra = {}) {
  return {
    name: "screen.png",
    type,
    size: byteLength,
    dataUrl: makeDataUrl(type, byteLength),
    previewUrl: "blob:must-not-cross-worker-boundary",
    ...extra
  };
}

test("keeps the existing string user content when no images are supplied", () => {
  assert.equal(buildUserContent("review prompt", []), "review prompt");
});

test("places image URLs after text in multimodal user content", () => {
  const image = makePayload();

  assert.deepEqual(buildUserContent("review prompt", [image]), [
    { type: "text", text: "review prompt" },
    { type: "image_url", image_url: { url: image.dataUrl } }
  ]);
});

test("normalizes image payloads and removes metadata that must not reach history", () => {
  const image = makePayload();

  assert.deepEqual(normalizeImagePayloads([image]), [
    {
      type: "image/png",
      dataUrl: image.dataUrl
    }
  ]);
});

test("rejects more than three images", () => {
  const images = [makePayload(), makePayload(), makePayload(), makePayload()];

  assert.throws(() => normalizeImagePayloads(images), /最多上传 3 张图片/);
});

test("rejects unsupported and mismatched image MIME types", () => {
  assert.throws(() => normalizeImagePayloads([makePayload("image/gif")]), /仅支持 PNG、JPEG、WebP/);
  assert.throws(
    () => normalizeImagePayloads([makePayload("image/png", 4, { dataUrl: makeDataUrl("image/jpeg", 4) })]),
    /图片格式与内容不一致/
  );
});

test("rejects decoded image payloads larger than two MiB", () => {
  assert.throws(() => normalizeImagePayloads([makePayload("image/png", MAX_IMAGE_BYTES + 1)]), /不能超过 2MB/);
});

test("validates pending browser files against the remaining attachment slots", () => {
  const files = [{ type: "image/png" }, { type: "image/jpeg" }];

  assert.doesNotThrow(() => validateFiles(files, 1));
  assert.throws(() => validateFiles(files, 2), /最多上传 3 张图片/);
  assert.throws(() => validateFiles([{ type: "image/gif" }], 0), /仅支持 PNG、JPEG、WebP/);
});
