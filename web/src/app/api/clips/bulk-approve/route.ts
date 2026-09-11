import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/clips/bulk-approve — approve or reject a list of clip ids
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // approved: true = approve, false = reject, null = clear review state
  const { clip_ids, approved }: { clip_ids: string[]; approved: boolean | null } = await req.json();
  if (!Array.isArray(clip_ids) || clip_ids.length === 0) {
    return NextResponse.json({ error: "clip_ids array required" }, { status: 400 });
  }
  if (approved !== null && typeof approved !== "boolean") {
    return NextResponse.json({ error: "approved must be boolean or null" }, { status: 400 });
  }

  const db = createAdminClient();

  const { error } = await db
    .from("clips")
    .update({ approved })
    .in("id", clip_ids)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: clip_ids.length });
}
