/**
 * Queue exports for many clips, sequentially (one POST per clip — sequential
 * keeps us inside rate limits).
 */

export interface BulkExportBody {
  aspect_ratio: string;
  preset_config: unknown;
}

export interface BulkExportResult {
  queued: { clipId: string; exportId: string }[];
  failed: number;          // errors (skipped, loop continues)
}

export async function queueBulkExports(
  clipIds: string[],
  body: BulkExportBody,
  onQueued?: (clipId: string, exportId: string) => void,
  fetchFn: typeof fetch = fetch,
): Promise<BulkExportResult> {
  const result: BulkExportResult = { queued: [], failed: 0 };

  for (const clipId of clipIds) {
    try {
      const res = await fetchFn(`/api/clips/${clipId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        result.failed += 1;
        continue;
      }
      const data = await res.json();
      result.queued.push({ clipId, exportId: data.export_id });
      onQueued?.(clipId, data.export_id);
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
