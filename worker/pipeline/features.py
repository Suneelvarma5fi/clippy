"""
Stage 0 — Feature Enrichment (deterministic, no LLM, no audio decode)
Per-sentence acoustic + speaker features computed from data the pipeline
already holds: word timestamps, the diarization timeline, and the RMS energy
index. The scout/crafter prompts render these as inline annotations so the
text models can see *delivery* (laughter, pace, pauses, banter), not just words.
"""

from __future__ import annotations
import logging
from typing import Any

import numpy as np

from .energy_index import EnergyIndex

log = logging.getLogger(__name__)

LAUGH_MIN_GAP_S    = 0.4   # min word-free gap after a sentence to test for laughter
LAUGH_ENERGY_PCTL  = 70    # gap energy above this frame-RMS percentile ⇒ laughter/applause
PAUSE_TAG_S        = 1.2   # lead pause longer than this gets a [long pause before] tag
ENERGY_TAG_PCTL    = 85    # sentence energy percentile above this gets [energy spike]
RAPID_WINDOW       = 6     # sentences considered for rapid-exchange detection
RAPID_MIN_SWITCHES = 3     # speaker switches within the window ⇒ [rapid exchange]

HOST_MIN_QUESTION_TURNS = 3     # short question turns needed to call someone the host
HOST_MIN_QUESTION_RATIO = 0.2   # …and they must be ≥ this fraction of their turns
HOST_SHORT_TURN_WORDS   = 12


def _speaker_at(t: float, diar_timeline: list[tuple[float, float, str]]) -> str | None:
    for start, end, speaker in diar_timeline:
        if start <= t <= end:
            return speaker
    return None


def enrich_sentences(
    sentences: list[dict[str, Any]],
    diar_timeline: list[tuple[float, float, str]],
    energy_index: EnergyIndex | None = None,
) -> list[dict[str, Any]]:
    """
    Returns one feature dict per sentence (parallel to `sentences`):
    {
        "speaker": str | None,
        "wps": float,              # words per second
        "lead_pause": float,       # silence before the sentence (s)
        "trail_pause": float,      # silence after the sentence (s)
        "energy_pct": int | None,  # sentence energy percentile vs whole video
        "laughter_after": bool,    # energy spike in the word-free gap after it
        "rapid_exchange": bool,    # fast speaker back-and-forth around it
    }
    """
    n = len(sentences)
    if n == 0:
        return []

    speakers = [
        _speaker_at((s["start"] + s["end"]) / 2, diar_timeline) for s in sentences
    ]

    # Sentence energy percentiles + the gap-energy threshold for laughter
    energy_pcts: list[int | None] = [None] * n
    laugh_threshold: float | None = None
    if energy_index is not None and energy_index.n_frames > 0:
        means = np.empty(n)
        for i, s in enumerate(sentences):
            lo = max(0, energy_index.frame_at(s["start"] * 1000))
            hi = min(energy_index.n_frames - 1, energy_index.frame_at(s["end"] * 1000))
            means[i] = float(np.mean(energy_index.rms[lo : hi + 1])) if hi >= lo else 0.0
        ranks = np.argsort(np.argsort(means))
        energy_pcts = [int(r * 100 / max(n - 1, 1)) for r in ranks]
        laugh_threshold = float(np.percentile(energy_index.rms, LAUGH_ENERGY_PCTL))

    features: list[dict[str, Any]] = []
    for i, s in enumerate(sentences):
        dur = max(s["end"] - s["start"], 1e-6)
        n_words = len(s.get("words") or s["text"].split())
        lead = max(0.0, s["start"] - sentences[i - 1]["end"]) if i > 0 else 0.0
        trail = max(0.0, sentences[i + 1]["start"] - s["end"]) if i + 1 < n else 0.0

        # Laughter proxy: a word-free gap after the sentence that is still loud.
        # Aligned words ended, energy didn't ⇒ laughter/applause/exclamation.
        laughter = False
        if (
            laugh_threshold is not None
            and energy_index is not None
            and trail >= LAUGH_MIN_GAP_S
        ):
            g_lo = energy_index.frame_at(s["end"] * 1000)
            g_hi = min(
                energy_index.n_frames - 1,
                energy_index.frame_at((s["end"] + min(trail, 3.0)) * 1000),
            )
            if g_hi >= g_lo >= 0:
                laughter = bool(
                    float(np.mean(energy_index.rms[g_lo : g_hi + 1])) >= laugh_threshold
                )

        # Rapid exchange: count speaker switches in the trailing window
        w_lo = max(0, i - RAPID_WINDOW + 1)
        window = [spk for spk in speakers[w_lo : i + 1] if spk]
        switches = sum(1 for a, b in zip(window, window[1:]) if a != b)

        features.append({
            "speaker":        speakers[i],
            "wps":            round(n_words / dur, 2),
            "lead_pause":     round(lead, 3),
            "trail_pause":    round(trail, 3),
            "energy_pct":     energy_pcts[i],
            "laughter_after": laughter,
            "rapid_exchange": switches >= RAPID_MIN_SWITCHES,
        })
    return features


