"""
Forced branding watermark for free-tier exports.

Renders an "Edited by Clippy" pill (logo + text) as a PNG with baked-in alpha,
sized relative to the video width. Not configurable by the user — paid plans
skip it entirely (decided server-side in the export route).
"""

from __future__ import annotations
import io
import logging
from pathlib import Path

from PIL import Image, ImageDraw

from .subtitle import _load_font

log = logging.getLogger(__name__)

BRAND_TEXT    = "Edited by Clippy"
BADGE_OPACITY = 0.85          # baked into the PNG alpha channel
_LOGO_PATH    = Path(__file__).resolve().parent.parent / "assets" / "logo.png"


def make_branding_badge(badge_width: int) -> bytes:
    """
    Compose the branding pill as RGBA PNG bytes, `badge_width` pixels wide:
    [ (logo)  Edited by Clippy ]  on a rounded dark background.
    """
    # Proportions tuned for ~30% of a 1080px-wide portrait frame
    height   = max(int(badge_width * 0.165), 28)
    pad_x    = int(height * 0.42)
    gap      = int(height * 0.22)
    font_px  = int(height * 0.46)

    font = _load_font("Inter", "", font_px, bold=True, italic=False)

    logo = None
    if _LOGO_PATH.exists():
        try:
            logo = Image.open(_LOGO_PATH).convert("RGBA")
            logo_h = int(height * 0.62)
            logo = logo.resize((max(int(logo.width * logo_h / logo.height), 1), logo_h), Image.LANCZOS)
        except Exception as e:
            log.warning("Branding logo unusable (%s) — text-only badge", e)
            logo = None

    # Measure text to centre contents inside the requested width
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = probe.textbbox((0, 0), BRAND_TEXT, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

    content_w = text_w + ((logo.width + gap) if logo else 0)
    width = max(badge_width, content_w + 2 * pad_x)

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bg_alpha = int(140 * BADGE_OPACITY)
    draw.rounded_rectangle([0, 0, width - 1, height - 1], radius=height // 2,
                           fill=(10, 10, 10, bg_alpha))

    x = (width - content_w) // 2
    if logo:
        img.alpha_composite(logo, (x, (height - logo.height) // 2))
        x += logo.width + gap
    text_alpha = int(255 * BADGE_OPACITY)
    draw.text((x - bbox[0], (height - text_h) // 2 - bbox[1]), BRAND_TEXT,
              font=font, fill=(255, 255, 255, text_alpha))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
