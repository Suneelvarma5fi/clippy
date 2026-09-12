"""
Subtitle burner — draws word-synchronised captions onto a video using Pillow.

Flow:
  ffmpeg decode → PIL overlay per frame → ffmpeg encode

Word groups are built from WhisperX raw_words + clip cut ranges.  Each
rendered frame maps its current timestamp to the active group and the active
(highlighted) word within that group.

Supports from PresetConfig:
  Typography : font_family, font_url, font_size, font_weight, italic, all_caps
  Color      : text_color, highlight_color, stroke_color/width, bg_color/opacity,
               drop_shadow, shadow_color/x/y
  Layout     : vertical_position, vertical_percent (overrides position), text_align, two_lines, padding
"""

from __future__ import annotations
import json
import logging
import re
import subprocess
import urllib.request
from pathlib import Path
from tempfile import gettempdir

import cv2
from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

PAUSE_THRESHOLD = 0.4          # s  — new group on silence longer than this
MAX_WORDS_1LINE = 5            # max words per group in single-line mode
MAX_WORDS_2LINE = 8            # max words per group in two-line mode
SPLIT_PUNCT     = set(".,?!:;")

FONT_CACHE_DIR = Path(gettempdir()) / "clipforge_fonts"
_PIPE_VENC     = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"]


# ── Word grouping ─────────────────────────────────────────────────────────────

def _word_text(w: dict) -> str:
    return (w.get("word") or w.get("text") or "").strip()


def _group_words(
    words: list[dict],
    time_offset: float,
    max_words: int,
) -> list[dict]:
    """
    Group WhisperX words into display units.
    Splits on: pause > PAUSE_THRESHOLD, punctuation, or max_words limit.
    Returns: [{"start", "end", "words": [{"text", "start", "end"}]}]
    """
    groups: list[dict] = []
    current: list[dict] = []
    prev_end: float | None = None

    def flush() -> None:
        if not current:
            return
        groups.append({
            "start": current[0]["start"] - time_offset,
            "end":   current[-1]["end"]  - time_offset,
            "words": [
                {
                    "text":  _word_text(w),
                    "start": w["start"] - time_offset,
                    "end":   w["end"]   - time_offset,
                }
                for w in current
            ],
        })
        current.clear()

    for w in words:
        txt, start, end = _word_text(w), w.get("start"), w.get("end")
        if not txt or start is None or end is None:
            continue
        if prev_end is not None and (start - prev_end) > PAUSE_THRESHOLD:
            flush()
        if len(current) >= max_words:
            flush()
        if current and _word_text(current[-1]) and _word_text(current[-1])[-1] in SPLIT_PUNCT:
            flush()
        current.append(w)
        prev_end = end

    flush()
    return groups


def _build_groups(
    raw_words: list[dict],
    cuts: list[dict],
    max_words: int,
) -> list[dict]:
    """Build clip-relative word groups across all cuts (re-zeroed timestamps)."""
    all_groups: list[dict] = []
    cumulative = 0.0
    for cut in cuts:
        s, e   = float(cut["start"]), float(cut["end"])
        offset = s - cumulative
        cut_words = [
            w for w in raw_words
            if w.get("start") is not None
            and w.get("end")   is not None
            and s - 0.05 <= w["start"] <= e + 0.05
        ]
        all_groups.extend(_group_words(cut_words, offset, max_words))
        cumulative += e - s
    return all_groups


def _find_group(groups: list[dict], t: float) -> dict | None:
    for g in groups:
        if g["start"] <= t < g["end"]:
            return g
    return None


def _find_active_word(group: dict, t: float) -> int:
    """Return index of the last word whose start ≤ t (0 if all are future)."""
    active = 0
    for i, w in enumerate(group["words"]):
        if w["start"] <= t:
            active = i
    return active


# ── Font loading ──────────────────────────────────────────────────────────────

