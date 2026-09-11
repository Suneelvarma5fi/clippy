"""
Agent 4 — Clip Evaluator
Run the full quality checklist (spec §3) against every surviving candidate,
decide stitching across candidates (spec §8), apply the duration gate, score,
classify, and rank.

Long videos produce more candidates than one LLM call can evaluate honestly,
so candidates are split into contiguous batches (preserving chronological
order — stitching only ever combines temporally close candidates), evaluated
in parallel, then merged and ranked globally in code.

The LLM ticks checkboxes and picks sentence ranges; all arithmetic (totals,
classification, duration gate, ranking) happens in code.
"""

from __future__ import annotations
import asyncio
import logging
from typing import Any

from .openrouter import call_agent

log = logging.getLogger(__name__)

MUST_HAVES = ["hook", "cold_start", "single_point", "clean_ending", "learning"]
SIGNALS    = ["emotion", "quotable", "contrast", "energy", "curiosity_gap", "low_filler"]

# Hard duration gate (spec §3.1)
GATE_MIN_S = 10.0
GATE_MAX_S = 120.0

EVAL_BATCH_SIZE      = 10   # candidates per LLM call
MAX_PARALLEL_BATCHES = 4
MAX_CLIPS            = 30   # global cap after ranking (long videos)

SYSTEM_PROMPT = """\
You evaluate podcast clip candidates against a strict quality checklist. Each \
candidate segment has already been flagged for tension and scored for knowledge gap. \
Your job: turn candidates into publishable clips, tick the checklist honestly, and \
trim or stitch where it makes the clip stronger.

## The cold-start test (hard gate)
Read each clip as if you have never heard the podcast. Does a total stranger \
understand it? Does it make them feel something? If not — trim sentences until it \
does, or do not output it.

## Building clips
Each clip is one or more sentence_groups, where each group is a [lo, hi] pair of \
GLOBAL sentence indices (as numbered in the input). You may:
- use a candidate as-is
- trim it (drop warm-up or trailing sentences)
- stitch two or more candidates into ONE clip — only if they are semantically \
coherent played back-to-back: a stranger would not feel confused or jarred. \
Setup + payoff, claim + proof, question + later answer. Never stitch across a topic \
change, never stitch independent points, never stitch to hit a duration target.

## Must-haves (tick honestly — fewer than 3 means the clip is dropped)
- hook: opens mid-thought or with a strong line. No warm-up, no "so yeah"
- cold_start: a total stranger understands it without any episode context
- single_point: one clear idea, story, or argument — not three half-finished ones
- clean_ending: thought lands fully — not cut off, not trailing into the next topic
- learning: viewer walks away knowing something new, or sees something familiar in a new way

## Quality signals
- emotion: triggers curiosity, surprise, relatability, awe, or laughter
- quotable: one sentence inside the clip someone would screenshot or repeat
- contrast: contains a reversal or counterintuitive angle
- energy: delivery is engaged — not monotone or trailing off
- curiosity_gap: clip satisfies but leaves one question open — viewer wants more
- low_filler: minimal ums/uhs, or they are editable without breaking meaning

## Duration
Clips must total {min_dur}-{max_dur} seconds of speech. Use the per-sentence \
durations given in the input.

Output strict JSON only:
{{"clips": [{{"source_candidates": [<candidate ids>], "sentence_groups": [[lo, hi], ...], \
"must_haves": {{"hook": bool, "cold_start": bool, "single_point": bool, "clean_ending": bool, "learning": bool}}, \
"signals": {{"emotion": bool, "quotable": bool, "contrast": bool, "energy": bool, "curiosity_gap": bool, "low_filler": bool}}, \
"reasoning": "<one line: why this works, and whether stitching/trimming was used and why>"}}]}}\
"""


