"""
Agent 1 — Reader
Chunk the transcript into natural segments. Respect speaker turns and topic
shifts. Works on numbered sentence indices — never asks the LLM for timestamps.

Long transcripts (> ~40 min) are split into ~20-minute chunks at natural pause
boundaries (see pipeline.chunking) and read in parallel; sentence indices stay
global, so the merged output is identical in shape to a single-call read.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any

from .openrouter import call_agent
from .chunking import chunk_sentence_ranges

log = logging.getLogger(__name__)

MAX_PARALLEL_CHUNKS = 4

SYSTEM_PROMPT = """\
You segment a podcast/video transcript into natural units for downstream clip analysis.

You receive numbered sentences, each prefixed with its speaker ID. Group them into \
contiguous segments where each segment:
- covers ONE topic, story, exchange, or argument
- starts where a thought starts and ends where it lands
- respects speaker turns — a Q&A exchange (question + its answer) is one segment
- is typically 10-120 seconds of speech (~25-320 words); never split a single \
thought across segments just to hit a size

Every sentence must belong to exactly one segment. Segments must be contiguous, \
non-overlapping, and in order.

Output strict JSON only:
{"segments": [{"lo": <first sentence index>, "hi": <last sentence index>}, ...]}\
"""


def _speaker_at(t: float, diar_timeline: list[tuple[float, float, str]]) -> str | None:
    for start, end, speaker in diar_timeline:
        if start <= t <= end:
            return speaker
    return None


def _sentence_speaker(sentence: dict, diar_timeline: list) -> str | None:
    midpoint = (sentence["start"] + sentence["end"]) / 2
    return _speaker_at(midpoint, diar_timeline)


async def _read_range(
    sentences: list[dict[str, Any]],
    speakers: list[str | None],
    lo0: int,
    hi0: int,
    api_key: str,
) -> list[tuple[int, int]]:
    """
    One Reader LLM call over sentences[lo0..hi0] (global indices in the prompt).
    Returns clamped, contiguous (lo, hi) ranges that exhaustively cover [lo0, hi0].
    """
    numbered = "\n".join(
        f"{s['index']} [{speakers[i] or 'UNKNOWN'}]: {s['text']}"
        for i, s in enumerate(sentences[lo0 : hi0 + 1], start=lo0)
    )

    data = await call_agent(
        "reader", SYSTEM_PROMPT, f"Sentences:\n{numbered}",
        api_key=api_key, temperature=0.0, max_tokens=8192,
    )
    raw_segments = data.get("segments", []) if isinstance(data, dict) else data

    ranges: list[tuple[int, int]] = []
    covered = lo0 - 1  # highest sentence index assigned so far

    for seg in raw_segments:
        try:
            lo, hi = int(seg["lo"]), int(seg["hi"])
        except (KeyError, TypeError, ValueError):
            continue
        lo = max(lo, covered + 1)
        hi = min(hi, hi0)
        if lo > hi:
            continue
        ranges.append((lo, hi))
        covered = hi

    # Cover any tail the LLM dropped so no content is silently lost
    if covered < hi0:
        ranges.append((covered + 1, hi0))

    return ranges


async def read_segments(
    sentences: list[dict[str, Any]],
    diar_timeline: list[tuple[float, float, str]],
    api_key: str,
) -> list[dict[str, Any]]:
    """
    Returns segments:
    {
        "segment_id": int,
        "lo": int, "hi": int,          # sentence index range (inclusive)
        "speaker": str | None,          # dominant speaker
        "text": str,
        "start": float, "end": float,   # seconds, from word timestamps
        "duration_sec": float,
    }
    """
    if not sentences:
        return []

    speakers = [_sentence_speaker(s, diar_timeline) for s in sentences]
    chunks = chunk_sentence_ranges(sentences)

    if len(chunks) <= 1:
        ranges = await _read_range(sentences, speakers, 0, len(sentences) - 1, api_key)
    else:
        log.info("Reader: long transcript — %d sentences split into %d chunks", len(sentences), len(chunks))
        sem = asyncio.Semaphore(MAX_PARALLEL_CHUNKS)

        async def _one(lo0: int, hi0: int) -> list[tuple[int, int]]:
            async with sem:
                try:
                    return await _read_range(sentences, speakers, lo0, hi0, api_key)
                except Exception as e:
                    # One bad chunk must not sink a 10-hour job — degrade to a
                    # single whole-chunk segment and keep going
                    log.warning("Reader chunk %d-%d failed (%s) — fallback segment", lo0, hi0, e)
                    return [(lo0, hi0)]

        chunk_results = await asyncio.gather(*[_one(lo0, hi0) for lo0, hi0 in chunks])
        ranges = [r for chunk in chunk_results for r in chunk]

    segments: list[dict[str, Any]] = []
    for lo, hi in ranges:
        seg_sents = sentences[lo : hi + 1]
        seg_speakers = [speakers[i] for i in range(lo, hi + 1) if speakers[i]]
        dominant = max(set(seg_speakers), key=seg_speakers.count) if seg_speakers else None

        segments.append({
            "segment_id":   len(segments),
            "lo":           lo,
            "hi":           hi,
            "speaker":      dominant,
            "text":         " ".join(s["text"] for s in seg_sents),
            "start":        seg_sents[0]["start"],
            "end":          seg_sents[-1]["end"],
            "duration_sec": round(seg_sents[-1]["end"] - seg_sents[0]["start"], 3),
        })

    log.info("Reader: %d sentences → %d segments", len(sentences), len(segments))
    return segments