# Explicit paths for reliable system fonts — ordered by preference.
# Avoids fc-match which can return emoji fonts or unavailable paths.
_SYSTEM_FONTS = [
    # Linux (Ubuntu/Debian — DejaVu is always present)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    # macOS
    "/Library/Fonts/Arial Bold.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    # Windows
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def _load_font(
    family: str,
    font_url: str,
    size: int,
    bold: bool,
    italic: bool,
) -> ImageFont.FreeTypeFont:
    """
    Load a TrueType font at `size` pixels using this priority:
      1. Google Font downloaded from font_url and converted to TTF via fonttools.
      2. First existing path in _SYSTEM_FONTS list.
      3. PIL built-in (last resort — logs a warning).
    """
    FONT_CACHE_DIR.mkdir(exist_ok=True)

    # 1. Google Font
    if font_url:
        safe   = re.sub(r"[^a-zA-Z0-9]", "_", font_url)[:64]
        cached = FONT_CACHE_DIR / f"{safe}.ttf"   # always stored as TTF
        if not cached.exists():
            _download_and_convert_font(font_url, cached)
        if cached.exists():
            try:
                font = ImageFont.truetype(str(cached), size)
                log.info("Font loaded: %s (Google Fonts cache)", cached.name)
                return font
            except Exception as exc:
                log.warning("Cached font unusable (%s): %s", cached.name, exc)
                cached.unlink(missing_ok=True)   # delete corrupt file

    # 2. System fonts
    for path in _SYSTEM_FONTS:
        if Path(path).exists():
            try:
                font = ImageFont.truetype(path, size)
                log.info("Font '%s' → system fallback: %s", family, path)
                return font
            except Exception:
                continue

    # 3. PIL built-in (always works, looks bad at large sizes — warn loudly)
    log.warning(
        "No suitable font found for '%s' — captions will use PIL default "
        "(install fonttools[woff] and ensure Pillow>=10 for proper rendering)",
        family,
    )
    try:
        return ImageFont.load_default(size=size)   # Pillow ≥ 10
    except TypeError:
        return ImageFont.load_default()


def _download_and_convert_font(css_url: str, dest: Path) -> None:
    """
    Download a Google Fonts CSS URL → extract font src → download the font
    file → convert from WOFF2/WOFF to plain TTF using fonttools.

    Google Fonts always serves WOFF2 to modern browsers; fonttools is
    required to convert it to TTF so FreeType / Pillow can load it.
    """
    try:
        req = urllib.request.Request(
            css_url,
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            css = r.read().decode(errors="replace")

        urls = re.findall(r"url\([\"']?([^\"')\s]+)[\"']?\)", css)
        if not urls:
            log.warning("No font src URLs found in %s", css_url)
            return

        # Download the font bytes (typically WOFF2)
        with urllib.request.urlopen(urls[0], timeout=15) as r:
            font_data = r.read()

        log.info("Downloaded font: %d bytes from %s", len(font_data), urls[0])

        # Convert to TTF via fonttools (handles WOFF2, WOFF, OTF, TTF)
        if _convert_to_ttf(font_data, dest):
            return

        # fonttools unavailable or failed — save raw and hope FreeType copes
        dest.write_bytes(font_data)
        log.warning(
            "fonttools not available; saved raw font bytes — may not render "
            "correctly. Install fonttools[woff] to fix this."
        )

    except Exception as exc:
        log.warning("Font download failed for %s: %s", css_url, exc)


def _convert_to_ttf(font_data: bytes, dest: Path) -> bool:
    """
    Use fonttools to strip the WOFF2/WOFF wrapper and save a plain TTF.
    Returns True on success, False if fonttools is unavailable or conversion fails.
    """
    try:
        import io
        from fontTools.ttLib import TTFont  # requires fonttools[woff]
        tt = TTFont(io.BytesIO(font_data))
        tt.flavor = None   # None = plain TTF/OTF (strips WOFF2 wrapper)
        tt.save(str(dest))
        # Quick sanity check: can Pillow actually load the result?
        ImageFont.truetype(str(dest), 20)
        log.info("Font converted to TTF: %s (%d bytes)", dest.name, dest.stat().st_size)
        return True
    except ImportError:
        log.debug("fonttools not installed — skipping WOFF2→TTF conversion")
        return False
    except Exception as exc:
        log.warning("fonttools conversion failed: %s", exc)
        dest.unlink(missing_ok=True)
        return False


# ── Colour helpers ────────────────────────────────────────────────────────────

def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#").ljust(6, "0")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex_rgba(h: str, opacity: float) -> tuple[int, int, int, int]:
    r, g, b = _hex_rgb(h)
    return r, g, b, max(0, min(255, int(opacity * 255)))


# ── Subtitle renderer ─────────────────────────────────────────────────────────

class SubtitleRenderer:
    """
    Pre-loads font + layout from PresetConfig once.
    draw_frame(img, group, active_word_idx) returns a new PIL Image (RGB)
    with the subtitle overlay composited on top.
    """

    def __init__(self, preset: dict, canvas_w: int, canvas_h: int) -> None:
        typ = preset.get("typography", {})
        col = preset.get("color", {})
        lay = preset.get("layout", {})

        self.canvas_w  = canvas_w
        self.canvas_h  = canvas_h
        self.all_caps  = bool(typ.get("all_caps", False))
        self.two_lines = bool(lay.get("two_lines", False))
        self.v_pos     = lay.get("vertical_position", "bottom")
        self.v_pct     = lay.get("vertical_percent")   # 0–100; overrides v_pos when set
        self.align     = lay.get("text_align", "center")
        self.padding   = int(lay.get("padding") or 16)

        bold = typ.get("font_weight", "700") in ("700", "900", "bold", "black")
        self.font = _load_font(
            family=typ.get("font_family", "Inter"),
            font_url=typ.get("font_url", ""),
            size=int(typ.get("font_size", 100) * 56 / 100),
            bold=bold,
            italic=bool(typ.get("italic", False)),
        )

        hl = preset.get("highlight") or {}
        self.text_rgb    = _hex_rgb(col.get("text_color",      hl.get("font_color",  "#FFFFFF")))
        self.hi_rgb      = _hex_rgb(col.get("highlight_color", hl.get("fill_color",  "#FFDD00")))
        self.stroke_rgb  = _hex_rgb(col.get("stroke_color",    "#000000"))
        self.stroke_w    = int(col.get("stroke_width", 2))
        self.bg_rgba     = _hex_rgba(col.get("bg_color",  "#000000"),
                                     float(col.get("bg_opacity", 0.0)))
        self.shadow      = bool(col.get("drop_shadow", False))
        self.shadow_rgb  = _hex_rgb(col.get("shadow_color", "#000000"))
        self.shadow_x    = int(col.get("shadow_x") or 0)
        self.shadow_y    = int(col.get("shadow_y") or 2)

        # Text area: 90 % canvas width, centred
        self.text_w = int(canvas_w * 0.9)
        self.text_x = (canvas_w - self.text_w) // 2

        # Pre-compute inter-word gap = width of one space in the loaded font.
        # Using textlength("x x") - textlength("xx") isolates the space advance
        # width without bbox edge artefacts.  Falls back to 25 % of font size.
        _tmp_img  = Image.new("RGBA", (4, 4))
        _tmp_draw = ImageDraw.Draw(_tmp_img)
        try:
            _space = int(
                _tmp_draw.textlength("x x", font=self.font)
                - _tmp_draw.textlength("xx",  font=self.font)
            )
        except Exception:
            _space = 0
        font_px = getattr(self.font, "size", None) or int(typ.get("font_size", 100) * 56 / 100)
        self._space_w = max(int(font_px * 0.25), _space)

    # ── private ───────────────────────────────────────────────────────────────

    def _advance(self, draw: ImageDraw.ImageDraw, txt: str) -> int:
        """Typographic advance: how far x moves after this word. Uses
        textlength() so words never merge or overlap."""
        return max(1, int(draw.textlength(txt, font=self.font)))

    def _put_word(
        self,
        draw: ImageDraw.ImageDraw,
        pos: tuple[int, int],
        txt: str,
        color: tuple[int, int, int],
    ) -> None:
        x, y = pos
        if self.shadow:
            draw.text(
                (x + self.shadow_x, y + self.shadow_y),
                txt, font=self.font,
                fill=(*self.shadow_rgb, 160),
                stroke_width=self.stroke_w,
                stroke_fill=(*self.shadow_rgb, 80),
            )
        draw.text(
            (x, y), txt, font=self.font,
            fill=(*color, 255),
            stroke_width=self.stroke_w,
            stroke_fill=(*self.stroke_rgb, 255),
        )

    def _line_start_x(self, total_w: int) -> int:
        if self.align == "left":
            return self.text_x
        if self.align == "right":
            return self.text_x + self.text_w - total_w
        return (self.canvas_w - total_w) // 2   # center

    # ── public ────────────────────────────────────────────────────────────────

    def draw_frame(
        self,
        img: Image.Image,
        group: dict,
        active_idx: int,
    ) -> Image.Image:
        words = [
            w["text"].upper() if self.all_caps else w["text"]
            for w in group["words"]
        ]

        # Split into one or two display lines
        if self.two_lines and len(words) > 3:
            mid   = (len(words) + 1) // 2
            lines = [words[:mid], words[mid:]]
        else:
            lines = [words]

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw    = ImageDraw.Draw(overlay)

        LINE_GAP = max(4, self.canvas_h // 240)

        # Measure all lines using advance width (not bounding-box width).
        # self._space_w is the actual space-character advance for this font.
        # Per line: word advances, total width, and the line's ink box. PIL
        # anchors draw.text at the font ascender, but the ink starts `top` px
        # lower (ascender → cap height), so every line is drawn at y - top to
        # put its ink exactly at y. One offset per line keeps a shared baseline.
        line_meta: list[tuple[list[str], list[int], int, int, int]] = []
        for line in lines:
            ws = [self._advance(draw, w) for w in line]
            tw = sum(ws) + self._space_w * max(0, len(ws) - 1)
            bb = draw.textbbox((0, 0), " ".join(line), font=self.font, stroke_width=self.stroke_w)
            top, lh = bb[1], max(1, bb[3] - bb[1])
            line_meta.append((line, ws, tw, lh, top))

        total_h = sum(lh for _, _, _, lh, _ in line_meta) + LINE_GAP * (len(line_meta) - 1)

        # Vertical anchor point — vertical_percent overrides vertical_position.
        # Mirrors the CSS `top: X%; transform: translateY(-50%)` logic in the preview.
        if self.v_pct is not None:
            centre = int(self.canvas_h * float(self.v_pct) / 100)
            base_y = centre - total_h // 2
            # Clamp so text never bleeds off-screen
            base_y = max(self.padding, min(self.canvas_h - total_h - self.padding, base_y))
        elif self.v_pos == "top":
            base_y = self.padding
        elif self.v_pos == "middle":
            base_y = (self.canvas_h - total_h) // 2
        else:
            base_y = self.canvas_h - total_h - self.padding

        # Background box spanning all lines
        if self.bg_rgba[3] > 0:
            max_tw = max(tw for _, _, tw, _, _ in line_meta)
            bx     = self._line_start_x(max_tw)
            bp     = self.padding // 2
            draw.rectangle(
                [bx - bp, base_y - bp, bx + max_tw + bp, base_y + total_h + bp],
                fill=self.bg_rgba,
            )

        # Draw words line by line, advancing x by advance_width + one space
        word_idx = 0
        y = base_y
        for line, widths, total_w, line_h, top in line_meta:
            x = self._line_start_x(total_w)
            for txt, ww in zip(line, widths):
                color = self.hi_rgb if word_idx == active_idx else self.text_rgb
                self._put_word(draw, (x, y - top), txt, color)
                x += ww + self._space_w
                word_idx += 1
            y += line_h + LINE_GAP

        return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def _effective_fps(path: str) -> float:
    """
    True average fps = frame count / duration, via ffprobe.

    The raw-frame pipe discards the source's timestamps and re-stamps every
    frame at this constant rate, so it must match the stream's *actual* average
    frame spacing — the nominal rate (OpenCV CAP_PROP_FPS / r_frame_rate) can
    disagree after segment concats and would shift video against the audio,
    which keeps its original timing.
    """
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-count_packets",
             "-show_entries", "stream=nb_read_packets,duration,avg_frame_rate",
             "-of", "json", path],
            capture_output=True, text=True, timeout=60,
        )
        stream = json.loads(r.stdout)["streams"][0]
        frames   = float(stream.get("nb_read_packets") or 0)
        duration = float(stream.get("duration") or 0)
        if frames > 0 and duration > 0:
            return frames / duration
        num, _, den = (stream.get("avg_frame_rate") or "").partition("/")
        if num and den and float(den) != 0:
            return float(num) / float(den)
    except Exception as e:
        log.warning("_effective_fps: probe failed (%s) — assuming 30", e)
    return 30.0


# ── Public entry point ────────────────────────────────────────────────────────

def burn_subtitles(
    input_path: str,
    output_path: str,
    raw_words: list[dict],
    cuts: list[dict],
    preset_config: dict,
) -> None:
    """
    Burn word-synchronised captions from preset_config onto input_path.
    Audio is taken directly from input_path (re-sought, no re-encode).

    If preset_config has 'hyperframes_component' set, delegates to the
    HyperFrames renderer (Puppeteer-based). Falls back to PIL on failure.

    If raw_words is empty, copies input_path → output_path unchanged.
    """
    if not raw_words:
        log.warning("burn_subtitles: no words — copying video unchanged")
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            check=True, capture_output=True,
        )
        return

    # Video dimensions via OpenCV (no seeking)
    cap = cv2.VideoCapture(input_path)
    w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    fps = _effective_fps(input_path)
    if w == 0 or h == 0:
        raise RuntimeError(f"Cannot read video dimensions: {input_path}")

    # ── HyperFrames path ──────────────────────────────────────────────────────
    hf_comp = preset_config.get("hyperframes_component")
    log.info("burn_subtitles: renderer=%s canvas=%dx%d", hf_comp or "PIL", w, h)
    if hf_comp:
        try:
            from pipeline.hyperframes import burn_subtitles_hf
            burn_subtitles_hf(
                input_path=input_path,
                output_path=output_path,
                raw_words=raw_words,
                cuts=cuts,
                preset_config=preset_config,
                canvas_w=w,
                canvas_h=h,
                fps=fps,
            )
            log.info("burn_subtitles: HyperFrames render complete")
            return
        except Exception as exc:
            log.warning(
                "HyperFrames render failed (%s) — falling back to PIL renderer", exc, exc_info=True
            )

    log.info("burn_subtitles: using PIL renderer")
    lay       = preset_config.get("layout", {})
    max_words = MAX_WORDS_2LINE if lay.get("two_lines") else MAX_WORDS_1LINE
    groups    = _build_groups(raw_words, cuts, max_words)
    renderer  = SubtitleRenderer(preset_config, w, h)
    frame_sz  = w * h * 3   # RGB24 bytes per frame

    log.info(
        "burn_subtitles: %dx%d @%.1f fps, %d word groups, %d words",
        w, h, fps, len(groups), len(raw_words),
    )

    # ── Decoder ───────────────────────────────────────────────────────────────
    decoder = subprocess.Popen(
        [
            "ffmpeg", "-i", input_path,
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-an", "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    # ── Encoder (video from stdin, audio re-read from input_path) ─────────────
    # -nostats/-loglevel error: stderr is a pipe that is only drained after the
    # frame loop — periodic progress lines would fill the pipe buffer and
    # deadlock both processes on long encodes.
    encoder = subprocess.Popen(
        [
            "ffmpeg", "-y", "-nostats", "-loglevel", "error",
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-s", f"{w}x{h}", "-pix_fmt", "rgb24", "-r", str(fps),
            "-i", "pipe:0",
            "-i", input_path,
            "-map", "0:v", "-map", "1:a?",
            "-vf", "format=yuv420p",
            *_PIPE_VENC,
            "-c:a", "aac",
            "-shortest", "-movflags", "+faststart",
            output_path,
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # ── Frame loop ────────────────────────────────────────────────────────────
    frame_idx = 0
    try:
        while True:
            raw = decoder.stdout.read(frame_sz)
            if len(raw) < frame_sz:
                break

            t     = frame_idx / fps
            group = _find_group(groups, t)
            img   = Image.frombuffer("RGB", (w, h), raw, "raw", "RGB", 0, 1)

            if group is not None:
                img = renderer.draw_frame(img, group, _find_active_word(group, t))

            encoder.stdin.write(img.tobytes())
            frame_idx += 1

    except BrokenPipeError:
        pass
    finally:
        decoder.kill()
        decoder.wait()
        if not encoder.stdin.closed:
            encoder.stdin.close()

    stderr = encoder.stderr.read()
    encoder.wait()
    if encoder.returncode != 0:
        raise RuntimeError(
            f"Subtitle encode failed (exit {encoder.returncode}):\n"
            + stderr[-3000:].decode(errors="replace")
        )

    log.info("Subtitles burned: %d frames → %s", frame_idx, output_path)
