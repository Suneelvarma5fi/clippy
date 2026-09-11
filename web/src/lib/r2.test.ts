import { describe, it, expect, beforeAll } from "vitest";

// With R2_PUBLIC_DOMAIN set, freshUrl returns a deterministic public URL and
// never touches the AWS SDK — letting us assert the key construction directly.
let freshenClipThumbnails: typeof import("./r2").freshenClipThumbnails;
let freshenPortraitPreview: typeof import("./r2").freshenPortraitPreview;

beforeAll(async () => {
  process.env.R2_PUBLIC_DOMAIN = "cdn.test";
  process.env.R2_BUCKET = "test-bucket";
  const mod = await import("./r2");
  freshenClipThumbnails = mod.freshenClipThumbnails;
  freshenPortraitPreview = mod.freshenPortraitPreview;
});

describe("freshenClipThumbnails", () => {
  it("re-signs from the clip id key, ignoring the stale stored url", async () => {
    const out = await freshenClipThumbnails([{ id: "abc", thumbnail_url: "https://old/expired.jpg" }]);
    expect(out[0].thumbnail_url).toBe("https://cdn.test/thumbnails/abc.jpg");
  });

  it("leaves clips without a thumbnail untouched", async () => {
    const out = await freshenClipThumbnails([{ id: "abc", thumbnail_url: null }]);
    expect(out[0].thumbnail_url).toBeNull();
  });
});

describe("freshenPortraitPreview", () => {
  it("re-signs from the video id key when a preview exists", async () => {
    const out = await freshenPortraitPreview({ id: "vid1", portrait_preview_url: "https://old/x.jpg" });
    expect(out.portrait_preview_url).toBe("https://cdn.test/previews/vid1/portrait_preview.jpg");
  });

  it("passes through when there is no preview", async () => {
    const out = await freshenPortraitPreview({ id: "vid1", portrait_preview_url: null });
    expect(out.portrait_preview_url).toBeNull();
  });
});
