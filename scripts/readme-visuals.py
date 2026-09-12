#!/usr/bin/env python3
"""
Regenerate the README feature visuals from a real clip in a running local
Clippy (docs/visuals/*.png|gif). Every image is actual pipeline output —
no mockups — so swapping the footage is one command:

    scripts/readme-visuals.py --clip <clip-id> [--base http://localhost:3000]
                              [--landscape <frame.png>] [--frame-at 8]

<clip-id> is any clip in your library (copy it from the video page URL or
the clips table). The clip must already have been exported once, so its
face-tracked edit is cached; every render here is then a cheap restyle.
--landscape is a 16:9 frame from the same moment of the source video, used
for the landscape → portrait comparison (skipped if omitted).

Needs: the web app and worker running in local auth mode, ffmpeg, and the
worker venv's Python (for Pillow):  worker/.venv/bin/python scripts/readme-visuals.py ...
"""
from __future__ import annotations
import argparse, json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "docs" / "visuals"
UA   = "Mozilla/5.0 (readme-visuals)"   # the app's bot filter needs a browser-ish UA

STYLES = ["pill", "impact", "beast", "karaoke", "clean", "box"]


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _req(base: str, path: str, data: bytes | None = None, ctype: str = "application/json"):
    req = urllib.request.Request(base + path, data=data, method="POST" if data is not None else "GET",
                                 headers={"User-Agent": UA, "Accept": "*/*", "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def export(base: str, clip: str, body: dict) -> str:
    return json.loads(_req(base, f"/api/clips/{clip}/export", json.dumps(body).encode()))["export_id"]


def wait_and_download(base: str, export_id: str, dest: Path) -> None:
    for _ in range(120):
        st = json.loads(_req(base, f"/api/exports/{export_id}"))["status"]
        if st == "done":
            break
        if st == "error":
            sys.exit(f"export {export_id} failed")
        time.sleep(5)
    else:
        sys.exit(f"export {export_id} timed out")
    dest.write_bytes(_req(base, f"/api/exports/{export_id}/download"))


# ── Caption style configs, straight from the app's own defaults ───────────────

def style_configs() -> dict[str, dict]:
    """Run a throwaway vitest that dumps applyCaptionStyle(DEFAULT, style) for
    every style — the same objects the export dialog sends."""
    web = ROOT / "web"
    out = Path(tempfile.mktemp(suffix=".json"))
    test = web / "src" / "lib" / "_readme_visuals_dump.test.ts"
    test.write_text(f'''import {{ it }} from "vitest";
import {{ writeFileSync }} from "fs";
import {{ DEFAULT_PRESET_CONFIG }} from "./types";
import {{ applyCaptionStyle, getCaptionStyle, CAPTION_STYLES }} from "./caption-styles";
it("dump", () => {{
  const all: Record<string, unknown> = {{}};
  // The export dialog applies vertical_percent ?? 80 on top of the defaults — mirror it.
  const base = {{ ...DEFAULT_PRESET_CONFIG, layout: {{ ...DEFAULT_PRESET_CONFIG.layout, vertical_percent: 80 }} }};
  for (const s of CAPTION_STYLES) all[s.id] = applyCaptionStyle(base, getCaptionStyle(s.id));
  writeFileSync({json.dumps(str(out))}, JSON.stringify(all));
}});
''')
    try:
        subprocess.run(["npx", "vitest", "run", str(test.relative_to(web))], cwd=web,
                       check=True, capture_output=True)
        return json.loads(out.read_text())
    finally:
        test.unlink(missing_ok=True)
        out.unlink(missing_ok=True)


# ── Image helpers ─────────────────────────────────────────────────────────────

def frame(video: Path, t: float, width: int) -> Image.Image:
    png = Path(tempfile.mktemp(suffix=".png"))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video), "-frames:v", "1",
                    "-vf", f"scale={width}:-2", str(png)], check=True)
    img = Image.open(png).convert("RGB"); png.unlink()
    return img


def font(size: int) -> ImageFont.FreeTypeFont:
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "C:/Windows/Fonts/arialbd.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def labelled(img: Image.Image, text: str) -> Image.Image:
    bar = 36
    out = Image.new("RGB", (img.width, img.height + bar), (24, 24, 24))
    out.paste(img, (0, bar))
    d = ImageDraw.Draw(out); f = font(18)
    w = d.textlength(text, font=f)
    d.text(((img.width - w) / 2, 9), text, font=f, fill=(240, 240, 240))
    return out