def infer_roles(
    sentences: list[dict[str, Any]],
    features: list[dict[str, Any]],
) -> dict[str, str]:
    """
    Host/guest inference: the speaker with the highest rate of short
    question-turns is the host. Returns {speaker_id: "host"|"guest"}.
    Empty dict when there are fewer than two known speakers.
    """
    # Build turns = consecutive same-speaker sentence runs
    turns: list[tuple[str, str]] = []  # (speaker, joined text)
    cur_spk: str | None = None
    cur_texts: list[str] = []
    for s, f in zip(sentences, features):
        spk = f["speaker"]
        if spk is None:
            continue
        if spk != cur_spk and cur_spk is not None:
            turns.append((cur_spk, " ".join(cur_texts)))
            cur_texts = []
        cur_spk = spk
        cur_texts.append(s["text"])
    if cur_spk is not None:
        turns.append((cur_spk, " ".join(cur_texts)))

    stats: dict[str, dict[str, int]] = {}
    for spk, text in turns:
        st = stats.setdefault(spk, {"turns": 0, "short_q": 0})
        st["turns"] += 1
        if len(text.split()) <= HOST_SHORT_TURN_WORDS and text.rstrip().endswith("?"):
            st["short_q"] += 1

    if len(stats) < 2:
        return {}

    best_spk, best_ratio = None, 0.0
    for spk, st in stats.items():
        ratio = st["short_q"] / st["turns"]
        if (
            st["short_q"] >= HOST_MIN_QUESTION_TURNS
            and ratio >= HOST_MIN_QUESTION_RATIO
            and ratio > best_ratio
        ):
            best_spk, best_ratio = spk, ratio

    if best_spk is None:
        return {}
    return {spk: ("host" if spk == best_spk else "guest") for spk in stats}


def annotation_tags(feat: dict[str, Any]) -> list[str]:
    """Inline delivery tags for one sentence, in prompt-ready form."""
    tags: list[str] = []
    if feat["laughter_after"]:
        tags.append("[laughter]")
    if feat["lead_pause"] >= PAUSE_TAG_S:
        tags.append("[long pause before]")
    if feat["energy_pct"] is not None and feat["energy_pct"] >= ENERGY_TAG_PCTL:
        tags.append("[energy spike]")
    if feat["rapid_exchange"]:
        tags.append("[rapid exchange]")
    return tags


def format_sentence_line(
    sentence: dict[str, Any],
    feat: dict[str, Any],
    roles: dict[str, str],
    marker: str = "",
) -> str:
    """One prompt line: `idx (dur) [speaker host] [tags]: text`."""
    spk = feat["speaker"] or "UNKNOWN"
    role = " host" if roles.get(spk) == "host" else ""
    tags = annotation_tags(feat)
    tag_str = (" " + " ".join(tags)) if tags else ""
    dur = sentence["end"] - sentence["start"]
    return (
        f"{marker}{sentence['index']} ({dur:.1f}s) [{spk}{role}]{tag_str}: "
        f"{sentence['text']}"
    )
