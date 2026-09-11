import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/videos/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/videos/[id] — update mutable fields (collection_id)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ("collection_id" in body) updates.collection_id = body.collection_id ?? null;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("videos")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/videos/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Collect export IDs before cascade deletes them, then remove orphaned job rows.
  // (jobs.entity_id has no FK so it won't cascade automatically.)
  const { data: clips } = await db.from("clips").select("id").eq("video_id", id).eq("user_id", userId);
  if (clips && clips.length > 0) {
    const clipIds = clips.map((c: { id: string }) => c.id);
    const { data: exports } = await db.from("exports").select("id").in("clip_id", clipIds);
    if (exports && exports.length > 0) {
      const exportIds = exports.map((e: { id: string }) => e.id);
      await db.from("jobs").delete().in("entity_id", exportIds).eq("user_id", userId);
    }
  }

  const { error } = await db
    .from("videos")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