def grid(images: list[Image.Image], cols: int, gap: int = 8) -> Image.Image:
    w, h = images[0].size
    rows = (len(images) + cols - 1) // cols
    out = Image.new("RGB", (cols * w + (cols - 1) * gap, rows * h + (rows - 1) * gap), (24, 24, 24))
    for i, im in enumerate(images):
        out.paste(im, ((i % cols) * (w + gap), (i // cols) * (h + gap)))
    return out


def gif(video: Path, start: float, dur: float, dest: Path, width: int = 270, fps: int = 10) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(dur), "-i", str(video),
                    "-vf", f"fps={fps},scale={width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=5",
                    str(dest)], check=True)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clip", required=True)
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--landscape", type=Path, help="16:9 source frame for the landscape→portrait visual")
    ap.add_argument("--frame-at", type=float, default=8.0, help="second of the clip to grab for stills")
    ap.add_argument("--track-window", default="24:5.4", help="start:duration (s) for the face-tracking GIF")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    cfgs = style_configs()

    # 1. Caption styles — one export per style, one frame each
    print("caption styles:", ", ".join(STYLES))
    tiles = []
    videos: dict[str, Path] = {}
    for s in STYLES:
        eid = export(a.base, a.clip, {"aspect_ratio": "9:16", "preset_config": cfgs[s]})
        videos[s] = tmp / f"{s}.mp4"
        wait_and_download(a.base, eid, videos[s]); print("  ", s, "done")
        tiles.append(labelled(frame(videos[s], a.frame_at, 300), cfgs[s].get("style_id", s).capitalize()))
    grid(tiles, cols=3).save(OUT / "caption-styles.png")

    # 2. Face tracking — GIF across a speaker change, from the Pill export
    start, dur = (float(x) for x in a.track_window.split(":"))
    gif(videos["pill"], start, dur, OUT / "face-tracking.gif")
    print("face tracking gif done")

    # 3. Landscape → portrait
    if a.landscape:
        land = Image.open(a.landscape).convert("RGB")
        land = land.resize((640, int(land.height * 640 / land.width)))
        port = frame(videos["clean"], a.frame_at, int(land.height * 9 / 16))
        # Outline where the portrait crop came from: find the crop's centre
        # region inside the landscape frame (captions sit low, so match the
        # top 60% of the portrait, which is pure video).
        try:
            import cv2, numpy as np
            L = cv2.cvtColor(np.array(land), cv2.COLOR_RGB2GRAY)
            P = cv2.cvtColor(np.array(port.crop((0, 0, port.width, int(port.height * 0.6)))), cv2.COLOR_RGB2GRAY)
            _, score, _, (x, y) = cv2.minMaxLoc(cv2.matchTemplate(L, P, cv2.TM_CCOEFF_NORMED))
            if score > 0.5:
                ImageDraw.Draw(land).rectangle([x, 0, x + port.width, land.height - 1], outline=(255, 60, 60), width=4)
        except Exception as e:                 # outline is a nicety; the comparison stands without it
            print("  (no crop outline:", e, ")")
        arrow = Image.new("RGB", (48, land.height), (24, 24, 24))
        ImageDraw.Draw(arrow).text((12, land.height // 2 - 14), "→", font=font(32), fill=(240, 240, 240))
        out = Image.new("RGB", (land.width + arrow.width + port.width, land.height), (24, 24, 24))
        out.paste(land, (0, 0)); out.paste(arrow, (land.width, 0)); out.paste(port, (land.width + arrow.width, 0))
        out.save(OUT / "landscape-to-portrait.png"); print("landscape→portrait done")

    # 4. Text sticker
    text_cfg = {"text": "NEW EPISODE", "x_pct": 50, "y_pct": 9, "size_pct": 8, "scale": 1, "bg": "#ff0000", "fg": "#ffffff"}
    eid = export(a.base, a.clip, {"aspect_ratio": "9:16", "preset_config": cfgs["pill"], "text_sticker_config": text_cfg})
    wait_and_download(a.base, eid, tmp / "text.mp4")
    frame(tmp / "text.mp4", a.frame_at, 360).save(OUT / "text-sticker.png"); print("text sticker done")

    # 5. Logo / image sticker — upload the Clippy logo, place it top-right
    png = (ROOT / "web" / "public" / "logo.png").read_bytes()
    up = json.loads(_req(a.base, "/api/stickers/upload", png, "image/png"))
    img_cfg = {"r2_key": up["r2_key"], "url": up["url"], "x_pct": 85, "y_pct": 7, "width_pct": 20}
    eid = export(a.base, a.clip, {"aspect_ratio": "9:16", "preset_config": cfgs["pill"], "image_sticker_config": img_cfg})
    wait_and_download(a.base, eid, tmp / "logo.mp4")
    frame(tmp / "logo.mp4", a.frame_at, 360).save(OUT / "logo-sticker.png"); print("logo sticker done")

    print("\nwrote:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
