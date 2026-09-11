"""
Agent 6 — Audio Cut Finder
Resolve approximate text timestamps to precise millisecond cut points (spec §5.4).
Pure array lookups against the pre-built energy index + diarization timeline —
no audio file access, no LLM. Runs per clip, per chunk boundary.
"""

from __future__ import annotations
import logging
from typing import Any

from .energy_index import EnergyIndex

log = logging.getLogger(__name__)

SEARCH_WINDOW_MS  = 500   # how far from the word boundary to look for silence
OVERLAP_SCAN_MS   = 2000  # how far forward to shift a cut out of a speaker overlap
OVERLAP_STEP_MS   = 10


def _speakers_at(t_ms: float, diar_timeline: list[tuple[float, float, str]]) -> set[str]:
    t = t_ms / 1000.0
    return {spk for start, end, spk in diar_timeline if start <= t <= end}


def _find_silent_frame(
    index: EnergyIndex,
    lo_ms: float,
    hi_ms: float,
    pick_latest: bool,
    own_speaker: str | None,
    diar_timeline: list,
) -> float | None:
    """
    Nearest silent, speaker-safe frame in [lo_ms, hi_ms].
    pick_latest=True → highest time (start cuts); False → lowest time (end cuts).
    """
    lo_f = max(0, index.frame_at(lo_ms))
    hi_f = min(index.n_frames - 1, index.frame_at(hi_ms))
    frames = range(hi_f, lo_f - 1, -1) if pick_latest else range(lo_f, hi_f + 1)
    for f in frames:
        if not index.is_silent(f):
            continue
        t_ms = f * index.hop_ms
        others = _speakers_at(t_ms, diar_timeline) - ({own_speaker} if own_speaker else set())
        if not others:
            return t_ms
    return None


def _clear_overlap(t_ms: float, diar_timeline: list) -> tuple[float, bool]:
    """If >=2 speakers are active at t, shift forward until the overlap clears."""
    if len(_speakers_at(t_ms, diar_timeline)) < 2:
        return t_ms, False
    shifted = t_ms
    while shifted < t_ms + OVERLAP_SCAN_MS:
        shifted += OVERLAP_STEP_MS
        if len(_speakers_at(shifted, diar_timeline)) < 2:
            return shifted, True
    return t_ms, True  # overlap never cleared within scan range — keep, but flag


def find_cut_points(
    clip: dict[str, Any],
    index: EnergyIndex | None,
    diar_timeline: list[tuple[float, float, str]],
) -> dict[str, Any]:
    """
    Resolve every chunk boundary of a clip to precise ms cut points.
    Falls back to exact word-boundary timestamps when no energy index is
    available or no silent frame is found (spec §5.4 steps 6-7).

    Adds to the clip:
        chunks: [{start_ms, end_ms, crosstalk_flagged}, ...]
        cuts:   [{start, end}, ...] (seconds — existing cut/export contract)
        crosstalk_flagged: bool
        duration_sec: refined total
    """
    own_speaker = clip.get("speaker")
    chunks: list[dict[str, Any]] = []

    for cut in clip["cuts_raw"]:
        word_start_ms = cut["start"] * 1000.0
        word_end_ms   = cut["end"] * 1000.0
        crosstalk = False

        if index is not None:
            start_ms = _find_silent_frame(
                index, word_start_ms - SEARCH_WINDOW_MS, word_start_ms,
                pick_latest=True, own_speaker=own_speaker, diar_timeline=diar_timeline,
            )
            end_ms = _find_silent_frame(
                index, word_end_ms, word_end_ms + SEARCH_WINDOW_MS,
                pick_latest=False, own_speaker=own_speaker, diar_timeline=diar_timeline,
            )
        else:
            start_ms = end_ms = None

        start_ms = start_ms if start_ms is not None else word_start_ms
        end_ms   = end_ms   if end_ms   is not None else word_end_ms

        start_ms, flagged_start = _clear_overlap(start_ms, diar_timeline)
        end_ms,   flagged_end   = _clear_overlap(end_ms,   diar_timeline)
        crosstalk = flagged_start or flagged_end

        # Keep ordering sane: at least 100ms of clip
        start_ms = min(start_ms, end_ms - 100)
        chunks.append({
            "start_ms":          int(max(0, round(start_ms))),
            "end_ms":            int(round(end_ms)),
            "crosstalk_flagged": crosstalk,
        })

    cuts = [
        {"start": round(c["start_ms"] / 1000.0, 3), "end": round(c["end_ms"] / 1000.0, 3)}
        for c in chunks
    ]
    return {
        **clip,
        "chunks":            chunks,
        "cuts":              cuts,
        "crosstalk_flagged": any(c["crosstalk_flagged"] for c in chunks),
        "duration_sec":      round(sum(c["end"] - c["start"] for c in cuts), 3),
    }
