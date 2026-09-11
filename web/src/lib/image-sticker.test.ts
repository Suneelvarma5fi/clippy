import { describe, it, expect } from "vitest";
import { validateStickerPng, clampImageSticker } from "./image-sticker";
import { MAX_IMAGE_STICKER_BYTES } from "./types";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBytes = (size = 64) => {
  const b = new Uint8Array(size);
  b.set(PNG_HEADER, 0);
  return b;
};

describe("validateStickerPng", () => {
  it("accepts a real PNG under the size cap", () => {
    expect(validateStickerPng(pngBytes())).toBeNull();
  });

  it("rejects non-PNG bytes (magic check, not extension)", () => {
    const jpeg = pngBytes();
    jpeg.set([0xff, 0xd8, 0xff, 0xe0], 0);   // JPEG SOI marker
    expect(validateStickerPng(jpeg)).toMatch(/PNG/);
  });

  it("rejects files over the size cap", () => {
    expect(validateStickerPng(pngBytes(MAX_IMAGE_STICKER_BYTES + 1))).toMatch(/too large/);
  });

  it("rejects files too small to be a PNG", () => {
    expect(validateStickerPng(new Uint8Array(4))).toMatch(/PNG/);
  });
});

describe("clampImageSticker", () => {
  it("clamps placement and width into legal ranges", () => {
    const c = clampImageSticker({ r2_key: "stickers/u/x.png", x_pct: 150, y_pct: -10, width_pct: 999 });
    expect(c).toEqual({ r2_key: "stickers/u/x.png", x_pct: 100, y_pct: 0, width_pct: 60 });
  });

  it("falls back to defaults for junk values", () => {
    const c = clampImageSticker({ r2_key: "stickers/u/x.png", x_pct: NaN, y_pct: undefined, width_pct: "nope" as unknown as number });
    expect(c).toEqual({ r2_key: "stickers/u/x.png", x_pct: 50, y_pct: 20, width_pct: 25 });
  });

  it("passes through valid values untouched and drops extra fields (url)", () => {
    const c = clampImageSticker({ r2_key: "stickers/u/x.png", url: "https://x", x_pct: 10, y_pct: 90, width_pct: 30 });
    expect(c).toEqual({ r2_key: "stickers/u/x.png", x_pct: 10, y_pct: 90, width_pct: 30 });
  });
});
