import { describe, it, expect } from "vitest";
import { nextMenuIndex } from "./menu";

describe("nextMenuIndex", () => {
  it("returns null when there are no items", () => {
    expect(nextMenuIndex(0, -1, "ArrowDown")).toBeNull();
  });

  it("moves down and wraps at the bottom", () => {
    expect(nextMenuIndex(3, 0, "ArrowDown")).toBe(1);
    expect(nextMenuIndex(3, 2, "ArrowDown")).toBe(0);
  });

  it("moves up and wraps at the top", () => {
    expect(nextMenuIndex(3, 2, "ArrowUp")).toBe(1);
    expect(nextMenuIndex(3, 0, "ArrowUp")).toBe(2);
  });

  it("jumps to first/last with Home/End", () => {
    expect(nextMenuIndex(4, 2, "Home")).toBe(0);
    expect(nextMenuIndex(4, 1, "End")).toBe(3);
  });

  it("opens onto the first item when nothing is focused (ArrowDown from -1)", () => {
    expect(nextMenuIndex(3, -1, "ArrowDown")).toBe(0);
  });

  it("ignores keys that do not move focus", () => {
    expect(nextMenuIndex(3, 0, "Enter")).toBeNull();
    expect(nextMenuIndex(3, 0, "a")).toBeNull();
  });
});
