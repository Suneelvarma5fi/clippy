import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/account/niche-profile
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data } = await db
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json(data ?? {});
}

// PUT /api/account/niche-profile — upsert niche profile
export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    niche             = "",
    audience          = "",
    hook_style        = "",
    clip_duration_min = 10,
    clip_duration_max = 120,
    preferred_tones   = [],
  } = body;

  // Hard duration gate: clips must be 10-120s (clip-pipeline-requirements.md §3.1)
  const minDur = Math.min(Math.max(Number(clip_duration_min) || 10, 10), 120);
  const maxDur = Math.min(Math.max(Number(clip_duration_max) || 120, minDur), 120);

  // Text length limits — mirror the editor's maxLength
  const LIMITS = { niche: 120, audience: 200, hook_style: 200 };

  const db = createAdminClient();

  const { error } = await db
    .from("user_profiles")
    .upsert(
      {
        user_id:           userId,
        niche:             String(niche).slice(0, LIMITS.niche),
        audience:          String(audience).slice(0, LIMITS.audience),
        hook_style:        String(hook_style).slice(0, LIMITS.hook_style),
        clip_duration_min: minDur,
        clip_duration_max: maxDur,
        preferred_tones,
        updated_at:        new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
