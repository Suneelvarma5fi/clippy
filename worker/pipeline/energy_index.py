"""
Audio Preprocessor — Energy Index
Runs once at pipeline start. Builds a frame-level RMS energy index across the
full audio plus a dynamic silence threshold (spec §5.3). Agent 6 then resolves
every cut point with pure array lookups — no audio access during extraction.

Frames are computed via ffmpeg → numpy (16 kHz mono, 20 ms hops), matching the
proven rms_refine path; equivalent to the spec's librosa frames (~23 ms) without
adding the librosa dependency.
"""

from __future__ import annotations
import logging
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

HOP_S = 0.02   # 20ms frames
SR    = 16000  # target sample rate


@dataclass
class EnergyIndex:
    rms: np.ndarray          # frame-level RMS, indexed by hop number
    hop_ms: float            # ms per frame
    threshold: float         # dynamic silence threshold (see silence_threshold)

    def frame_at(self, time_ms: float) -> int:
        return int(time_ms / self.hop_ms)

    def is_silent(self, frame: int) -> bool:
        return bool(self.rms[frame] < self.threshold)

    @property
    def n_frames(self) -> int:
        return len(self.rms)


def _stream_rms(path: str) -> np.ndarray:
    """
    Decode any audio/video container to 16kHz mono via ffmpeg and compute
    per-hop RMS while streaming — constant memory regardless of duration
    (a 10-hour file would otherwise need ~2.3 GB of float32 PCM in RAM).
    """
    hop_samples = int(HOP_S * SR)
    hop_bytes   = hop_samples * 4  # float32

    # -nostats/-loglevel error: stderr is only read at the end — progress
    # lines would fill the pipe buffer and deadlock on long files.
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-nostats", "-loglevel", "error", "-i", path,
         "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    rms_parts: list[np.ndarray] = []
    buf = b""
    assert proc.stdout is not None
    while True:
        data = proc.stdout.read(1 << 20)
        if not data:
            break
        buf += data
        usable = len(buf) - len(buf) % hop_bytes
        if usable:
            block = np.frombuffer(buf[:usable], dtype=np.float32).reshape(-1, hop_samples)
            rms_parts.append(np.sqrt(np.mean(block.astype(np.float64) ** 2, axis=1)))
            buf = buf[usable:]

    stderr = proc.stderr.read() if proc.stderr else b""
    proc.wait()
    if proc.returncode != 0 and not rms_parts:
        raise RuntimeError(
            f"ffmpeg decode failed (exit {proc.returncode}):\n"
            + stderr.decode(errors="replace")[-2000:]
        )
    # trailing partial hop is dropped, matching the previous behaviour
    return np.concatenate(rms_parts) if rms_parts else np.array([], dtype=np.float64)


def silence_threshold(rms: np.ndarray) -> float:
    """
    Silence threshold = 10% of typical speech-frame energy, estimated as the
    60th percentile of frame RMS. mean()-based thresholds skew high on videos
    with loud music intros (marking speech as silence); p60 is robust to both
    loud outliers and large silent fractions.
    """
    return 0.1 * float(np.percentile(rms, 60)) if len(rms) else 0.0


def build_energy_index(audio: bytes | str) -> EnergyIndex:
    """
    Build the RMS index from raw container bytes, or from a file path
    (preferred for long videos — the audio is streamed, never held in RAM).
    """
    if isinstance(audio, (bytes, bytearray)):
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
            tmp.write(audio)
            tmp_path = tmp.name
        try:
            rms = _stream_rms(tmp_path)
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    else:
        rms = _stream_rms(audio)

    threshold = silence_threshold(rms)
    log.info(
        "Energy index built: %d frames (%.1f min), silence threshold %.6f",
        len(rms), len(rms) * HOP_S / 60, threshold,
    )
    return EnergyIndex(rms=rms, hop_ms=HOP_S * 1000, threshold=threshold)
