import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/clips — manually create a clip
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { video_id, hook, text, cuts, notes } = body;

  if (!video_id || !cuts?.length) {
    return NextResponse.json({ error: "video_id and cuts required" }, { status: 400 });
  }

  const db = createAdminClient();

  // The target video must belong to the caller
  const { data: video } = await db
    .from("videos")
    .select("id")
    .eq("id", video_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const duration = cuts.reduce((s: number, c: { start: number; end: number }) => s + (c.end - c.start), 0);

  const { data, error } = await db
    .from("clips")
    .insert({
      video_id,
      user_id: userId,
      hook,
      text,
      cuts,
      duration_sec: Math.round(duration * 1000) / 1000,
      source: "manual",
      notes,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
