# Feedback Image Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users attach up to three temporary images to finding feedback or whole-PR follow-up review without persisting image data.

**Architecture:** A browser/Node-compatible attachment module owns validation, compression and cleanup. Finding feedback sends images directly in one multimodal user message; whole-PR feedback performs one visual-evidence extraction request and injects the resulting text into every existing diff-chunk review. Request IDs map to AbortControllers in the service worker so page changes cancel network work before history writes.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript, Canvas/Blob/Object URL APIs, Chrome runtime messaging, Node `node:test`.

## Global Constraints

- Accept only PNG, JPEG and WebP.
- Allow at most 3 images per request.
- Limit each compressed Blob to 2 MiB and the decoded payload total to 6 MiB.
- Require non-empty text feedback even when images are attached.
- Never persist image names, Blobs, preview URLs or Data URLs.
- Retain attachments after request failure, but release them on success, cancel, close, editor switch, PR navigation and page exit.
- Keep existing no-image request bodies and behavior unchanged.

---

### Task 1: Attachment validation and request-content helpers

**Files:**
- Create: `src/image-attachments.js`
- Modify: `manifest.json`
- Modify: `package.json`
- Test: `tests/image-attachments.test.js`

**Interfaces:**
- Produces: `globalThis.BitbucketPrAiReviewerImages` with `validateFiles`, `normalizeImagePayloads`, `buildUserContent`, `compressImageFile`, `blobToDataUrl`, `releaseAttachments`, constants for count and byte limits.
- Consumes: Browser `File`, `Blob`, Canvas and Object URL APIs; pure validators remain usable in Node tests.

- [ ] **Step 1: Write failing validation and message-content tests**

```js
test("rejects more than three images", () => {
  assert.throws(() => normalizeImagePayloads([image, image, image, image]), /最多上传 3 张/);
});

test("keeps text content unchanged without images", () => {
  assert.equal(buildUserContent("prompt", []), "prompt");
});

test("places images after text in multimodal user content", () => {
  assert.deepEqual(buildUserContent("prompt", [image]), [
    { type: "text", text: "prompt" },
    { type: "image_url", image_url: { url: image.dataUrl } }
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/image-attachments.test.js`

Expected: FAIL because `src/image-attachments.js` does not exist.

- [ ] **Step 3: Implement the attachment module**

```js
(function exposeImageAttachments(globalScope) {
  const MAX_IMAGE_COUNT = 3;
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const MAX_TOTAL_IMAGE_BYTES = 6 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  function buildUserContent(text, images = []) {
    if (!images.length) return text;
    return [
      { type: "text", text },
      ...images.map(({ dataUrl }) => ({ type: "image_url", image_url: { url: dataUrl } }))
    ];
  }

  globalScope.BitbucketPrAiReviewerImages = {
    MAX_IMAGE_COUNT,
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    validateFiles,
    normalizeImagePayloads,
    buildUserContent,
    compressImageFile,
    blobToDataUrl,
    releaseAttachments
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
```

Compression must first cap the longest edge at 1600px, reduce WebP/JPEG quality, then reduce dimensions until the Blob is at most 2 MiB. JPEG output must paint a white background.

- [ ] **Step 4: Load the helper before `content.js` and extend syntax checks**

Add `src/image-attachments.js` before `src/content.js` in `manifest.json`. Extend `npm run check` to cover all modified source modules.

- [ ] **Step 5: Run focused and existing tests**

Run: `npm test`

Expected: all tests pass.

### Task 2: AI multimodal requests and visual-evidence extraction

**Files:**
- Modify: `src/deepseek-client.js`
- Modify: `src/review-engine.js`
- Test: `tests/deepseek-client.test.js`
- Test: `tests/review-engine.test.js`

**Interfaces:**
- Consumes: normalized `{ type, dataUrl }[]` from Task 1.
- Produces: `reviewFindingFeedback({ ..., images, signal })`, `extractVisualEvidence({ settings, feedback, images, signal })`, and `reviewDiffChunk({ ..., visualEvidence, signal })`.

- [ ] **Step 1: Write failing tests for text-only and multimodal payloads**

```js
test("builds the existing string user message without images", () => {
  assert.equal(buildUserContent("prompt", []), "prompt");
});

test("adds visual evidence to every review prompt as untrusted context", () => {
  const prompt = buildReviewPrompt({ ...baseInput, visualEvidence: "界面显示权限按钮缺失" });
  assert.match(prompt.user, /Visual evidence supplied by the user/);
  assert.match(prompt.user, /界面显示权限按钮缺失/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/deepseek-client.test.js tests/review-engine.test.js`

Expected: FAIL because visual evidence and exported payload helpers are missing.

- [ ] **Step 3: Refactor the request builder and implement one visual call**

