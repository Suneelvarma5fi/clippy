/**
 * Export version helpers — every re-export creates a new exports row (and a
 * new R2 object), so a clip can accumulate multiple versions per aspect ratio.
 */

export interface VersionedExport {
  id: string;
  aspect_ratio: string;
  r2_url: string | null;
  created_at?: string | null;
}

/**
 * Group exports by aspect ratio, newest first within each group.
 * Insertion order of the groups follows first appearance (API returns
 * newest-first, so the most recently exported ratio leads).
 */
export function groupExportsByRatio<T extends VersionedExport>(exports: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const exp of exports) {
    (groups[exp.aspect_ratio] ??= []).push(exp);
  }
  const byNewest = (a: T, b: T) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  for (const ratio of Object.keys(groups)) groups[ratio].sort(byNewest);
  return groups;
}

/**
 * Label for a version row. `index` is the position in a newest-first list.
 *   index 0 of 3 → "Latest (v3) · Jun 11, 10:42 AM"
 *   index 1 of 3 → "v2 · Jun 10, 6:03 PM"
 */
export function versionLabel(index: number, total: number, createdAt?: string | null): string {
  const v = total - index;
  const name = index === 0 ? (total > 1 ? `Latest (v${v})` : "Latest") : `v${v}`;
  if (!createdAt) return name;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return name;
  const when = d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return `${name} · ${when}`;
}
