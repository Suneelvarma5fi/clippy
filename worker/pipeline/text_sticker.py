"""
Instagram-style text sticker.

Black text on solid-white, per-line rounded "pill" backgrounds, center-aligned,
single bold font. Rendered once to an RGBA PNG and composited over the whole
clip via a single ffmpeg overlay (the sticker is static for the full duration).

Emoji are rendered as colour images via pilmoji — Inter (like any text font)
has no emoji glyphs, and PIL does no colour-emoji fallback on its own.
"""

from __future__ import annotations
import io

from PIL import Image, ImageDraw
from pilmoji import Pilmoji

from .subtitle import _load_font

# Match the dialog preview, which renders the sticker in Inter 700. Without a
# font URL, _load_font falls back to a system face (e.g. DejaVu) that reads
# thinner — so fetch real Inter Bold via the same path captions use (cached).
_INTER_BOLD_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap"


def _wrap_lines(text: str, measure, max_width_px: int) -> list[str]:
    """Greedy word-wrap to max_width_px (measure: str -> pixel width), honouring
    explicit newlines."""
    lines: list[str] = []
    for para in text.split("\n"):
        words = para.split()
        if not words:
            continue
        cur = words[0]
        for w in words[1:]:
            trial = f"{cur} {w}"
            if measure(trial) <= max_width_px:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    return lines


def _hex_to_rgba(hex_str: str, default: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    h = (hex_str or "").lstrip("#")
    if len(h) != 6:
        return default
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    except ValueError:
        return default


def render_sticker_png(
    text: str,
    font_px: int,
    max_width_px: int,
    lines: list[str] | None = None,
    bg: str = "#ffffff",
    fg: str = "#000000",
) -> bytes:
    """Render the sticker to RGBA PNG bytes. Raises ValueError on empty text.

    ``bg`` / ``fg`` are the pill background and text hex colors (defaulting to the
    classic white-on-black-text combo). When ``lines`` is given (the browser's
    actual wrap, captured from the live preview), it is rendered verbatim — no
    re-wrapping — so the line breaks match exactly what the user saw and dragged.
    Otherwise ``text`` is greedy-wrapped to ``max_width_px`` as a fallback.
    """
    text = text.strip()
    if not text:
        raise ValueError("text is empty")

    bg_rgba = _hex_to_rgba(bg, (255, 255, 255, 255))
    fg_rgba = _hex_to_rgba(fg, (0, 0, 0, 255))

    font = _load_font("Inter", _INTER_BOLD_URL, font_px, bold=True, italic=False)

    pad_x  = round(font_px * 0.40)
    pad_y  = round(font_px * 0.18)
    radius = round(font_px * 0.28)
    # Overlap stacked pills so their white backgrounds merge into one
    # connected block — no gap between lines.
    overlap = radius

    # pilmoji.getsize / .text account for emoji width; font.getlength alone does
    # not (it measures emoji codepoints as missing glyphs).
    scratch = Image.new("RGBA", (10, 10))
    with Pilmoji(scratch) as measurer:
        def measure(s: str) -> int:
            return measurer.getsize(s, font=font)[0]

        if lines:
            lines = [ln for ln in lines if ln.strip()]
        if not lines:
            lines = _wrap_lines(text, measure, max(max_width_px - 2 * pad_x, font_px))
        if not lines:
            raise ValueError("text is empty")
        box_ws = [round(measure(ln) + 2 * pad_x) for ln in lines]

    ascent, descent = font.getmetrics()
    box_h = ascent + descent + 2 * pad_y
    step  = box_h - overlap

    canvas_w = max(box_ws)
    canvas_h = box_h + step * (len(lines) - 1)

    img  = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw every pill first, then the text on top, so no later pill clips the
    # descenders of the line above it.
    ys = [i * step for i in range(len(lines))]
    for y, bw in zip(ys, box_ws):
        x0 = (canvas_w - bw) // 2
        draw.rounded_rectangle(
            [x0, y, x0 + bw, y + box_h], radius=radius, fill=bg_rgba
        )
    with Pilmoji(img) as pilmoji:
        for ln, y in zip(lines, ys):
            pilmoji.text(
                (canvas_w // 2, y + box_h // 2), ln,
                font=font, fill=fg_rgba, anchor="mm",
            )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
