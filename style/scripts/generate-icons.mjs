import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUTPUT_DIR = fileURLToPath(new URL("../icons/", import.meta.url));
const SIZES = [16, 32, 48, 128];

function crc32(buffer) {
  let value = -1;
  for (const byte of buffer) {
    value ^= byte;
    for (let index = 0; index < 8; index += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function hexColor(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).concat(alpha);
}

function makeCanvas(size, scale) {
  return {
    width: size * scale,
    height: size * scale,
    pixels: Buffer.alloc(size * scale * size * scale * 4),
    scale
  };
}

function blendPixel(canvas, x, y, rgba) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }
  const index = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const alpha = rgba[3] / 255;
  const inverse = 1 - alpha;
  canvas.pixels[index] = Math.round(rgba[0] * alpha + canvas.pixels[index] * inverse);
  canvas.pixels[index + 1] = Math.round(rgba[1] * alpha + canvas.pixels[index + 1] * inverse);
  canvas.pixels[index + 2] = Math.round(rgba[2] * alpha + canvas.pixels[index + 2] * inverse);
  canvas.pixels[index + 3] = Math.round(255 * alpha + canvas.pixels[index + 3] * inverse);
}

function insideRoundedRect(px, py, left, top, right, bottom, radius) {
  const dx = Math.max(left + radius - px - 0.5, 0, px + 0.5 - (right - radius));
  const dy = Math.max(top + radius - py - 0.5, 0, py + 0.5 - (bottom - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function fillRoundedRect(canvas, x, y, width, height, radius, rgba) {
  const left = Math.round(x * canvas.scale);
  const top = Math.round(y * canvas.scale);
  const right = Math.round((x + width) * canvas.scale);
  const bottom = Math.round((y + height) * canvas.scale);
  const scaledRadius = radius * canvas.scale;

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      if (insideRoundedRect(px, py, left, top, right, bottom, scaledRadius)) {
        blendPixel(canvas, px, py, rgba);
      }
    }
  }
}

function drawStrokeRoundedRect(canvas, x, y, width, height, radius, stroke, rgba) {
  const left = Math.round(x * canvas.scale);
  const top = Math.round(y * canvas.scale);
  const right = Math.round((x + width) * canvas.scale);
  const bottom = Math.round((y + height) * canvas.scale);
  const outerRadius = radius * canvas.scale;
  const innerLeft = Math.round((x + stroke) * canvas.scale);
  const innerTop = Math.round((y + stroke) * canvas.scale);
  const innerRight = Math.round((x + width - stroke) * canvas.scale);
  const innerBottom = Math.round((y + height - stroke) * canvas.scale);
  const innerRadius = Math.max(0, radius - stroke) * canvas.scale;

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const outer = insideRoundedRect(px, py, left, top, right, bottom, outerRadius);
      const inner = insideRoundedRect(px, py, innerLeft, innerTop, innerRight, innerBottom, innerRadius);
      if (outer && !inner) {
        blendPixel(canvas, px, py, rgba);
      }
    }
  }
}

function fillRect(canvas, x, y, width, height, rgba) {
  fillRoundedRect(canvas, x, y, width, height, 0, rgba);
}

function fillCircle(canvas, cx, cy, radius, rgba) {
  const centerX = cx * canvas.scale;
  const centerY = cy * canvas.scale;
  const scaledRadius = radius * canvas.scale;
  const left = Math.floor(centerX - scaledRadius);
  const right = Math.ceil(centerX + scaledRadius);
  const top = Math.floor(centerY - scaledRadius);
  const bottom = Math.ceil(centerY + scaledRadius);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      if (dx * dx + dy * dy <= scaledRadius * scaledRadius) {
        blendPixel(canvas, x, y, rgba);
      }
    }
  }
}

function drawCapsule(canvas, x, y, width, height, rgba) {
  const radius = height / 2;
  fillRect(canvas, x + radius, y, Math.max(0, width - height), height, rgba);
  fillCircle(canvas, x + radius, y + radius, radius, rgba);
  fillCircle(canvas, x + width - radius, y + radius, radius, rgba);
}

function drawIcon(size) {
  const scale = 4;
  const canvas = makeCanvas(size, scale);
  const ratio = size / 128;
  const unit = (value) => value * ratio;

  fillRoundedRect(canvas, unit(8), unit(8), unit(112), unit(112), unit(28), hexColor("#0f172a"));
  fillRoundedRect(canvas, unit(20), unit(20), unit(88), unit(88), unit(20), hexColor("#172033"));
  drawStrokeRoundedRect(canvas, unit(20), unit(20), unit(88), unit(88), unit(20), unit(6), hexColor("#22d3ee"));
  fillRoundedRect(canvas, unit(31), unit(31), unit(66), unit(66), unit(13), hexColor("#0b1220", 224));
  drawStrokeRoundedRect(canvas, unit(31), unit(31), unit(66), unit(66), unit(13), unit(4), hexColor("#34d399"));

  drawCapsule(canvas, unit(43), unit(39), unit(42), unit(12), hexColor("#f8fafc"));
  drawCapsule(canvas, unit(43), unit(58), unit(42), unit(12), hexColor("#f8fafc"));
  drawCapsule(canvas, unit(43), unit(77), unit(42), unit(12), hexColor("#f8fafc"));
  drawCapsule(canvas, unit(37), unit(45), unit(12), unit(24), hexColor("#f8fafc"));
  drawCapsule(canvas, unit(79), unit(64), unit(12), unit(24), hexColor("#f8fafc"));

  fillRoundedRect(canvas, unit(82), unit(24), unit(18), unit(18), unit(5), hexColor("#fb7185"));
  fillRoundedRect(canvas, unit(25), unit(85), unit(18), unit(18), unit(5), hexColor("#f59e0b"));

  return downsample(canvas, size, scale);
}

function downsample(canvas, size, scale) {
  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const source = ((y * scale + sy) * canvas.width + (x * scale + sx)) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            totals[channel] += canvas.pixels[source + channel];
          }
        }
      }
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[target + channel] = Math.round(totals[channel] / (scale * scale));
      }
    }
  }
  return output;
}

for (const size of SIZES) {
  writeFileSync(join(OUTPUT_DIR, `icon-${size}.png`), encodePng(size, size, drawIcon(size)));
}
