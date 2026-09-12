import { describe, it, expect, vi } from "vitest";
import { nextMenuIndex, onMenuPanelClick } from "./menu";

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

describe("onMenuPanelClick", () => {
  const item = (keepOpen: boolean) => ({
    closest: (sel: string) => (sel === '[role="menuitem"]' ? { hasAttribute: (a: string) => keepOpen && a === "data-keep-open" } : null),
  });
  const ev = (target: unknown) => {
    const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), target: target as EventTarget };
    return e;
  };

  it("prevents the default action so a menu inside a link never navigates", () => {
    const e = ev(item(false)); const close = vi.fn();
    onMenuPanelClick(e, close);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(e.stopPropagation).toHaveBeenCalledOnce();
  });

  it("closes after selecting an item", () => {
    const close = vi.fn();
    onMenuPanelClick(ev(item(false)), close);
    expect(close).toHaveBeenCalledOnce();
  });

  it("stays open for keep-open items and for clicks on non-items", () => {
    const close = vi.fn();
    onMenuPanelClick(ev(item(true)), close);
    onMenuPanelClick(ev({ closest: () => null }), close);
    expect(close).not.toHaveBeenCalled();
  });
});
