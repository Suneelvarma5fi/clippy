"use client";

import { useState } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 3000;

const STATUS_LABELS: Record<string, string> = {
  queued:     "Queued…",
  processing: "Finding clips…",
};

export function IdentifyClipsButton({ videoId, hasClips }: { videoId: string; hasClips?: boolean }) {
  const [state, setState] = useState<"idle" | "confirming" | "working" | "error">("idle");
  const [statusLabel, setStatusLabel] = useState(hasClips ? "Re-run" : "Find Clips");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleClick = () => {
    // Re-run with existing clips: ask whether to keep or delete them first
    if (hasClips && state === "idle") {
      setState("confirming");
      return;
    }
    start(false);
  };

  const start = async (keepExisting: boolean) => {
    setState("working");
    setStatusLabel("Starting…");
    setErrorMsg("");

    try {
      // 1. Queue the job
      const res = await fetch(`/api/videos/${videoId}/identify-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_existing: keepExisting }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start");
      }
      const { job_id } = await res.json();

      // 2. Poll until done or error
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const poll = await fetch(`/api/jobs/${job_id}`);
        if (!poll.ok) continue;                          // transient fetch failure — keep going

        const job = await poll.json();
        setStatusLabel(STATUS_LABELS[job.status] ?? "Working…");

        if (job.status === "done") {
          setState("idle");
          setStatusLabel(hasClips ? "Re-run" : "Find Clips");
          router.refresh();
          return;
        }

        if (job.status === "error") {
          throw new Error(job.error_msg ?? "Clip identification failed");
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message ?? "Something went wrong");
      setState("error");
      setStatusLabel("Find Clips");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={state === "working"}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: "var(--yt-red)", color: "#fff" }}
      >
        {state === "working"
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Sparkles className="w-4 h-4" />}
        {statusLabel}
      </button>

      {state === "confirming" && (
        <div
          className="flex flex-col gap-2 p-3 rounded-xl text-xs"
          style={{ background: "var(--yt-surface)", border: "1px solid var(--yt-border)" }}
        >
          <span style={{ color: "var(--yt-text-2)" }}>
            This video already has clips. What should happen to them?
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => start(true)}
              className="px-3 py-1.5 rounded-full font-medium"
              style={{ background: "var(--yt-surface-2)", border: "1px solid var(--yt-border)", color: "var(--yt-text)" }}
            >
              Keep them
            </button>
            <button
              onClick={() => start(false)}
              className="px-3 py-1.5 rounded-full font-medium text-red-400"
              style={{ background: "var(--yt-surface-2)", border: "1px solid var(--yt-border)" }}
            >
              Delete them
            </button>
            <button
              onClick={() => setState("idle")}
              className="px-2 py-1.5"
              style={{ color: "var(--yt-text-2)" }}
            >
              Cancel
            </button>
          </div>
          <span style={{ color: "var(--yt-text-2)", opacity: 0.7 }}>
            Keep: old clips and their exports stay as a previous generation. Delete: they are removed permanently.
          </span>
        </div>
      )}

      {state === "error" && errorMsg && (
        <p className="flex items-center gap-1 text-xs text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}
