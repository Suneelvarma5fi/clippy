import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// PATCH /api/transcripts/[id]/speakers — update speaker label mapping
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { speaker_labels } = await req.json();
  if (!speaker_labels || typeof speaker_labels !== "object") {
    return NextResponse.json({ error: "speaker_labels object required" }, { status: 400 });
  }

  const db = createAdminClient();

  // Verify ownership
  const { data: transcript } = await db
    .from("transcripts")
    .select("id, user_id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!transcript) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("transcripts")
    .update({ speaker_labels })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
