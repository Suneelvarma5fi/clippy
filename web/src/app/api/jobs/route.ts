import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/jobs — list recent jobs for current user
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);
  const type   = url.searchParams.get("type");

  const db = createAdminClient();
  let query = db
    .from("jobs")
    .select("id, type, status, entity_id, payload, error_msg, attempts, queued_at, started_at, finished_at")
    .eq("user_id", userId)
    .order("queued_at", { ascending: false })
    .limit(limit);

  if (type) query = query.eq("type", type);

  const { data: jobs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = jobs ?? [];

  // For done export_clip jobs, fetch the r2_url from the exports table in one query.
  type JobRow = { type: string; status: string; entity_id: string; [key: string]: unknown };

  const exportIds = (rows as JobRow[])
    .filter((j) => j.type === "export_clip" && j.status === "done" && j.entity_id)
    .map((j) => j.entity_id);

  const exportUrls: Record<string, string | null> = {};
  if (exportIds.length > 0) {
    const { data: exports } = await db
      .from("exports")
      .select("id, r2_key, r2_url")
      .in("id", exportIds);
    await Promise.all(
      (exports ?? []).map(async (exp: { id: string; r2_key: string | null; r2_url: string | null }) => {
        const { freshUrl } = await import("@/lib/r2");
        exportUrls[exp.id] = exp.r2_key ? await freshUrl(exp.r2_key) : exp.r2_url;
      }),
    );
  }

  const enriched = (rows as JobRow[]).map((j) => ({
    ...j,
    r2_url: j.type === "export_clip" ? (exportUrls[j.entity_id] ?? null) : null,
  }));

  return NextResponse.json(enriched);
}
