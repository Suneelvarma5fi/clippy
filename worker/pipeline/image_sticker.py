"""
User-uploaded PNG sticker (logo, watermark) — composited over the whole clip
via a single ffmpeg overlay, exactly like the text sticker. The PNG is stored
in R2 under stickers/<user>/ by the web upload route; the export payload
carries its key + placement.
"""

from __future__ import annotations

MIN_WIDTH_PCT = 5.0
MAX_WIDTH_PCT = 60.0


def _clamp(v, lo: float, hi: float, fallback: float) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return fallback
    return max(lo, min(hi, f))


def build_overlay_filter(cfg: dict, canvas_w: int = 1080) -> str:
    """
    ffmpeg filter_complex placing the PNG (input [1:v]) centered at
    (x_pct, y_pct) with width = width_pct% of the canvas, aspect preserved.
    Like the text sticker, overflow is clipped at the frame edge — no clamping,
    so the render matches what the user dragged in the preview.
    """
    width_pct = _clamp(cfg.get("width_pct"), MIN_WIDTH_PCT, MAX_WIDTH_PCT, 25.0)
    x_pct     = _clamp(cfg.get("x_pct"), 0.0, 100.0, 50.0)
    y_pct     = _clamp(cfg.get("y_pct"), 0.0, 100.0, 20.0)

    width_px = max(8, round(canvas_w * width_pct / 100))
    x_expr = f"main_w*{x_pct / 100}-overlay_w/2"
    y_expr = f"main_h*{y_pct / 100}-overlay_h/2"
    return f"[1:v]scale={width_px}:-1[lg];[0:v][lg]overlay={x_expr}:{y_expr}"
