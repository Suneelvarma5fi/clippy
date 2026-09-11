/**
 * Save a remote file to disk, letting the user pick location + name where the
 * browser allows it.
 *
 * 1. Chrome/Edge: showSaveFilePicker → real OS "Save As" dialog (user chooses
 *    folder and filename), then the download streams straight to disk.
 * 2. Other browsers: fetch → blob → object-URL anchor, which honours our
 *    filename even for cross-origin URLs (a plain <a download> does not).
 *    Location follows the browser's download settings ("ask where to save").
 * 3. If the fetch is blocked (e.g. CORS): plain anchor as a last resort —
 *    the file still downloads, but the browser may use the server's name.
 */

type SaveResult = "saved" | "cancelled" | "fallback";

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<WritableStream> }>;
}

function clickAnchor(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function canPickSaveLocation(): boolean {
  return typeof window !== "undefined" &&
    typeof (window as SaveFilePickerWindow).showSaveFilePicker === "function";
}

export async function saveUrlAs(url: string, filename: string): Promise<SaveResult> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;

  if (picker) {
    let handle: { createWritable: () => Promise<WritableStream> } | null = null;
    try {
      // Must be called synchronously within the user gesture — before any fetch
      handle = await picker({
        suggestedName: filename,
        types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }],
      });
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      handle = null; // picker unavailable in this context → fall through
    }
    if (handle) {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
      await res.body.pipeTo(await handle.createWritable());
      return "saved";
    }
  }

  return downloadUrl(url, filename);
}

/**
 * Download without any save-location prompt (used by the "don't ask again"
 * preference): blob + object-URL anchor so the filename is honoured, plain
 * anchor if the fetch is blocked.
 */
export async function downloadUrl(url: string, filename: string): Promise<SaveResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    clickAnchor(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return "saved";
  } catch {
    clickAnchor(url, filename);
    return "fallback";
  }
}
