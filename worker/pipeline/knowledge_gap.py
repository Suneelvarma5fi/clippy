"""
Agent 3 — Knowledge Gap Scorer
Estimate how widely known each flagged segment's information is to a general
adult (spec §2.2). Score 1-3. All segments pass through with their score —
the evaluator's checklist and the final score signal value; nothing is
hard-dropped here.
Runs in parallel, one call per flagged segment, capped by a semaphore.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any

from .openrouter import call_agent

log = logging.getLogger(__name__)

MAX_PARALLEL = 10

SYSTEM_PROMPT = """\
You estimate how widely known a piece of information is to a general adult. Every \
clip must fill a knowledge gap — the wider the gap, the higher the clip's value.

Score the segment 1-3:
- 1 — common knowledge restated, or common knowledge with no new framing. No gap.
- 2 — uncommon knowledge made accessible, or common knowledge genuinely reframed in \
a new way. Real gap.
- 3 — information that reframes something the viewer thought they understood. They \
didn't know they didn't know it. Maximum gap.

Calibrate against a general adult — not an expert in the speaker's field. Be honest: \
most podcast content scores 1.

Output strict JSON only:
{"knowledge_gap_score": 1|2|3, "reasoning": "<one line>"}\
"""


async def _score_one(segment: dict, api_key: str, sem: asyncio.Semaphore) -> dict[str, Any]:
    user = (
        f"Tension ({segment['tension_type']}): {segment['annotation']}\n\n"
        f"Segment:\n{segment['text']}"
    )
    async with sem:
        data = await call_agent(
            "knowledge_gap", SYSTEM_PROMPT, user,
            api_key=api_key, temperature=0.2, max_tokens=512,
        )
    score = int(data.get("knowledge_gap_score", 1))
    score = min(max(score, 1), 3)
    return {**segment, "knowledge_gap": score}


async def score_knowledge_gaps(
    flagged_segments: list[dict[str, Any]],
    api_key: str,
) -> list[dict[str, Any]]:
    """Returns all segments annotated with knowledge_gap 1-3 (no hard drop)."""
    sem = asyncio.Semaphore(MAX_PARALLEL)
    results = await asyncio.gather(
        *(_score_one(s, api_key, sem) for s in flagged_segments),
        return_exceptions=True,
    )

    scored: list[dict[str, Any]] = []
    for seg, result in zip(flagged_segments, results):
        if isinstance(result, Exception):
            log.warning("KG scoring failed for segment %s: %s", seg["segment_id"], result)
            continue
        scored.append(result)

    counts = {n: sum(1 for s in scored if s["knowledge_gap"] == n) for n in (1, 2, 3)}
    log.info(
        "Knowledge Gap Scorer: %d segments scored (gap 1: %d, 2: %d, 3: %d)",
        len(scored), counts[1], counts[2], counts[3],
    )
    return scored
