import { describe, it, expect } from "vitest";
import { captionPreviewWords, placePopover } from "./template-controls";

describe("captionPreviewWords", () => {
  it("uses the first transcript words, capped at 5", () => {
    expect(captionPreviewWords("the quick brown fox jumps over the lazy dog")).toEqual([
      "the", "quick", "brown", "fox", "jumps",
    ]);
  });

  it("returns all words when fewer than the cap", () => {
    expect(captionPreviewWords("hello there")).toEqual(["hello", "there"]);
  });

  it("collapses extra whitespace", () => {
    expect(captionPreviewWords("  hi   world  ")).toEqual(["hi", "world"]);
  });

  it("falls back to placeholder when transcript is missing or empty", () => {
    expect(captionPreviewWords(null)).toEqual(["GREAT", "CONTENT", "STARTS"]);
    expect(captionPreviewWords(undefined)).toEqual(["GREAT", "CONTENT", "STARTS"]);
    expect(captionPreviewWords("   ")).toEqual(["GREAT", "CONTENT", "STARTS"]);
  });
});

describe("placePopover", () => {
  const size = { w: 220, h: 340 };
  const viewport = { w: 1440, h: 900 };

  it("opens below the trigger when there is room", () => {
    const p = placePopover({ top: 100, bottom: 130, left: 300 }, size, viewport);
    expect(p).toEqual({ top: 136, left: 300 });
  });

  it("flips above the trigger near the bottom of the screen", () => {
    const p = placePopover({ top: 800, bottom: 830, left: 300 }, size, viewport);
    expect(p.top).toBe(800 - 340 - 6);           // above, with the same gap
    expect(p.top + size.h).toBeLessThan(800);    // no overlap with the trigger
  });

  it("clamps inside the viewport when it fits neither below nor above", () => {
    const p = placePopover({ top: 100, bottom: 130, left: 300 }, size, { w: 1440, h: 400 });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + size.h).toBeLessThanOrEqual(400 - 8);
  });

  it("clamps horizontally on both edges", () => {
    expect(placePopover({ top: 0, bottom: 30, left: 1400 }, size, viewport).left).toBe(1440 - 220 - 8);
    expect(placePopover({ top: 0, bottom: 30, left: -50 }, size, viewport).left).toBe(8);
  });
});