def _format_candidates(candidates: list[dict], sentences: list[dict]) -> str:
    blocks = []
    for c in candidates:
        lines = [
            f"Candidate {c['segment_id']} "
            f"[tension: {c['tension_type']} — {c['annotation']} | "
            f"knowledge_gap: {c['knowledge_gap']}/3 | ~{c['duration_sec']:.0f}s]"
        ]
        for i in range(c["lo"], c["hi"] + 1):
            s = sentences[i]
            lines.append(f"  {s['index']} ({s['end'] - s['start']:.1f}s): {s['text']}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def classify(must_haves: int, signals: int) -> str | None:
    """Spec §3.4. Returns label, or None for skip."""
    if must_haves == 5 and signals >= 4:
        return "hero"
    if must_haves >= 4 and signals >= 3:
        return "strong"
    if must_haves >= 3:
        return "decent"
    return None


def _resolve_groups(
    groups: list[list[int]],
    sentences: list[dict],
) -> tuple[list[dict[str, float]], str] | None:
    """Sentence index groups → [{start, end}] cuts (seconds) + transcript text."""
    max_idx = len(sentences) - 1
    cuts: list[dict[str, float]] = []
    text_parts: list[str] = []
    for group in groups:
        if len(group) != 2:
            return None
        lo, hi = max(0, int(group[0])), min(int(group[1]), max_idx)
        if lo > hi:
            return None
        group_sents = sentences[lo : hi + 1]
        cuts.append({
            "start": float(group_sents[0]["start"]),
            "end":   float(group_sents[-1]["end"]),
        })
        text_parts.append(" ".join(s["text"] for s in group_sents))
    return cuts, " ".join(text_parts)


async def evaluate_clips(
    candidates: list[dict[str, Any]],
    sentences: list[dict[str, Any]],
    api_key: str,
    min_duration_s: float | None = None,
    max_duration_s: float | None = None,
    batch_size: int = EVAL_BATCH_SIZE,
) -> list[dict[str, Any]]:
    """
    Returns ranked clips:
    {
        "rank": int, "label": "hero"|"strong"|"decent",
        "score_total": int (of 11), "must_haves": int (of 5), "signals": int (of 6),
        "must_have_ticks": {...}, "signal_ticks": {...},
        "tension_type": str, "knowledge_gap": int,
        "sentence_groups": [[lo, hi], ...], "stitched": bool,
        "cuts_raw": [{start, end}, ...] (seconds, approximate),
        "duration_sec": float, "text": str, "reasoning": str,
    }
    """
    if not candidates:
        return []

    gate_min = max(min_duration_s or GATE_MIN_S, GATE_MIN_S)
    gate_max = min(max_duration_s or GATE_MAX_S, GATE_MAX_S)

    system = SYSTEM_PROMPT.format(min_dur=int(gate_min), max_dur=int(gate_max))
    batches = [candidates[i : i + batch_size] for i in range(0, len(candidates), batch_size)]

    if len(batches) == 1:
        data = await call_agent(
            "evaluator", system, f"Candidates:\n\n{_format_candidates(candidates, sentences)}",
            api_key=api_key, temperature=0.2, max_tokens=8192,
        )
        raw_clips = data.get("clips", []) if isinstance(data, dict) else data
    else:
        log.info("Evaluator: %d candidates → %d batches", len(candidates), len(batches))
        sem = asyncio.Semaphore(MAX_PARALLEL_BATCHES)

        async def _eval_batch(batch: list[dict]) -> list[dict]:
            async with sem:
                try:
                    data = await call_agent(
                        "evaluator", system, f"Candidates:\n\n{_format_candidates(batch, sentences)}",
                        api_key=api_key, temperature=0.2, max_tokens=8192,
                    )
                    return data.get("clips", []) if isinstance(data, dict) else data
                except Exception as e:
                    # One bad batch must not sink the whole job
                    log.warning("Evaluator batch failed (%s) — %d candidates skipped", e, len(batch))
                    return []

        results = await asyncio.gather(*[_eval_batch(b) for b in batches])
        raw_clips = [c for batch_clips in results for c in batch_clips]

    by_id = {c["segment_id"]: c for c in candidates}
    clips: list[dict[str, Any]] = []

    for raw in raw_clips:
        groups = raw.get("sentence_groups") or []
        resolved = _resolve_groups(groups, sentences)
        if resolved is None or not resolved[0]:
            continue
        cuts_raw, text = resolved

        mh_ticks  = {k: bool((raw.get("must_haves") or {}).get(k)) for k in MUST_HAVES}
        sig_ticks = {k: bool((raw.get("signals") or {}).get(k)) for k in SIGNALS}
        mh_count, sig_count = sum(mh_ticks.values()), sum(sig_ticks.values())

        label = classify(mh_count, sig_count)
        if label is None:
            log.info("Evaluator: clip dropped — only %d must-haves", mh_count)
            continue

        duration = sum(c["end"] - c["start"] for c in cuts_raw)
        if not (gate_min <= duration <= gate_max):
            log.info("Evaluator: clip dropped — %.1fs outside gate [%s, %s]",
                     duration, gate_min, gate_max)
            continue

        # Inherit tension/gap from the strongest source candidate
        sources = [by_id[i] for i in (raw.get("source_candidates") or []) if i in by_id]
        best_src = max(sources, key=lambda s: s["knowledge_gap"]) if sources else None

        clips.append({
            "label":           label,
            "score_total":     mh_count + sig_count,
            "must_haves":      mh_count,
            "signals":         sig_count,
            "must_have_ticks": mh_ticks,
            "signal_ticks":    sig_ticks,
            "tension_type":    best_src["tension_type"] if best_src else None,
            "knowledge_gap":   best_src["knowledge_gap"] if best_src else None,
            "speaker":         best_src.get("speaker") if best_src else None,
            "sentence_groups": [[int(g[0]), int(g[1])] for g in groups],
            "stitched":        len(cuts_raw) > 1,
            "cuts_raw":        cuts_raw,
            "duration_sec":    round(duration, 3),
            "text":            text,
            "reasoning":       raw.get("reasoning", ""),
        })

    # Rank: total score desc, ties broken by must-have count (spec §3.4)
    clips.sort(key=lambda c: (c["score_total"], c["must_haves"]), reverse=True)
    del clips[MAX_CLIPS:]
    for rank, clip in enumerate(clips, start=1):
        clip["rank"] = rank

    log.info("Evaluator: %d candidates → %d publishable clips", len(candidates), len(clips))
    return clips
