import { describe, it, expect } from "vitest";
import { cutsHash, FACE_TRACK_VERSION } from "./cuts-hash";

describe("cutsHash", () => {
  const cuts = [{ start: 10, end: 25 }, { start: 50, end: 61 }];

  it("is stable for the same cuts + version", () => {
    expect(cutsHash(cuts)).toBe(cutsHash(cuts));
  });

  it("changes when a cut boundary changes", () => {
    expect(cutsHash(cuts)).not.toBe(cutsHash([{ start: 10, end: 26 }, { start: 50, end: 61 }]));
  });

  it("changes when the face-track version changes", () => {
    expect(cutsHash(cuts, "1")).not.toBe(cutsHash(cuts, "2"));
  });

  it("treats null/undefined/empty cuts as the same key", () => {
    expect(cutsHash(null)).toBe(cutsHash([]));
    expect(cutsHash(undefined)).toBe(cutsHash([]));
  });

  it("defaults to FACE_TRACK_VERSION", () => {
    expect(cutsHash(cuts)).toBe(cutsHash(cuts, FACE_TRACK_VERSION));
  });
});
