/**
 * Minimal past/present/future history for the export editor's undo/redo.
 * Pure and generic so it's unit-testable without React.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Record a new present, dropping the redo stack. Caps `past` at `limit`. */
export function pushHistory<T>(h: History<T>, next: T, limit = 50): History<T> {
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}

/** Step back. Returns the same object when there's nothing to undo. */
export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

/** Step forward. Returns the same object when there's nothing to redo. */
export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
