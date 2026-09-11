"use client";

/**
 * ExportTrackerProvider — wraps the dashboard layout.
 *
 * Any component can call `useExportTracker().trackExport(id, label)` right
 * after queuing an export.  The provider polls every 5 s and shows a toast
 * in the bottom-right corner when the export finishes (or errors).
 */

import {
  createContext, useContext, useState, useEffect, useRef, useCallback,
} from "react";
import { CheckCircle, AlertCircle, Download, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackedExport {
  id:      string;
  label:   string;
  status:  "polling" | "done" | "error";
  r2_url?: string;
}

interface ExportTrackerCtx {
  trackExport: (id: string, label: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<ExportTrackerCtx>({ trackExport: () => {} });

export function useExportTracker() {
  return useContext(Ctx);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ExportTrackerProvider({ children }: { children: React.ReactNode }) {
  const [exports, setExports] = useState<TrackedExport[]>([]);

  // Keep a ref so the polling interval can always read the latest state
  // without needing to be re-created every time exports changes.
  const exportsRef = useRef(exports);
  exportsRef.current = exports;

  const trackExport = useCallback((id: string, label: string) => {
    setExports((prev) =>
      prev.find((e) => e.id === id) ? prev : [...prev, { id, label, status: "polling" }],
    );
  }, []);

  // One stable interval — reads current tracked exports via ref.
  useEffect(() => {
    const poll = async () => {
      const polling = exportsRef.current.filter((e) => e.status === "polling");
      if (polling.length === 0) return;

      const results = await Promise.all(
        polling.map(async (e) => {
          try {
            const res = await fetch(`/api/exports/${e.id}`);
            if (!res.ok) return null;
            const d = await res.json();
            if (d.status === "done")  return { id: e.id, status: "done"  as const, r2_url: d.r2_url };
            if (d.status === "error") return { id: e.id, status: "error" as const };
          } catch { /* network blip — retry next tick */ }
          return null;
        }),
      );

      const changes = results.filter(Boolean);
      if (changes.length > 0) {
        setExports((prev) =>
          prev.map((e) => {
            const c = changes.find((r) => r?.id === e.id);
            return c ? { ...e, ...c } : e;
          }),
        );
      }
    };

    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, []); // intentionally empty — interval is stable

  const dismiss = useCallback((id: string) => {
    setExports((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ trackExport }}>
      {children}
      <ToastList
        items={exports.filter((e) => e.status !== "polling")}
        onDismiss={dismiss}
      />
    </Ctx.Provider>
  );
}

// ── Toast list (fixed overlay) ────────────────────────────────────────────────

function ToastList({
  items,
  onDismiss,
}: {
  items: TrackedExport[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-72 pointer-events-none">
      {items.map((e) => (
        <ExportToast key={e.id} entry={e} onDismiss={() => onDismiss(e.id)} />
      ))}
    </div>
  );
}

function ExportToast({
  entry,
  onDismiss,
}: {
  entry: TrackedExport;
  onDismiss: () => void;
}) {
  // Auto-dismiss after done/error (the card is the source of truth for
  // in-flight progress; the toast only announces the terminal state).
  useEffect(() => {
    const t = setTimeout(onDismiss, 20_000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const ok = entry.status === "done";

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl ${
        ok
          ? "bg-green-950 border-green-800"
          : "bg-red-950 border-red-800"
      }`}
    >
      {ok
        ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
        : <AlertCircle className="w-4 h-4 text-red-400   flex-shrink-0 mt-0.5" />}

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${ok ? "text-green-300" : "text-red-300"}`}>
          {ok ? "Export complete" : "Export failed"}
        </p>
        <p className="text-[10px] text-[var(--yt-text-2)] mt-0.5 truncate">{entry.label}</p>

        {ok && entry.r2_url && (
          <a
            href={entry.r2_url}
            download
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
          >
            <Download className="w-3 h-3" />
            Download
          </a>
        )}
      </div>

      <button aria-label="Dismiss"
        onClick={onDismiss}
        className="text-[var(--yt-text-2)] hover:text-[var(--yt-text-2)] flex-shrink-0 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
