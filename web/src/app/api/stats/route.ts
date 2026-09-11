import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const [
    { count: videos },
    { count: clips },
    { count: exports },
  ] = await Promise.all([
    db.from("videos").select("*", { count: "exact", head: true }).eq("user_id", userId),
    db.from("clips").select("*", { count: "exact", head: true }).eq("user_id", userId),
    db.from("exports").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "done"),
  ]);

  return NextResponse.json({ videos: videos ?? 0, clips: clips ?? 0, exports: exports ?? 0 });
}
