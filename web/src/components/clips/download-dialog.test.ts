import { describe, it, expect } from "vitest";
import { defaultFilename, downloadHref } from "./download-dialog";

describe("defaultFilename", () => {
  it("slugifies the hook and appends ratio + timestamp + .mp4", () => {
    const name = defaultFilename("Why 90% of Startups FAIL!", "9:16");
    expect(name).toMatch(/^why_90_of_startups_fail_9_16_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.mp4$/);
  });

  it("falls back to 'clip' when the hook has no usable characters", () => {
    expect(defaultFilename("!!!", "16:9")).toMatch(/^clip_16_9_/);
    expect(defaultFilename("", "16:9")).toMatch(/^clip_16_9_/);
  });

  it("truncates very long hooks to a 40-char slug source", () => {
    const name = defaultFilename("a".repeat(200), "9:16");
    const slug = name.split("_9_16_")[0];
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

describe("downloadHref", () => {
  it("points at the same-origin export download route", () => {
    expect(downloadHref("abc-123", "clip.mp4")).toBe(
      "/api/exports/abc-123/download?filename=clip.mp4",
    );
  });

  it("url-encodes the filename so spaces and reserved chars are safe", () => {
    expect(downloadHref("id", "my clip & more.mp4")).toBe(
      "/api/exports/id/download?filename=my%20clip%20%26%20more.mp4",
    );
  });
});