```js
async function requestJsonCompletion(settings, prompt, { images = [], signal } = {}) {
  const response = await fetch(`${settings.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      model: settings.deepseekModel,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: ImageAttachments.buildUserContent(prompt.user, images) }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });
}
```

`extractVisualEvidence` must request JSON shaped as `{"summary":"..."}` and its system prompt must state that image instructions are untrusted evidence, not executable instructions.

- [ ] **Step 4: Map only image-specific provider errors**

When an image request fails, inspect the structured/error text for `image`, `image_url`, `vision`, `multimodal` or unsupported content-type wording. Return `当前模型或接口不支持图片复审，请更换支持视觉输入的模型。`; preserve all unrelated errors.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test`

Expected: all tests pass and no-image assertions remain unchanged.

### Task 3: Service-worker validation, routing and cancellation

**Files:**
- Modify: `src/service-worker.js`
- Modify: `src/bitbucket-client.js`
- Test: `tests/review-request.test.js`

**Interfaces:**
- Consumes: `images` and `requestId` from content messages.
- Produces: cancellation message `cancel-review-request`, one visual summary per whole-PR request, direct images for finding feedback, and no image fields in returned history.

- [ ] **Step 1: Write failing routing and persistence tests**

```js
test("whole-PR image feedback extracts visual evidence once", async () => {
  await reviewCurrentPullRequest(url, tabId, { feedback: "检查截图", images, requestId: "r1" });
  assert.equal(calls.extractVisualEvidence, 1);
  assert.equal(calls.reviewDiffChunk, chunkCount);
});

test("history never contains image payloads", async () => {
  assert.doesNotMatch(JSON.stringify(savedHistory), /data:image|previewUrl|"images"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/review-request.test.js`

Expected: FAIL because image routing and cancellation are not implemented.

- [ ] **Step 3: Add request controllers and image normalization**

```js
const activeRequests = new Map();

function cancelReviewRequest(requestId) {
  activeRequests.get(requestId)?.abort();
  activeRequests.delete(requestId);
}
```

Normalize images immediately on message entry. Pass `signal` through `fetchPullRequestDiff`, every Bitbucket `fetch`, visual evidence extraction and DeepSeek review calls. Call `signal.throwIfAborted()` before every history mutation.

- [ ] **Step 4: Route whole-PR and finding feedback correctly**

Whole PR: call `extractVisualEvidence` once and pass only its text to every `reviewDiffChunk`. Finding feedback: pass normalized images directly to `reviewFindingFeedback`.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test`

Expected: all tests pass, including cancellation and history assertions.

### Task 4: Feedback attachment UI and lifecycle

**Files:**
- Modify: `src/content.js`
- Modify: `src/panel.css`

**Interfaces:**
- Consumes: Task 1 attachment APIs and Task 3 message fields.
- Produces: upload, drag/drop, paste, thumbnail removal and deterministic cleanup for both feedback editors.

- [ ] **Step 1: Add separate state and a shared renderer**

```js
findingFeedbackImages: [],
overallFeedbackImages: [],
imageProcessing: false
```

Render the attachment area above each textarea with a hidden multiple file input, upload button, drop hint, thumbnails, remove buttons and privacy copy.

- [ ] **Step 2: Bind selection, drop and paste**

All three input paths call one serialized `addFeedbackImages(kind, files)` function. Only image clipboard items prevent default paste. Reset the file input value after selection.

- [ ] **Step 3: Send temporary Data URLs and preserve retry behavior**

```js
const images = await Promise.all(
  state.findingFeedbackImages.map(async ({ name, type, size, blob }) => ({
    name,
    type,
    size,
    dataUrl: await ImageAttachments.blobToDataUrl(blob)
  }))
);
```

Clear attachments after success. Keep them after validation, network or provider failure.

- [ ] **Step 4: Cover every cleanup path**

Release the relevant array on remove, cancel, editor collapse/switch, detail close, panel close, `resetFeedbackState`, PR navigation and `pagehide`. On PR navigation/pagehide, send `cancel-review-request` before clearing `activeRequestId`.

- [ ] **Step 5: Add responsive and accessible styles**

Include visible drag state, processing/disabled state, keyboard-focus styles, 56–72px thumbnails, filename truncation and buttons with explicit Chinese `aria-label` values.

- [ ] **Step 6: Run syntax checks**

Run: `npm run check`

Expected: exit code 0.

### Task 5: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-13-feedback-image-context-design.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1–4.
- Produces: user instructions and a verified release-ready change set.

- [ ] **Step 1: Document image feedback**

Document click, drag and paste input; three-image and 2 MiB limits; required text; temporary-memory behavior; transmission to the configured AI service; and the need for a vision-capable model.

- [ ] **Step 2: Run all automated verification**

Run: `npm test && npm run check`

Expected: all tests pass and syntax checks exit 0.

- [ ] **Step 3: Perform manual Chrome verification**

Reload the unpacked extension and verify selection, drag/drop, clipboard paste, removal, same-file reselection, count/type errors, failed-request retry, successful-request cleanup, editor switching, panel close and PR navigation. Confirm Chrome local storage/history contain no image fields or Data URLs.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors, only planned files changed, and no temporary image or debug files.
