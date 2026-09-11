import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { putObject, freshUrl } from "@/lib/r2";
import { validateStickerPng } from "@/lib/image-sticker";

// POST /api/stickers/upload — raw PNG body, returns { r2_key, url }.
// The key is user-scoped; the export route only accepts keys under the
// caller's own prefix, so one user can't reference another's uploads.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  const err = validateStickerPng(bytes);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const r2_key = `stickers/${userId}/${crypto.randomUUID()}.png`;
  await putObject(r2_key, bytes, "image/png");

  return NextResponse.json({ r2_key, url: await freshUrl(r2_key) });
}
