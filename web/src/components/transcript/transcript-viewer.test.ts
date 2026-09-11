import { describe, it, expect } from "vitest";
import { countMatches } from "./transcript-viewer";

describe("countMatches", () => {
  const segs = [{ text: "the cat sat on the mat" }, { text: "THE end" }, { text: "nothing here" }];

  it("returns 0 for an empty query", () => {
    expect(countMatches(segs, "")).toBe(0);
  });

  it("counts every occurrence across segments, case-insensitively", () => {
    expect(countMatches(segs, "the")).toBe(3); // "the"×2 in seg0, "THE" in seg1
  });

  it("counts multiple hits within one segment", () => {
    expect(countMatches([{ text: "aaaa" }], "aa")).toBe(2); // non-overlapping
  });

  it("returns 0 when nothing matches", () => {
    expect(countMatches(segs, "zebra")).toBe(0);
  });
});
