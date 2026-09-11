import { describe, it, expect } from "vitest";
import { exportProgressPct, transcribingPct, identifyingPct } from "./processing-progress";

describe("exportProgressPct", () => {
  it("returns the 2% floor when no start time is known", () => {
    expect(exportProgressPct(null)).toBe(2);
    expect(exportProgressPct(undefined)).toBe(2);
  });

  it("starts near 2% for a just-started export", () => {
    const pct = exportProgressPct(new Date().toISOString());
    expect(pct).toBeGreaterThanOrEqual(2);
    expect(pct).toBeLessThan(3);
  });

  it("reaches ~46% at the 90s midpoint of the 180s window", () => {
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    expect(exportProgressPct(startedAt)).toBeCloseTo(2 + 44, 0);
  });

  it("caps at 90% for long-running exports", () => {
    const startedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(exportProgressPct(startedAt)).toBe(90);
  });
});

describe("transcribingPct", () => {
  it("starts near the 5% floor for a just-created video", () => {
    const pct = transcribingPct(new Date().toISOString());
    expect(pct).toBeGreaterThanOrEqual(5);
    expect(pct).toBeLessThan(6);
  });

  it("reaches ~35% at the 90s midpoint of the 180s window", () => {
    const createdAt = new Date(Date.now() - 90_000).toISOString();
    expect(transcribingPct(createdAt)).toBeCloseTo(5 + 30, 0);
  });

  it("caps at 64%", () => {
    const createdAt = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(transcribingPct(createdAt)).toBe(64);
  });
});

describe("identifyingPct", () => {
  it("starts at the 68% floor when identifying just began", () => {
    expect(identifyingPct(Date.now())).toBeCloseTo(68, 0);
  });

  it("falls back to the 68% floor when no start time is known", () => {
    expect(identifyingPct(null)).toBeCloseTo(68, 0);
  });

  it("reaches ~79% at the 45s midpoint of the 90s window", () => {
    expect(identifyingPct(Date.now() - 45_000)).toBeCloseTo(68 + 11, 0);
  });

  it("caps at 90%", () => {
    expect(identifyingPct(Date.now() - 10 * 60_000)).toBe(90);
  });
});
