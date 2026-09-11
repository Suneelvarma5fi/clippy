import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { triggerJob } from "@/lib/worker";

// POST /api/jobs/[id]/retry — reset a failed job back to queued and re-trigger it
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  const { data: job } = await db
    .from("jobs")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!["error", "cancelled"].includes(job.status)) {
    return NextResponse.json({ error: "Only failed or cancelled jobs can be retried" }, { status: 409 });
  }

  const { error } = await db
    .from("jobs")
    .update({
      status:      "queued",
      error_msg:   null,
      started_at:  null,
      finished_at: null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  triggerJob(id).catch(console.error);

  return NextResponse.json({ ok: true });
}
