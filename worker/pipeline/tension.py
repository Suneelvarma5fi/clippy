"""
Agent 2 — Tension Detector
Identify the semantic friction in each segment. Tension is the entry criterion
for clip candidacy (spec §2.1) — content patterns are downstream of tension.
Runs in parallel, one call per segment, capped by a semaphore.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any

from .openrouter import call_agent

log = logging.getLogger(__name__)

MAX_PARALLEL = 10

SYSTEM_PROMPT = """\
You find semantic friction in podcast transcript segments. Shareable clips are not \
found by pattern matching — they are found by locating tension. Every shareable clip \
has exactly one of three tensions:

- belief_vs_reality — the speaker says something that contradicts what most people \
assume to be true
- before_vs_after — the speaker's thinking visibly changed; the distance between who \
they were and who they became is the tension
- known_vs_unknown — the speaker reveals something the listener didn't know they \
didn't know. Not just a fact — a fact that reframes something familiar

Patterns like hot takes, myth-busts, and Q&A exchanges are tension in a specific \
shape — do not flag a segment just because it matches a pattern. Flag it only if you \
can name the friction.

Flag a segment whenever you can name a plausible friction — including borderline \
cases; downstream scoring separates strong clips from weak ones. Only leave a segment \
unflagged when there is no friction at all: pure context-setting, small talk, or \
logistics.

Output strict JSON only:
{"flagged": true|false, "tension_type": "belief_vs_reality"|"before_vs_after"|"known_vs_unknown"|null, "annotation": "<one line naming the friction, or empty string>"}\
"""

VALID_TYPES = {"belief_vs_reality", "before_vs_after", "known_vs_unknown"}


async def _detect_one(segment: dict, api_key: str, sem: asyncio.Semaphore) -> dict[str, Any]:
    async with sem:
        data = await call_agent(
            "tension", SYSTEM_PROMPT, f"Segment:\n{segment['text']}",
            api_key=api_key, temperature=0.3, max_tokens=512,
        )
    flagged = bool(data.get("flagged"))
    tension_type = data.get("tension_type")
    if flagged and tension_type not in VALID_TYPES:
        flagged = False
        tension_type = None
    return {
        **segment,
        "flagged":      flagged,
        "tension_type": tension_type if flagged else None,
        "annotation":   (data.get("annotation") or "") if flagged else "",
    }


async def detect_tension(
    segments: list[dict[str, Any]],
    api_key: str,
) -> list[dict[str, Any]]:
    """Returns only the flagged segments, annotated with tension type."""
    sem = asyncio.Semaphore(MAX_PARALLEL)
    results = await asyncio.gather(
        *(_detect_one(s, api_key, sem) for s in segments),
        return_exceptions=True,
    )

    flagged: list[dict[str, Any]] = []
    for seg, result in zip(segments, results):
        if isinstance(result, Exception):
            log.warning("Tension detection failed for segment %s: %s", seg["segment_id"], result)
            continue
        if result["flagged"]:
            flagged.append(result)

    log.info("Tension Detector: %d/%d segments flagged", len(flagged), len(segments))
    return flagged
