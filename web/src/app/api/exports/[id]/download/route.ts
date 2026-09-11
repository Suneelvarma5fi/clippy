import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { freshUrl } from "@/lib/r2";

// GET /api/exports/[id]/download?filename=foo.mp4
// Streams the export's MP4 back through our own origin with a
// Content-Disposition attachment header. The clip lives in R2 on a different
// origin; handing the browser that cross-origin URL makes a download anchor
// navigate to the file instead of saving it. Proxying it here keeps the
// download same-origin so the browser (and the save-location picker) saves it.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("exports")
    .select("r2_key, r2_url")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const src = (await freshUrl(data.r2_key)) ?? data.r2_url;
  if (!src) return NextResponse.json({ error: "Export not ready" }, { status: 404 });

  const upstream = await fetch(src);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Failed to fetch export" }, { status: 502 });
  }

  // Sanitise the requested filename — never trust it for a header value.
  const raw = req.nextUrl.searchParams.get("filename") || "clip.mp4";
  const safeName = raw.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "clip.mp4";

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4");
  headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, { headers });
}
