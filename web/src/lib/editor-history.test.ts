import { describe, it, expect } from "vitest";
import { initHistory, pushHistory, undo, redo, canUndo, canRedo } from "./editor-history";

describe("editor-history", () => {
  it("starts empty and cannot undo/redo", () => {
    const h = initHistory("a");
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("push then undo round-trips the present", () => {
    let h = initHistory("a");
    h = pushHistory(h, "b");
    expect(h.present).toBe("b");
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canRedo(h)).toBe(true);
  });

  it("redo re-applies an undone state", () => {
    let h = pushHistory(initHistory("a"), "b");
    h = undo(h);
    h = redo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(false);
  });

  it("pushing after undo drops the redo stack", () => {
    let h = pushHistory(initHistory("a"), "b");
    h = undo(h);          // present "a", future ["b"]
    h = pushHistory(h, "c");
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
  });

  it("undo/redo are no-ops at the ends (same reference)", () => {
    const h = initHistory("a");
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("caps the past at the limit", () => {
    let h = initHistory(0);
    for (let i = 1; i <= 60; i++) h = pushHistory(h, i, 50);
    expect(h.past.length).toBe(50);
    expect(h.present).toBe(60);
  });
});
