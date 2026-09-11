/**
 * Shared clamp bounds for on-canvas overlay positioning (caption block + sticker).
 * Used by both drag handlers and the Position NumberField so they never disagree.
 * Percentages of the frame; 5–95 keeps overlays fully on-screen.
 */
export const POSITION_MIN = 5;
export const POSITION_MAX = 95;

/** Sticker scale clamp — shared by the Scale field and the on-canvas handle. */
export const STICKER_SCALE_MIN = 0.5;
export const STICKER_SCALE_MAX = 2;

/** Horizontal center of the frame — the sticker snaps to this while dragging. */
export const CENTER = 50;
/** How close (in %) a drag must get to a snap target before it locks on. */
export const SNAP_THRESHOLD = 2;

/**
 * Snap a percentage to `target` when it lands within `threshold`, else pass through.
 * Pure so the sticker's center-snap is unit-testable without a DOM.
 */
export function snapAxis(pct: number, target = CENTER, threshold = SNAP_THRESHOLD): number {
  return Math.abs(pct - target) <= threshold ? target : pct;
}

/** Move `value` by `delta`, clamped to [min,max]. Used by arrow-key nudging. */
export function nudge(value: number, delta: number, min = POSITION_MIN, max = POSITION_MAX): number {
  return Math.max(min, Math.min(max, value + delta));
}
