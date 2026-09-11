"""
Face-forward thumbnail extractor for clip preview cards.

Scans the first SCAN_SECS of a clip's time range, sampling one frame
every SAMPLE_INTERVAL seconds.  Runs OpenCV face detection on each
frame and returns the JPEG of whichever frame has the largest detected
face.  Falls back to the midpoint frame when no face is found.

Returns None on any unrecoverable error so callers can skip gracefully.
"""

from __future__ import annotations
import logging
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger(__name__)

SCAN_SECS       = 5.0   # max seconds to scan per clip
SAMPLE_INTERVAL = 0.5   # sample one frame every N seconds
JPEG_QUALITY    = 85

# ── Face detection ─────────────────────────────────────────────────────────────
# OpenCV's bundled Haar cascade: no extra dependency, no model download, and it
# builds on Windows. Precision is plenty for "which frame has the biggest face".

_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_FACE_OK = not _cascade.empty()
if not _FACE_OK:
    log.warning("clip_thumbnail: Haar cascade missing — will use fallback frame")


def _detect_faces(frame_bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Return face boxes as (x, y, w, h) in pixels, largest first."""
    if not _FACE_OK:
        return []
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    boxes = _cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    return sorted((tuple(int(v) for v in b) for b in boxes), key=lambda b: b[2] * b[3], reverse=True)


def _face_area(frame_bgr: np.ndarray) -> float:
    """Return the relative area (0–1) of the largest detected face, or 0."""
    faces = _detect_faces(frame_bgr)
    if not faces:
        return 0.0
    h, w = frame_bgr.shape[:2]
    _, _, fw, fh = faces[0]
    return (fw * fh) / (w * h)


def extract_face_from_image(image_bytes: bytes) -> Optional[bytes]:
    """
    Detect the largest face in a JPEG/PNG image and return a square-cropped
    JPEG centred on that face (1.5× padding).  Returns None if no face is
    detected or on any error.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    faces = _detect_faces(img)
    if not faces:
        return None

    h, w = img.shape[:2]
    x, y, fw, fh = faces[0]
    cx = x + fw // 2
    cy = y + fh // 2

    # Square crop with 1.5× padding around the face
    half = int(max(fw, fh) * 0.75)
    x1 = max(0, cx - half)
    y1 = max(0, cy - half)
    x2 = min(w, cx + half)
    y2 = min(h, cy + half)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return None

    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    return bytes(buf) if ok else None


_insight_app = None


def _get_insight_app():
    """Lazily initialised InsightFace detector — loading models per call is very slow."""
    global _insight_app
    if _insight_app is None:
        from insightface.app import FaceAnalysis
        _insight_app = FaceAnalysis(allowed_modules=["detection"])
        _insight_app.prepare(ctx_id=0, det_size=(320, 320))
    return _insight_app


def extract_portrait_preview(
    video_path: str,
    start_sec: float,
    end_sec: float,
    out_w: int = 1080,
    out_h: int = 1920,
) -> Optional[bytes]:
    """
    Extract a 9:16 portrait frame from the given time range.
    Uses InsightFace to find the best face, crops and centres it in a 9:16 frame.
    Falls back to a centre-crop of the midpoint frame if no face is found.
    Returns JPEG bytes or None on error.
    """
    try:
        _fa = _get_insight_app()
    except Exception as e:
        log.warning("portrait_preview: InsightFace unavailable (%s) — centre-crop fallback", e)
        _fa = None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        log.warning("portrait_preview: cannot open %s", video_path)
        return None

    scan_end = min(start_sec + SCAN_SECS, end_sec)
    mid_t    = (start_sec + scan_end) / 2.0

    timestamps: list[float] = []
    t = start_sec
    while t <= scan_end + 1e-6:
        timestamps.append(t)
        t += SAMPLE_INTERVAL
    if not timestamps:
        timestamps = [mid_t]

    best_frame: Optional[np.ndarray] = None
    best_cx:    Optional[int]        = None
    best_score: float = -1.0
    mid_frame:  Optional[np.ndarray] = None
    min_mid_gap: float = float("inf")

    for ts in timestamps:
        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000)
        ok, frame = cap.read()
        if not ok:
            continue

        gap = abs(ts - mid_t)
        if gap < min_mid_gap:
            min_mid_gap = gap
            mid_frame   = frame

        if _fa is not None:
            # InsightFace expects BGR (cv2 convention) — frame is already BGR
            faces = _fa.get(frame)
            if faces:
                h, w = frame.shape[:2]
                best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                x1, y1, x2, y2 = best_face.bbox.astype(int)
                score = float((x2 - x1) * (y2 - y1)) / (w * h)
                if score > best_score:
                    best_score = score
                    best_frame = frame
                    best_cx    = (x1 + x2) // 2

    cap.release()

    src = best_frame if (best_frame is not None and best_score > 0) else mid_frame
    if src is None:
        return None

    src_h, src_w = src.shape[:2]

    # Determine crop width for 9:16 from full height
    crop_w = int(src_h * out_w / out_h)
    crop_w = min(crop_w, src_w)

    # Centre horizontally on the detected face, or frame centre
    cx = best_cx if best_cx is not None else src_w // 2
    half = crop_w // 2
    x1 = max(0, min(cx - half, src_w - crop_w))
    x2 = x1 + crop_w

    crop = src[:, x1:x2]
    resized = cv2.resize(crop, (out_w, out_h), interpolation=cv2.INTER_AREA)

    ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return bytes(buf) if ok else None


def extract_clip_thumbnail(
    video_path: str,
    start_sec: float,
    end_sec: float,
) -> Optional[bytes]:
    """
    Scan [start_sec, min(start_sec + SCAN_SECS, end_sec)] of the video.

    Returns JPEG bytes of the frame that shows the largest face, or the
    midpoint frame as a fallback.  Returns None on error.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        log.warning("clip_thumbnail: cannot open %s", video_path)
        return None

    scan_end = min(start_sec + SCAN_SECS, end_sec)
    mid_t    = (start_sec + scan_end) / 2.0

    # Build list of timestamps to sample
    timestamps: list[float] = []
    t = start_sec
    while t <= scan_end + 1e-6:
        timestamps.append(t)
        t += SAMPLE_INTERVAL
    if not timestamps:
        timestamps = [mid_t]

    best_frame:  Optional[np.ndarray] = None
    best_score:  float = -1.0
    mid_frame:   Optional[np.ndarray] = None
    min_mid_gap: float = float("inf")

    for ts in timestamps:
        cap.set(cv2.CAP_PROP_POS_MSEC, ts * 1000)
        ok, frame = cap.read()
        if not ok:
            continue

        # Track frame closest to mid for fallback
        gap = abs(ts - mid_t)
        if gap < min_mid_gap:
            min_mid_gap = gap
            mid_frame = frame

        score = _face_area(frame)
        if score > best_score:
            best_score = score
            best_frame = frame

    cap.release()

    chosen = best_frame if (best_frame is not None and best_score > 0) else mid_frame
    if chosen is None:
        log.warning("clip_thumbnail: no frame captured for %.1f–%.1f in %s", start_sec, end_sec, video_path)
        return None

    source = "face" if best_score > 0 else "midpoint"
    log.debug("clip_thumbnail: %s frame selected (face_area=%.3f)", source, best_score)

    ok, buf = cv2.imencode(".jpg", chosen, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    return bytes(buf) if ok else None
