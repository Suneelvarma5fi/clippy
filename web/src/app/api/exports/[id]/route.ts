import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { freshUrl, deleteObject } from "@/lib/r2";

// GET /api/exports/[id] — poll export status
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("exports")
    .select("id, status, r2_key, r2_url, error_msg, aspect_ratio, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const r2_url = data.r2_key ? await freshUrl(data.r2_key) : data.r2_url;
  return NextResponse.json({ ...data, r2_url });
}

// DELETE /api/exports/[id] — delete an export and its R2 object
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("exports")
    .select("id, r2_key")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (data.r2_key) await deleteObject(data.r2_key).catch(() => {});

  await db.from("exports").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
