import { createAdminClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TranscriptViewer } from "@/components/transcript/transcript-viewer";

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) notFound();
  const db = createAdminClient();

  const { data: video } = await db
    .from("videos")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!video) notFound();

  const { data: transcript } = await db
    .from("transcripts")
    .select("*")
    .eq("video_id", id)
    .single();

  if (!transcript) notFound();

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href={`/video/${id}`}
        className="flex items-center gap-2 text-sm text-[var(--yt-text-2)] hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {video.title}
      </Link>

      <TranscriptViewer transcript={transcript} videoTitle={video.title} />
    </div>
  );
}
