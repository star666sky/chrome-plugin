(function exposeImageAttachments(globalScope) {
  const MAX_IMAGE_COUNT = 3;
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const MAX_TOTAL_IMAGE_BYTES = MAX_IMAGE_COUNT * MAX_IMAGE_BYTES;
  const MAX_IMAGE_EDGE = 1600;
  const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
  const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5];

  function validateFiles(files, existingCount = 0) {
    const list = Array.from(files || []);
    const count = Math.max(0, Number.parseInt(existingCount, 10) || 0);

    if (count + list.length > MAX_IMAGE_COUNT) {
      throw new Error(`单次最多上传 ${MAX_IMAGE_COUNT} 张图片。`);
    }

    for (const file of list) {
      if (!ALLOWED_IMAGE_TYPES.has(String(file?.type || "").toLowerCase())) {
        throw new Error("仅支持 PNG、JPEG、WebP 图片。");
      }
    }

    return list;
  }

  function normalizeImagePayloads(images = []) {
    if (!Array.isArray(images)) {
      throw new Error("图片附件格式无效。");
    }

    if (images.length > MAX_IMAGE_COUNT) {
      throw new Error(`单次最多上传 ${MAX_IMAGE_COUNT} 张图片。`);
    }

    let totalBytes = 0;
    return images.map((image) => {
      const type = String(image?.type || "").toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(type)) {
        throw new Error("仅支持 PNG、JPEG、WebP 图片。");
      }

      const dataUrl = String(image?.dataUrl || "");
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
      if (!match) {
        throw new Error("图片内容不是有效的 Data URL。");
      }

      if (match[1] !== type) {
        throw new Error("图片格式与内容不一致。");
      }

      const bytes = getBase64ByteLength(match[2]);
      if (bytes > MAX_IMAGE_BYTES) {
        throw new Error("单张图片压缩后不能超过 2MB。");
      }

      totalBytes += bytes;
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error("图片总大小不能超过 6MB。");
      }

      return { type, dataUrl };
    });
  }

  function buildUserContent(text, images = []) {
    if (!images.length) return text;

    return [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image_url",
        image_url: { url: image.dataUrl }
      }))
    ];
  }

  function hasFileTransfer(types) {
    return Array.from(types || []).includes("Files");
  }

  async function compressImageFile(file) {
    validateFiles([file], 0);
    const source = await decodeImage(file);

    try {
      let { width, height } = fitWithin(source.width, source.height, MAX_IMAGE_EDGE);

      while (Math.max(width, height) >= 320) {
        const canvas = drawSource(source, width, height);
        const webp = await encodeWithinLimit(canvas, "image/webp", false);
        if (webp) return createAttachment(file, webp);

        const jpeg = await encodeWithinLimit(canvas, "image/jpeg", true);
        if (jpeg) return createAttachment(file, jpeg);

        width = Math.max(1, Math.floor(width * 0.82));
        height = Math.max(1, Math.floor(height * 0.82));
      }
    } finally {
      source.close?.();
      if (source.objectUrl && globalScope.URL?.revokeObjectURL) {
        globalScope.URL.revokeObjectURL(source.objectUrl);
      }
    }

    throw new Error("图片压缩后仍超过 2MB，请选择尺寸更小的图片。");
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(new Error("图片读取失败，请重新选择。")), { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function releaseAttachments(attachments) {
    for (const attachment of Array.isArray(attachments) ? attachments : []) {
      if (attachment?.previewUrl && globalScope.URL?.revokeObjectURL) {
        globalScope.URL.revokeObjectURL(attachment.previewUrl);
      }
    }

    if (Array.isArray(attachments)) attachments.length = 0;
    return [];
  }

  function renderAttachmentPicker({ kind, attachments = [], disabled = false, processing = false } = {}) {
    const normalizedKind = kind === "overall" ? "overall" : "finding";
    const isDisabled = Boolean(disabled || processing);
    const list = Array.isArray(attachments) ? attachments : [];
    const remaining = Math.max(0, MAX_IMAGE_COUNT - list.length);

    return `
      <div class="bbai-feedback-attachments${processing ? " bbai-feedback-attachments--processing" : ""}" data-image-kind="${normalizedKind}">
        <input class="bbai-feedback-file-input" type="file" data-action="select-feedback-images" data-image-kind="${normalizedKind}" accept="image/png,image/jpeg,image/webp" multiple ${isDisabled ? "disabled" : ""}>
        ${
          list.length
            ? `<div class="bbai-feedback-thumbnails">
                ${list
                  .map(
                    (attachment) => `
                      <figure class="bbai-feedback-thumbnail">
                        <img src="${escapeHtml(attachment?.previewUrl || "")}" alt="${escapeHtml(attachment?.name || "反馈图片")}">
                        <figcaption title="${escapeHtml(attachment?.name || "反馈图片")}">${escapeHtml(attachment?.name || "反馈图片")}</figcaption>
                        <button type="button" data-action="remove-feedback-image" data-image-kind="${normalizedKind}" data-image-id="${escapeHtml(attachment?.id || "")}" aria-label="移除图片 ${escapeHtml(attachment?.name || "反馈图片")}" ${isDisabled ? "disabled" : ""}>×</button>
                      </figure>
                    `
                  )
                  .join("")}
              </div>`
            : ""
        }
        <div class="bbai-feedback-dropzone" data-action="feedback-image-drop" data-image-kind="${normalizedKind}" aria-disabled="${isDisabled}">
          <button type="button" data-action="choose-feedback-images" data-image-kind="${normalizedKind}" ${isDisabled || remaining === 0 ? "disabled" : ""}>
            ${processing ? "正在处理图片..." : "添加图片"}
          </button>
          <span>${remaining ? `可点击、拖拽或粘贴图片，还可添加 ${remaining} 张` : "已达到 3 张上限"}</span>
        </div>
        <p class="bbai-feedback-image-note">图片会发送给当前配置的 AI 服务，但不会保存到评审历史。</p>
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getBase64ByteLength(value) {
    if (!value || value.length % 4 === 1) {
      throw new Error("图片内容不是有效的 Base64 数据。");
    }

    const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
    return Math.floor((value.length * 3) / 4) - padding;
  }

  async function decodeImage(file) {
    if (typeof globalScope.createImageBitmap === "function") {
      return await globalScope.createImageBitmap(file);
    }

    if (!globalScope.document || !globalScope.URL?.createObjectURL) {
      throw new Error("当前浏览器无法处理图片。");
    }

    const objectUrl = globalScope.URL.createObjectURL(file);
    const image = new Image();
    image.objectUrl = objectUrl;
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("图片无法解码，请更换文件。")), { once: true });
      image.src = objectUrl;
    });
    return image;
  }

  function fitWithin(width, height, maxEdge) {
    const sourceWidth = Math.max(1, Number(width) || 1);
    const sourceHeight = Math.max(1, Number(height) || 1);
    const ratio = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    return {
      width: Math.max(1, Math.round(sourceWidth * ratio)),
      height: Math.max(1, Math.round(sourceHeight * ratio))
    };
  }

  function drawSource(source, width, height) {
    const canvas = globalScope.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("当前浏览器无法压缩图片。");
    context.drawImage(source, 0, 0, width, height);
    return canvas;
  }

  async function encodeWithinLimit(sourceCanvas, type, whiteBackground) {
    const canvas = whiteBackground ? createWhiteBackgroundCanvas(sourceCanvas) : sourceCanvas;

    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, type, quality);
      if (!blob || blob.type !== type) return null;
      if (blob.size <= MAX_IMAGE_BYTES) return blob;
    }

    return null;
  }

  function createWhiteBackgroundCanvas(sourceCanvas) {
    const canvas = globalScope.document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前浏览器无法压缩图片。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0);
    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function createAttachment(file, blob) {
    return {
      id: typeof globalScope.crypto?.randomUUID === "function"
        ? globalScope.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: String(file?.name || "粘贴的图片"),
      type: blob.type,
      size: blob.size,
      blob,
      previewUrl: globalScope.URL.createObjectURL(blob)
    };
  }

  const api = {
    MAX_IMAGE_COUNT,
    MAX_IMAGE_BYTES,
    MAX_TOTAL_IMAGE_BYTES,
    validateFiles,
    normalizeImagePayloads,
    buildUserContent,
    hasFileTransfer,
    compressImageFile,
    blobToDataUrl,
    releaseAttachments,
    renderAttachmentPicker
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.BitbucketPrAiReviewerImages = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
