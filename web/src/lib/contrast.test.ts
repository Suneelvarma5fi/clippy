import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance } from "./contrast";

describe("contrastRatio", () => {
  it("is ~21 for black vs white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("is 1 for identical colors (white on white)", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    expect(contrastRatio("#1d4ed8", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#1d4ed8"),
      5,
    );
  });

  it("the vetted Cobalt pair clears the AA-large threshold of 3", () => {
    expect(contrastRatio("#1d4ed8", "#ffffff")).toBeGreaterThan(3);
  });

  it("falls back to 1 on malformed hex", () => {
    expect(contrastRatio("#fff", "nope")).toBe(1);
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});
