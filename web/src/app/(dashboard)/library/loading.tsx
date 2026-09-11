// Library route skeleton — mirrors the card grid the page renders once loaded.
export default function LibraryLoading() {
  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 px-8 pt-4 pb-3" style={{ background: "var(--yt-bg)" }}>
        <div className="h-8 w-48 rounded-full bg-[var(--yt-surface)] animate-pulse" />
      </header>
      <div className="flex-1 px-8 py-4">
        <div className="h-3 w-32 rounded bg-[var(--yt-surface)] animate-pulse mb-5" />
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
    </div>
  );
}
