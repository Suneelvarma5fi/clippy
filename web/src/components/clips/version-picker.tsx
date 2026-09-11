"use client";

import { useState } from "react";
import { History, X, Download, Trash2 } from "lucide-react";
import { VersionedExport, versionLabel } from "@/lib/export-versions";
import { Modal } from "@/components/ui/modal";

interface Props {
  versions: VersionedExport[];          // newest first
  aspectRatio?: string;                 // omit when versions span ratios
  showRatio?: boolean;                  // append each row's ratio to its label
  onSelect: (exp: VersionedExport, label: string) => void;
  onDelete?: (exportId: string) => void;
  onClose: () => void;
}

/** Modal listing every exported version of a clip (one aspect ratio). */
export function VersionPicker({ versions, aspectRatio, showRatio, onSelect, onDelete, onClose }: Props) {
  // Two-step delete: first click arms (3s), second confirms — deletion is permanent.
  const [armedId, setArmedId] = useState<string | null>(null);
  const armOrDelete = (id: string) => {
    if (armedId === id) { setArmedId(null); onDelete?.(id); }
    else { setArmedId(id); setTimeout(() => setArmedId((c) => (c === id ? null : c)), 3000); }
  };
  const rowLabel = (i: number) => {
    const base = versionLabel(i, versions.length, versions[i].created_at);
    return showRatio ? `${base} · ${versions[i].aspect_ratio}` : base;
  };
  return (
    <Modal onClose={onClose} label="Choose a version"
      className="bg-[var(--yt-surface)] border border-[var(--yt-border)] rounded-2xl w-full max-w-md shadow-2xl">
      <div>
        <div className="flex items-center justify-between p-4 border-b border-[var(--yt-border)]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--yt-text)]" />
            <span className="font-semibold text-white text-sm">
              Choose a version{aspectRatio && <span className="text-[var(--yt-text-2)] font-normal"> ({aspectRatio})</span>}
            </span>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-[var(--yt-text-2)] hover:text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2 max-h-80 overflow-y-auto">
          {versions.map((exp, i) => (
            <div
              key={exp.id}
              className="flex items-center rounded-lg hover:bg-[var(--yt-hover)] transition-colors group"
            >
              <button
                onClick={() => onSelect(exp, rowLabel(i))}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <Download className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className={`text-xs ${i === 0 ? "text-white font-medium" : "text-[var(--yt-text)]"}`}>
                  {rowLabel(i)}
                </span>
              </button>
              {onDelete && (
                <button
                  onClick={() => armOrDelete(exp.id)}
                  className={`flex items-center gap-1 px-2.5 py-2.5 transition-all ${
                    armedId === exp.id
                      ? "text-red-300 opacity-100"
                      : "text-[var(--yt-text-2)] hover:text-red-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:opacity-100"
                  }`}
                  title={armedId === exp.id ? "Click again to delete" : "Delete this version"}
                  aria-label={armedId === exp.id ? "Confirm delete version" : "Delete this version"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {armedId === exp.id && <span className="text-[10px] font-semibold">Delete?</span>}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
