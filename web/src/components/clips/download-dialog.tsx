"use client";

import { useState, useEffect, useRef } from "react";
import { Download, X, FolderOpen, Loader2 } from "lucide-react";
import { saveUrlAs, canPickSaveLocation } from "@/lib/save-file";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const STORAGE_KEY_SKIP = "downloadDialog_skip";
const STORAGE_KEY_PATH_NOTE = "downloadDialog_pathNote";

function slugify(text: string): string {
  return text
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function defaultFilename(hook: string, aspectRatio: string): string {
  const slug = slugify(hook) || "clip";
  const now = new Date();
  const ts =
    now.getFullYear() +
    "-" + String(now.getMonth() + 1).padStart(2, "0") +
    "-" + String(now.getDate()).padStart(2, "0") +
    "_" + String(now.getHours()).padStart(2, "0") +
    "-" + String(now.getMinutes()).padStart(2, "0") +
    "-" + String(now.getSeconds()).padStart(2, "0");
  const ratio = aspectRatio.replace(/[^a-z0-9]/gi, "_");
  return `${slug}_${ratio}_${ts}.mp4`;
}

/** Same-origin streaming endpoint — proxies the R2 object so the browser saves
 *  it instead of navigating to the cross-origin storage URL. */
function downloadHref(exportId: string, filename: string): string {
  return `/api/exports/${exportId}/download?filename=${encodeURIComponent(filename)}`;
}

interface Props {
  exportId: string;
  hook: string;
  aspectRatio: string;
  versionLabel?: string;   // shown when the user picked a specific version
  onClose: () => void;
}

export function DownloadDialog({ exportId, hook, aspectRatio, versionLabel, onClose }: Props) {
  const [filename, setFilename] = useState(() => defaultFilename(hook, aspectRatio));
  const [skipFuture, setSkipFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleDownload = async () => {
    if (saving) return;
    if (skipFuture) {
      localStorage.setItem(STORAGE_KEY_SKIP, "1");
    }
    setError(null);
    setSaving(true);
    try {
      const name = filename.trim() || defaultFilename(hook, aspectRatio);
      const result = await saveUrlAs(downloadHref(exportId, name), name);
      if (result === "cancelled") return;   // user closed the OS dialog — keep ours open
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed — try again");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleDownload();
  };

  return (
    <Modal onClose={onClose} initialFocus={inputRef} label="Download clip"
      className="bg-[var(--yt-surface)] border border-[var(--yt-border)] rounded-2xl w-full max-w-md shadow-2xl">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--yt-border)]">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[var(--yt-text)]" />
            <span className="font-semibold text-white text-sm">Download clip</span>
            {versionLabel && (
              <span className="text-xs text-[var(--yt-text-2)] bg-[var(--yt-surface-2)] px-2 py-0.5 rounded-full">{versionLabel}</span>
            )}
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-[var(--yt-text-2)] hover:text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-[var(--yt-text-2)] mb-1.5">Filename</label>
            <input
              ref={inputRef}
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-[var(--yt-surface-2)] border border-[var(--yt-border)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--yt-text-2)] focus:outline-none focus:border-[var(--yt-text-2)] transition-colors"
            />
          </div>

          <p className="text-xs text-[var(--yt-text-2)] flex items-start gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {canPickSaveLocation()
              ? "You'll choose where to save the file in the next step."
              : "The file will be saved to your browser's default download folder. Change the save location in your browser settings."}
          </p>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipFuture}
              onChange={(e) => setSkipFuture(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--yt-border)] accent-white"
            />
            <span className="text-xs text-[var(--yt-text-2)]">
              Don&apos;t ask again — always download with auto-generated name
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--yt-border)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--yt-text-2)] hover:text-[var(--yt-text)] rounded-lg hover:bg-[var(--yt-hover)] transition-colors"
          >
            Cancel
          </button>
          <Button variant="white" onClick={handleDownload} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Download"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Returns true if the dialog should be skipped (user checked "don't ask again") */
export function shouldSkipDownloadDialog(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_SKIP) === "1";
}

/** Reset the "don't ask again" preference */
export function resetDownloadDialogPref(): void {
  localStorage.removeItem(STORAGE_KEY_SKIP);
  localStorage.removeItem(STORAGE_KEY_PATH_NOTE);
}

export { defaultFilename, downloadHref };
