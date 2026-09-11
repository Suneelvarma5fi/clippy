import { createHash } from "crypto";
import type { Cut } from "@/lib/types";

/**
 * Bump when the worker's portrait / face-tracking algorithm changes in a way
 * that should invalidate every cached edit. Mirrors the worker — keep in sync.
 */
export const FACE_TRACK_VERSION = "1";

/**
 * Fingerprint of a clip's cuts + the face-track version. This is the cache key
 * for a cached portrait (clip_edits.cuts_hash): same cut → reuse the edit,
 * changed cut → rebuild. Computed only on the web side (lookup happens before
 * any worker runs); the worker just fills in the row it's handed.
 */
export function cutsHash(cuts: Cut[] | null | undefined, version: string = FACE_TRACK_VERSION): string {
  const norm = (cuts ?? []).map((c) => [Number(c.start), Number(c.end)]);
  const payload = JSON.stringify({ v: version, cuts: norm });
  return createHash("sha256").update(payload).digest("hex");
}
