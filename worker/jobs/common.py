"""Helpers shared across job handlers."""

from __future__ import annotations


def _build_diar_timeline(transcript: dict | None) -> list[tuple[float, float, str]]:
    """Extract [(start, end, speaker_id), ...] from a stored transcript's segments."""
    if not transcript:
        return []
    return sorted(
        [
            (float(s["start"]), float(s["end"]), s["speaker"])
            for s in (transcript.get("segments") or [])
            if s.get("speaker")
        ],
        key=lambda x: x[0],
    )


def _remap_diar_timeline(diar_timeline: list, cuts: list[dict]) -> list:
    """
    Remap absolute source timestamps in diar_timeline to stitched-video coordinates.
    Each cut's source window maps to a contiguous block starting at stitched_offset.
    """
    remapped = []
    stitched_offset = 0.0
    for cut in cuts:
        src_start = float(cut["start"])
        src_end   = float(cut["end"])
        for ds, de, speaker in diar_timeline:
            overlap_s = max(ds, src_start)
            overlap_e = min(de, src_end)
            if overlap_e <= overlap_s:
                continue
            remapped.append((
                overlap_s - src_start + stitched_offset,
                overlap_e - src_start + stitched_offset,
                speaker,
            ))
        stitched_offset += src_end - src_start
    return remapped
