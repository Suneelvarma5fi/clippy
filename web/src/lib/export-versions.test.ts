import { describe, it, expect } from "vitest";
import { groupExportsByRatio, versionLabel } from "./export-versions";

const exp = (id: string, ratio: string, createdAt: string) => ({
  id, aspect_ratio: ratio, r2_url: `https://cdn/${id}.mp4`, created_at: createdAt,
});

describe("groupExportsByRatio", () => {
  it("groups by aspect ratio, newest first within each group", () => {
    const groups = groupExportsByRatio([
      exp("a", "9:16", "2026-06-10T10:00:00Z"),
      exp("b", "16:9", "2026-06-11T10:00:00Z"),
      exp("c", "9:16", "2026-06-11T09:00:00Z"),
    ]);
    expect(Object.keys(groups).sort()).toEqual(["16:9", "9:16"]);
    expect(groups["9:16"].map((e) => e.id)).toEqual(["c", "a"]);  // newest first
    expect(groups["16:9"].map((e) => e.id)).toEqual(["b"]);
  });

  it("handles empty input and missing created_at", () => {
    expect(groupExportsByRatio([])).toEqual({});
    const groups = groupExportsByRatio([
      { id: "x", aspect_ratio: "9:16", r2_url: null },
      exp("y", "9:16", "2026-06-11T10:00:00Z"),
    ]);
    expect(groups["9:16"][0].id).toBe("y");  // dated export beats undated
  });
});

describe("versionLabel", () => {
  it("marks the newest as Latest with the version number when there are several", () => {
    expect(versionLabel(0, 3, null)).toBe("Latest (v3)");
    expect(versionLabel(1, 3, null)).toBe("v2");
    expect(versionLabel(2, 3, null)).toBe("v1");
  });

  it("omits the version number when there is only one", () => {
    expect(versionLabel(0, 1, null)).toBe("Latest");
  });

  it("appends a readable timestamp when created_at is valid", () => {
    const label = versionLabel(0, 2, "2026-06-11T10:42:00");
    expect(label).toMatch(/^Latest \(v2\) · /);
    expect(label).toContain("Jun 11");
    expect(versionLabel(0, 2, "not-a-date")).toBe("Latest (v2)");
  });
});
