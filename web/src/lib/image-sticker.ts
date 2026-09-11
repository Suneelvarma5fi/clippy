import {
  MAX_IMAGE_STICKER_BYTES, IMAGE_STICKER_MIN_WPCT, IMAGE_STICKER_MAX_WPCT,
  ImageStickerConfig,
} from "./types";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Validate an uploaded sticker image: must be a real PNG (magic bytes, not just
 * the file extension) and within the size cap. Returns an error message or null.
 */
export function validateStickerPng(bytes: Uint8Array): string | null {
  if (bytes.byteLength > MAX_IMAGE_STICKER_BYTES) {
    return `Image is too large — max ${Math.round(MAX_IMAGE_STICKER_BYTES / 1024 / 1024)} MB.`;
  }
  if (bytes.byteLength < PNG_MAGIC.length + 4) return "That file doesn't look like a PNG.";
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return "Only PNG files are supported.";
  }
  return null;
}

const clampN = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

/**
 * Clamp placement numbers into their legal ranges (server-side defense — the
 * client sends whatever its UI produced).
 */
export function clampImageSticker(cfg: Partial<ImageStickerConfig> & { r2_key: string }): {
  r2_key: string; x_pct: number; y_pct: number; width_pct: number;
} {
  return {
    r2_key: cfg.r2_key,
    x_pct: clampN(cfg.x_pct, 0, 100, 50),
    y_pct: clampN(cfg.y_pct, 0, 100, 20),
    width_pct: clampN(cfg.width_pct, IMAGE_STICKER_MIN_WPCT, IMAGE_STICKER_MAX_WPCT, 25),
  };
}
