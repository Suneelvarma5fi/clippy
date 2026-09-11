import { describe, it, expect } from "vitest";
import { computeTabWrap } from "./modal";

describe("computeTabWrap", () => {
  it("returns null when there is nothing focusable", () => {
    expect(computeTabWrap(0, -1, false)).toBeNull();
    expect(computeTabWrap(0, -1, true)).toBeNull();
  });

  it("wraps forward from the last element to the first", () => {
    expect(computeTabWrap(3, 2, false)).toBe(0);
  });

  it("wraps backward from the first element to the last", () => {
    expect(computeTabWrap(3, 0, true)).toBe(2);
  });

  it("does not wrap in the middle of the list", () => {
    expect(computeTabWrap(3, 1, false)).toBeNull();
    expect(computeTabWrap(3, 1, true)).toBeNull();
  });

  it("treats focus outside the panel (index -1) as needing a backward wrap", () => {
    expect(computeTabWrap(3, -1, true)).toBe(2);
    expect(computeTabWrap(3, -1, false)).toBeNull();
  });
});
