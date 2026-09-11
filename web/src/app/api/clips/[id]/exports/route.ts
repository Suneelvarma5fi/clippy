import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { freshenExports } from "@/lib/r2";

// GET /api/clips/[id]/exports — list completed exports for a clip
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("exports")
    .select("id, aspect_ratio, status, r2_key, r2_url, created_at, updated_at")
    .eq("clip_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = typeof rows[number];
  const rows = data ?? [];
  const done   = rows.filter((e: Row) => e.status === "done");
  const active = rows.filter((e: Row) => e.status === "queued" || e.status === "processing");

  return NextResponse.json([
    ...(await freshenExports(done)),
    ...active, // no r2_url yet — include as-is so clients can detect active exports
  ]);
}
