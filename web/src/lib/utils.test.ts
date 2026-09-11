import { describe, it, expect } from "vitest";
import { cn, formatSeconds } from "./utils";

describe("formatSeconds", () => {
  it("formats m:ss with zero padding", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(9)).toBe("0:09");
    expect(formatSeconds(61.7)).toBe("1:01");
    expect(formatSeconds(600)).toBe("10:00");
  });
});

describe("cn", () => {
  it("merges conditional classes and resolves tailwind conflicts", () => {
    expect(cn("p-2", false && "hidden", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "font-bold")).toBe("text-red-500 font-bold");
  });
});
