"use client";

import { useState, useEffect, useCallback } from "react";
import { Job, JobStatus } from "@/lib/types";
import { usePolling } from "@/lib/use-polling";
import {
  Loader2, CheckCircle, AlertCircle, Clock, XCircle,
  RotateCcw, Ban, RefreshCw, Download, Scissors,
} from "lucide-react";

interface JobRow extends Job {
  payload: Record<string, unknown>;
  r2_url:  string | null;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  transcribe:     "Analysis",
  identify_clips: "Find Clips",
  cut_clip:       "Cut clip",
  export_clip:    "Export",
};

const JOB_TYPE_ICONS: Record<string, React.ReactNode> = {
  transcribe:     <Scissors className="w-4 h-4" />,
  identify_clips: <Scissors className="w-4 h-4" />,
  cut_clip:       <Scissors className="w-4 h-4" />,
  export_clip:    <Download className="w-4 h-4" />,
};

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; icon: React.ReactNode }> = {
  queued:     { label: "Queued",     dot: "bg-[var(--yt-text-2)]",              icon: <Clock      className="w-3.5 h-3.5" /> },
  processing: { label: "Processing", dot: "bg-[var(--yt-red)] animate-pulse", icon: <Loader2    className="w-3.5 h-3.5 animate-spin" /> },
  done:       { label: "Done",       dot: "bg-green-500",             icon: <CheckCircle className="w-3.5 h-3.5" /> },
  error:      { label: "Error",      dot: "bg-red-500",               icon: <AlertCircle className="w-3.5 h-3.5" /> },
  cancelled:  { label: "Cancelled",  dot: "bg-[#606060]",              icon: <XCircle     className="w-3.5 h-3.5" /> },
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(started: string | null, finished: string | null) {
  if (!started || !finished) return null;
  const s = Math.round((new Date(finished).getTime() - new Date(started).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const chip = (active: boolean) =>
  `px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
    active
      ? "bg-[var(--yt-text)] text-[var(--yt-bg)]"
      : "bg-[var(--yt-surface)] text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)]"
  }`;

export default function JobsPage() {
  const [jobs, setJobs]             = useState<JobRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [actioning, setActioning]   = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    const url = typeFilter === "all" ? "/api/jobs" : `/api/jobs?type=${typeFilter}`;
    const res = await fetch(url);
    if (res.ok) setJobs(await res.json());
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  usePolling(fetchJobs, 5000);

  const cancelJob = async (id: string) => {
    setActioning(id);
    await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
    setActioning(null);
    fetchJobs();
  };

  const retryJob = async (id: string) => {
    setActioning(id);
    await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
    setActioning(null);
    fetchJobs();
  };

  const activeCount = jobs.filter((j) => ["queued", "processing"].includes(j.status)).length;

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 px-8 pt-5 pb-3" style={{ background: "var(--yt-bg)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--yt-text)]">Job History</h1>
            <p className="text-sm text-[var(--yt-text-2)] mt-0.5">
              {activeCount > 0 ? `${activeCount} running` : "All idle"}
            </p>
          </div>
          <button
            onClick={fetchJobs}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)] transition-colors"
            style={{ border: "1px solid var(--yt-border)" }}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2">
          {["all", "transcribe", "identify_clips", "export_clip"].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={chip(typeFilter === t)}>
              {t === "all" ? "All" : JOB_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </header>

      {/* ── List ── */}
      <div className="flex-1 px-8 py-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--yt-surface)" }} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-[var(--yt-text-2)]">
            <p className="text-lg">No jobs yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {jobs.map((job) => {
              const cfg         = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
              const dur         = fmtDuration(job.started_at, job.finished_at);
              const canCancel   = ["queued", "processing"].includes(job.status);
              const canRetry    = ["error", "cancelled"].includes(job.status);
              const isActioning = actioning === job.id;
              const isExport    = job.type === "export_clip";

              return (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-[var(--yt-surface)] transition-colors"
                >
                  {/* Type icon */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[var(--yt-text-2)]"
                    style={{ background: "var(--yt-surface-2)" }}>
                    {JOB_TYPE_ICONS[job.type] ?? <Scissors className="w-4 h-4" />}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--yt-text)]">
                        {JOB_TYPE_LABELS[job.type] ?? job.type}
                      </span>

                      {/* Status dot + label */}
                      <span className="flex items-center gap-1.5 text-xs text-[var(--yt-text-2)]">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>

                      {/* Export tags */}
                      {isExport && job.payload && (
                        <>
                          {job.payload.clip_hook && (
                            <span className="text-xs px-2 py-0.5 rounded-full text-[var(--yt-text-2)] truncate max-w-[200px]"
                              style={{ background: "var(--yt-surface-2)" }}
                              title={job.payload.clip_hook as string}>
                              {(job.payload.clip_hook as string).slice(0, 40)}
                            </span>
                          )}
                          {job.payload.aspect_ratio && (
                            <span className="text-xs px-2 py-0.5 rounded-full text-[var(--yt-text)]"
                              style={{ background: "var(--yt-surface-2)" }}>
                              {job.payload.aspect_ratio as string}
                            </span>
                          )}
                          {job.payload.preset_name && (
                            <span className="text-xs px-2 py-0.5 rounded-full text-[var(--yt-text-2)]"
                              style={{ background: "var(--yt-surface-2)" }}>
                              {job.payload.preset_name as string}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {job.error_msg && (
                      <p className="text-xs text-red-400 mt-0.5 truncate" title={job.error_msg}>
                        {job.error_msg}
                      </p>
                    )}
                  </div>

                  {/* Duration */}
                  {dur && <span className="text-xs text-[var(--yt-text-2)] flex-shrink-0">{dur}</span>}

                  {/* Time */}
                  <span className="text-xs text-[var(--yt-text-2)] flex-shrink-0 hidden sm:block">
                    {fmtTime(job.queued_at)}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isExport && job.status === "done" && job.r2_url && (
                      <a href={job.r2_url} download
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-green-400 hover:bg-[var(--yt-surface-2)] transition-colors"
                        title="Download">
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                    {canCancel && (
                      <button onClick={() => cancelJob(job.id)} disabled={isActioning}
                        className="p-2 rounded-full text-[var(--yt-text-2)] hover:text-red-400 hover:bg-[var(--yt-surface-2)] transition-colors disabled:opacity-40"
                        title="Cancel">
                        {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {canRetry && (
                      <button onClick={() => retryJob(job.id)} disabled={isActioning}
                        className="p-2 rounded-full text-[var(--yt-text-2)] hover:text-[var(--yt-text)] hover:bg-[var(--yt-surface-2)] transition-colors disabled:opacity-40"
                        title="Retry">
                        {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
