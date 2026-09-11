/**
 * Single source of truth for time-based progress curves.
 * Each stage climbs from its floor toward a cap over an expected duration,
 * seeded from a known start time; the caller shows 100 when actually done.
 */

/** Export render: 2 → 90 over 180s, seeded from the export's updated_at. */
export function exportProgressPct(startedAt: string | null | undefined): number {
  if (!startedAt) return 2;
  const ms = Date.now() - new Date(startedAt).getTime();
  return Math.min(2 + (ms / 180_000) * 88, 90);
}

/** Transcription: 5 → 64 over 180s, seeded from the video's created_at. */
export function transcribingPct(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.min(5 + (ms / 180_000) * 60, 64);
}

/** Clip identification: 68 → 90 over 90s, seeded from when identifying began. */
export function identifyingPct(startedAtMs: number | null): number {
  const ms = Date.now() - (startedAtMs ?? Date.now());
  return Math.min(68 + (ms / 90_000) * 22, 90);
}
