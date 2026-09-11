import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { MAX_PRESETS } from "@/lib/types";

// GET /api/presets
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data } = await db
    .from("presets")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false });

  return NextResponse.json(data ?? []);
}

// POST /api/presets — create or update a preset
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, config, is_default = false } = await req.json();
  if (!name || !config) return NextResponse.json({ error: "name and config required" }, { status: 400 });

  const db = createAdminClient();

  // Enforce the per-account cap — block with a clear message, never drop one silently.
  const { count } = await db
    .from("presets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= MAX_PRESETS) {
    return NextResponse.json(
      { error: `You've reached the ${MAX_PRESETS}-preset limit. Delete one to save a new preset.` },
      { status: 409 },
    );
  }

  // If setting as default, clear existing default
  if (is_default) {
    await db.from("presets").update({ is_default: false }).eq("user_id", userId).eq("is_default", true);
  }

  const { data, error } = await db
    .from("presets")
    .insert({ user_id: userId, name, config, is_default })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
