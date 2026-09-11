// Generic route fallback shown while a dashboard segment streams in.
// Per-route skeletons (library, video/[id]) override this where they exist.
export default function Loading() {
  return (
    <div className="px-8 py-4">
      <div className="h-4 w-40 rounded bg-[var(--yt-surface)] animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="aspect-video rounded-xl bg-[var(--yt-surface)] animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-[var(--yt-surface)] animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[var(--yt-surface)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
