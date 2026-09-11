"use client";

import { useState, useMemo } from "react";
import { Download, Edit2, Check, X, Search, RefreshCw } from "lucide-react";
import { Transcript } from "@/lib/types";

interface Props {
  transcript: Transcript;
  videoTitle: string;
}

function formatSeconds(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Detect unique speaker IDs in segments
function extractSpeakers(transcript: Transcript): string[] {
  const ids = new Set<string>();
  (transcript.segments as any[]).forEach((s: any) => {
    if (s.speaker) ids.add(s.speaker);
  });
  return Array.from(ids).sort();
}

function toSRT(segments: any[]) {
  return segments
    .map((seg: any, i: number) => {
      const toTC = (s: number) => {
        const h  = Math.floor(s / 3600);
        const m  = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        const ms = Math.round((s % 1) * 1000);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
      };
      return `${i + 1}\n${toTC(seg.start)} --> ${toTC(seg.end)}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

export function TranscriptViewer({ transcript, videoTitle }: Props) {
  const [search, setSearch]                   = useState("");
  const [speakerLabels, setSpeakerLabels]     = useState<Record<string, string>>(
    (transcript.speaker_labels as Record<string, string>) ?? {}
  );
  const [editingSpeaker, setEditingSpeaker]   = useState<string | null>(null);
  const [speakerDraft, setSpeakerDraft]       = useState("");
  const [saving, setSaving]                   = useState(false);

  const segments = transcript.segments as any[];
  const words    = transcript.raw_words as any[];
  const speakers = useMemo(() => extractSpeakers(transcript), [transcript]);

  const displayName = (id: string) => speakerLabels[id] ?? id;

  // Save updated speaker label to Supabase via API
  const saveSpeakerLabel = async (speakerId: string, label: string) => {
    setSaving(true);
    const updated = { ...speakerLabels, [speakerId]: label.trim() || speakerId };
    setSpeakerLabels(updated);
    setEditingSpeaker(null);
    try {
      await fetch(`/api/transcripts/${transcript.id}/speakers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker_labels: updated }),
      });
    } catch {
      // Non-fatal — labels are updated locally
    } finally {
      setSaving(false);
    }
  };

  // Filtered segments
  const filtered = useMemo(
    () =>
      segments.filter((seg: any) =>
        !search || seg.text.toLowerCase().includes(search.toLowerCase())
      ),
    [segments, search]
  );

  const matchCount = useMemo(() => countMatches(segments, search), [segments, search]);

  // Export helpers
  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportTXT  = () => downloadBlob(transcript.full_text ?? "", `${videoTitle}.txt`, "text/plain");
  const exportSRT  = () => downloadBlob(toSRT(segments), `${videoTitle}.srt`, "text/srt");
  const exportJSON = () =>
    downloadBlob(
      JSON.stringify({ language: transcript.language, words, segments }, null, 2),
      `${videoTitle}.json`,
      "application/json"
    );

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Transcript</h1>
          <p className="text-xs text-[var(--yt-text-2)] mt-1">
            Language: {transcript.language ?? "auto"} · {words.length} words · {segments.length} segments
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportBtn label="TXT"  onClick={exportTXT}  />
          <ExportBtn label="SRT"  onClick={exportSRT}  />
          <ExportBtn label="JSON" onClick={exportJSON} />
        </div>
      </div>

      {/* Speaker label renaming */}
      {speakers.length > 0 && (
        <div className="bg-[var(--yt-surface)] border border-[var(--yt-border)] rounded-xl p-4 mb-5">
          <h2 className="text-sm font-medium text-white mb-3">Speaker Labels</h2>
          <div className="flex flex-wrap gap-3">
            {speakers.map((spk) => (
              <div key={spk} className="flex items-center gap-2">
                {editingSpeaker === spk ? (
                  <>
                    <input
                      value={speakerDraft}
                      onChange={(e) => setSpeakerDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveSpeakerLabel(spk, speakerDraft);
                        if (e.key === "Escape") setEditingSpeaker(null);
                      }}
                      autoFocus
                      className="px-2 py-1 text-xs bg-[var(--yt-surface-2)] border border-[#606060] rounded text-white w-28 focus:outline-none"
                    />
                    <button aria-label="Save speaker name" onClick={() => saveSpeakerLabel(spk, speakerDraft)}
                      className="text-green-400 hover:text-green-300">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button aria-label="Cancel" onClick={() => setEditingSpeaker(null)}
                      className="text-[var(--yt-text-2)] hover:text-[var(--yt-text)]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button aria-label="Rename speaker"
                    onClick={() => { setEditingSpeaker(spk); setSpeakerDraft(displayName(spk)); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-[var(--yt-surface-2)] hover:bg-[var(--yt-hover)] border border-[var(--yt-border)] rounded-full text-[var(--yt-text)] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-[var(--yt-text-2)] flex-shrink-0" />
                    {displayName(spk)}
                    <Edit2 className="w-2.5 h-2.5 text-[var(--yt-text-2)] ml-0.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {saving && (
            <p className="text-xs text-[var(--yt-text-2)] mt-2 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Saving…
            </p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--yt-text-2)]" />
        <input
          type="text"
          placeholder="Search transcript…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-4 py-2 bg-[var(--yt-surface)] border border-[var(--yt-border)] rounded-lg text-sm text-white placeholder-[var(--yt-text-2)] focus:outline-none focus:ring-1 focus:ring-[var(--yt-text-2)]"
        />
        {search && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--yt-text-2)] tabular-nums">
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {/* Segments */}
      <div className="space-y-0.5">
        {filtered.map((seg: any, i: number) => (
          <div key={i} className="flex gap-4 py-2 border-b border-[var(--yt-border)]/50 group">
            <div className="flex flex-col gap-0.5 flex-shrink-0 w-24 pt-0.5">
              <span className="text-xs text-[var(--yt-text-2)] font-mono">{formatSeconds(seg.start)}</span>
              {seg.speaker && (
                <span className="text-[10px] text-[var(--yt-text)] font-medium truncate">
                  {displayName(seg.speaker)}
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--yt-text)] flex-1">
              {search
                ? highlightText(seg.text, search)
                : seg.text}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center py-12 text-[var(--yt-text-2)]">No segments match "{search}"</p>
        )}
      </div>
    </>
  );
}

function ExportBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--yt-surface-2)] hover:bg-[var(--yt-hover)] text-[var(--yt-text)] text-xs font-medium rounded-lg transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// Highlight *every* occurrence of the query in the segment, not just the first.
function highlightText(text: string, query: string) {
  if (!query) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(q);
  let key = 0;
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark key={key++} className="bg-yellow-400/30 text-yellow-200 rounded">{text.slice(idx, idx + query.length)}</mark>,
    );
    last = idx + query.length;
    idx = lower.indexOf(q, last);
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// Count occurrences of `query` across all segments (for the "N matches" readout).
export function countMatches(segments: { text: string }[], query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  return segments.reduce((n, seg) => {
    const lower = seg.text.toLowerCase();
    let c = 0;
    let i = lower.indexOf(q);
    while (i !== -1) { c++; i = lower.indexOf(q, i + q.length); }
    return n + c;
  }, 0);
}
