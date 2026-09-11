import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = "google/gemini-2.5-flash";

// POST /api/clips/[id]/social-copy — generate title + description for social
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY not set" }, { status: 500 });

  const db = createAdminClient();

  const { data: clip } = await db
    .from("clips")
    .select("id, hook, text, tone, duration_sec")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

  const prompt = `You are a social media copywriter. Generate a compelling title and description for this short-form video clip.

Clip hook: ${clip.hook ?? ""}
Clip text (excerpt): ${(clip.text ?? "").slice(0, 400)}
Tone: ${clip.tone ?? "educational"}
Duration: ${Math.round(clip.duration_sec ?? 60)}s

Return strict JSON only:
{"title": "...", "description": "..."}

Rules:
- Title: ≤ 60 chars, punchy, no hashtags
- Description: 2–3 sentences max, include 3–5 relevant hashtags at the end
- Match the tone (${clip.tone ?? "educational"})`;

  try {
    const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Clippy",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
      }),
    });

    if (!resp.ok) throw new Error(`OpenRouter error ${resp.status}`);

    const data = await resp.json();
    const raw  = data.choices[0].message.content;
    const parsed = JSON.parse(raw.trim());

    // Persist to clips table
    await db
      .from("clips")
      .update({
        social_title:       parsed.title ?? null,
        social_description: parsed.description ?? null,
      })
      .eq("id", id);

    return NextResponse.json({ title: parsed.title, description: parsed.description });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
