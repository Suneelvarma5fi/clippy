// Video detail skeleton — the page's server component does DB + R2 work before
// it can render, so this ghosts the embed + stats + clip grid during that round-trip.
export default function VideoLoading() {
  return (
    <div className="flex flex-col min-h-full" style={{ background: "var(--yt-bg)" }}>
      <div className="flex flex-col lg:flex-row">
        {/* Left: embed + title */}
        <div className="flex-shrink-0 flex flex-col w-full lg:w-[38%]">
          <div className="px-8 pt-5 pb-3">
            <div className="aspect-video rounded-xl bg-[var(--yt-surface)] animate-pulse" />
          </div>
          <div className="px-8 pb-5 flex flex-col gap-2">
            <div className="h-5 w-5/6 rounded bg-[var(--yt-surface)] animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-[var(--yt-surface)] animate-pulse" />
          </div>
        </div>

        {/* Right: stats */}
        <div className="flex flex-col px-6 py-5 flex-1 min-w-0 border-t lg:border-t-0 lg:border-l border-[rgba(255,255,255,0.05)]">
          <div className="h-8 w-40 rounded-lg bg-[var(--yt-surface)] animate-pulse mb-4" />
          <div className="flex flex-row gap-2 mt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-1 h-14 rounded-lg bg-[var(--yt-surface-2)] animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      {/* Clip grid ghost */}
      <div className="flex-1 px-8 py-5">
        <div className="h-4 w-28 rounded bg-[var(--yt-surface)] animate-pulse mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--yt-border)] bg-[var(--yt-surface)] p-5 flex flex-col gap-3"
            >
              <div className="h-4 w-5/6 rounded bg-[var(--yt-surface-2)] animate-pulse" />
              <div className="h-3 w-full rounded bg-[var(--yt-surface-2)] animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-[var(--yt-surface-2)] animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-[var(--yt-surface-2)] animate-pulse mt-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
