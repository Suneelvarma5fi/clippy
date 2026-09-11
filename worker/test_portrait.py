"""
Quick test for the face-scan portrait pipeline (two-pass: analyse → render).

Usage:
    .venv/bin/python test_portrait.py <input_video.mp4> [start] [end]

Examples:
    .venv/bin/python test_portrait.py /path/to/video.mp4
    .venv/bin/python test_portrait.py /path/to/video.mp4 10 40
"""

import os
import sys
import tempfile
import time
import logging
import traceback

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

from pipeline.portrait import (
    _video_meta, _scan_source, _build_timeline, cut_and_portrait, PORTRAIT_FILL,
)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    source = sys.argv[1]
    start  = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    end    = float(sys.argv[3]) if len(sys.argv) > 3 else None
    output = os.path.join(tempfile.gettempdir(), "portrait_test_out.mp4")

    # ── Video info ────────────────────────────────────────────────────────────
    try:
        fps, src_w, src_h = _video_meta(source)
    except Exception as e:
        print(f"❌ Cannot read video metadata: {e}")
        sys.exit(1)

    import cv2
    cap = cv2.VideoCapture(source)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    duration = total_frames / fps if fps else 0

    if end is None:
        end = min(start + 30, duration) if duration > 0 else start + 30

    crop_h = (int(src_h * PORTRAIT_FILL) // 2) * 2
    crop_w = (int(crop_h * 9 / 16) // 2) * 2

    print(f"\nSource   : {source}")
    print(f"Size     : {src_w}×{src_h}  fps={fps:.2f}  duration≈{duration:.1f}s")
    print(f"Cut      : {start:.1f}s – {end:.1f}s  ({end-start:.1f}s clip)")
    print(f"Crop     : {crop_w}×{crop_h}")
    print(f"Output   : {output}\n")

    # ── Step 1: scan (no diarisation — face detection only) ──────────────────
    print("── Step 1: face scan ──")
    t0 = time.time()
    try:
        records = _scan_source(source, src_w, src_h, diar_timeline=[])
    except Exception:
        print("❌ Scan failed:")
        traceback.print_exc()
        sys.exit(1)
    t1 = time.time()

    n_faces = sum(len(r["faces"]) for r in records)
    print(f"Scan done in {t1-t0:.1f}s  →  {len(records)} frames, {n_faces} face detections")

    # ── Step 2: timeline ──────────────────────────────────────────────────────
    print("\n── Step 2: timeline ──")
    timeline = _build_timeline(records, [], src_w, src_h, crop_w, crop_h)
    print(f"timeline: {len(timeline)} segments")
    for seg in timeline[:10]:
        kfs = len(seg.get("keyframes") or [])
        print(f"  {seg['start']:7.2f}–{seg['end']:7.2f}s  mode={seg['mode']:<9}  keyframes={kfs}")

    # ── Step 3: render ────────────────────────────────────────────────────────
    print(f"\n── Step 3: render → {output} ──")
    t2 = time.time()
    try:
        cut_and_portrait(source, [{"start": start, "end": end}], output)
    except Exception:
        print("❌ Render failed:")
        traceback.print_exc()
        sys.exit(1)
    t3 = time.time()

    print(f"\n✅  Done in {t3-t2:.1f}s")

    import subprocess
    info = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-select_streams", "v:0",
         "-show_entries", "stream=codec_name,pix_fmt,width,height,r_frame_rate",
         output],
        capture_output=True, text=True,
    )
    print(f"\nffprobe output:\n{info.stdout or info.stderr}")
    print(f"   open {output}")


if __name__ == "__main__":
    main()
