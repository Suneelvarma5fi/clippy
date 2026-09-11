import Link from "next/link";

// Rendered inside the dashboard shell when a segment calls notFound()
// (e.g. an unknown or unauthorised /video/[id]).
export default function DashboardNotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-32 text-center">
      <p className="text-lg font-semibold text-[var(--yt-text)] mb-2">Not found</p>
      <p className="text-sm text-[var(--yt-text-2)] mb-6 max-w-sm">
        We couldn&apos;t find what you were looking for. It may have been deleted.
      </p>
      <Link
        href="/library"
        className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#e5e5e5]"
      >
        Back to library
      </Link>
    </div>
  );
}
