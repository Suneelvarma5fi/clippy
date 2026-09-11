"""
Clip Cutting — Re-encode (not stream-copy) for exact timestamp precision.
Single-cut: trim+re-encode in one pass.
Multi-cut:  filter_complex trim+setpts+concat in one ffmpeg pass.

Uses VideoToolbox hardware encoder on Apple Silicon/Intel Mac when available;
falls back to libx264 ultrafast on other platforms.
"""

from __future__ import annotations
import logging
import subprocess

log = logging.getLogger(__name__)

# ── encoder detection (run once at import time) ──────────────────────────────

def _detect_encoder() -> list[str]:
    """Return the fastest available video encoder flags."""
    try:
        r = subprocess.run(["ffmpeg", "-encoders"], capture_output=True, text=True, timeout=5)
        if "h264_videotoolbox" in r.stdout:
            log.info("Using VideoToolbox hardware encoder")
            return ["-c:v", "h264_videotoolbox", "-q:v", "65"]
    except Exception:
        pass
    log.info("Using libx264 ultrafast encoder")
    return ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"]

_VENC = _detect_encoder()

# ─────────────────────────────────────────────────────────────────────────────

def cut_clip(
    source_path: str,
    cuts: list[dict[str, float]],   # [{"start": float, "end": float}, ...]
    output_path: str,
) -> None:
    """Cut and stitch clip from source. Re-encodes for exact timestamps."""
    if not cuts:
        raise ValueError("cuts list is empty")

    if len(cuts) == 1:
        _single_cut(source_path, cuts[0]["start"], cuts[0]["end"], output_path)
    else:
        _multi_cut(source_path, cuts, output_path)


def _single_cut(source: str, start: float, end: float, output: str) -> None:
    """One trim segment — input-seek + re-encode, single ffmpeg pass."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", source,
        "-t", str(end - start),
        *_VENC,
        "-c:a", "aac",
        "-movflags", "+faststart",
        output,
    ]
    _run(cmd)


def _multi_cut(source: str, cuts: list[dict[str, float]], output: str) -> None:
    """Multiple non-contiguous segments stitched via filter_complex."""
    n = len(cuts)
    filter_parts: list[str] = []
    v_labels: list[str] = []
    a_labels: list[str] = []

    for i, cut in enumerate(cuts):
        s, e = cut["start"], cut["end"]
        filter_parts.append(f"[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS[v{i}]")
        filter_parts.append(f"[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS[a{i}]")
        v_labels.append(f"[v{i}]")
        a_labels.append(f"[a{i}]")

    concat_inputs = "".join(v_labels) + "".join(a_labels)
    filter_parts.append(f"{concat_inputs}concat=n={n}:v=1:a=1[vout][aout]")

    cmd = [
        "ffmpeg", "-y",
        "-i", source,
        "-filter_complex", ";".join(filter_parts),
        "-map", "[vout]", "-map", "[aout]",
        *_VENC,
        "-c:a", "aac",
        "-movflags", "+faststart",
        output,
    ]
    _run(cmd)


def _run(cmd: list[str]) -> None:
    log.debug("ffmpeg: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True)   # binary — avoid text decode errors
    if result.returncode != 0:
        stderr = result.stderr[-2000:].decode(errors="replace")
        raise RuntimeError(f"ffmpeg failed (exit {result.returncode}):\n{stderr}")
