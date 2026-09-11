import { describe, it, expect } from "vitest";
import { snapAxis, nudge, CENTER, SNAP_THRESHOLD, POSITION_MIN, POSITION_MAX } from "./editor-bounds";

describe("snapAxis", () => {
  it("locks onto the target within the threshold", () => {
    expect(snapAxis(CENTER + SNAP_THRESHOLD)).toBe(CENTER);
    expect(snapAxis(CENTER - SNAP_THRESHOLD)).toBe(CENTER);
    expect(snapAxis(49)).toBe(CENTER);
  });

  it("passes through outside the threshold", () => {
    expect(snapAxis(CENTER + SNAP_THRESHOLD + 0.1)).toBeCloseTo(52.1);
    expect(snapAxis(30)).toBe(30);
  });

  it("accepts a custom target", () => {
    expect(snapAxis(11, 10, 2)).toBe(10);
    expect(snapAxis(20, 10, 2)).toBe(20);
  });
});

describe("nudge", () => {
  it("moves by delta and clamps to bounds", () => {
    expect(nudge(50, 1)).toBe(51);
    expect(nudge(50, -10)).toBe(40);
    expect(nudge(POSITION_MAX, 10)).toBe(POSITION_MAX);
    expect(nudge(POSITION_MIN, -10)).toBe(POSITION_MIN);
  });

  it("honours custom bounds", () => {
    expect(nudge(2, -5, 0, 10)).toBe(0);
    expect(nudge(9, 5, 0, 10)).toBe(10);
  });
});
