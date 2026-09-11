import { describe, it, expect } from "vitest";
import { groupWordsIntoLines } from "./text-sticker";

describe("groupWordsIntoLines", () => {
  it("groups words sharing a top into one line, in order", () => {
    expect(
      groupWordsIntoLines([
        { word: "wait", top: 0 },
        { word: "for", top: 0 },
        { word: "it", top: 30 },
      ]),
    ).toEqual(["wait for", "it"]);
  });

  it("returns one line when every word shares a top", () => {
    expect(
      groupWordsIntoLines([
        { word: "hello", top: 10 },
        { word: "world", top: 10 },
      ]),
    ).toEqual(["hello world"]);
  });

  it("handles an empty input", () => {
    expect(groupWordsIntoLines([])).toEqual([]);
  });

  it("starts a new line on each distinct top, even non-monotonic", () => {
    expect(
      groupWordsIntoLines([
        { word: "a", top: 0 },
        { word: "b", top: 26 },
        { word: "c", top: 26 },
        { word: "d", top: 52 },
      ]),
    ).toEqual(["a", "b c", "d"]);
  });
});
