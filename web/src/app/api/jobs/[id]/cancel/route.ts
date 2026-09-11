import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/jobs/[id]/cancel
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
  if (!["queued", "processing"].includes(job.status)) {
    return NextResponse.json({ error: "Job cannot be cancelled in its current state" }, { status: 409 });
  }

  const { error } = await db
    .from("jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
