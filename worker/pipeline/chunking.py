"""
Transcript chunking for long videos (1.5h–10h).

A single Reader call degrades badly past ~40 minutes of transcript, and a
single Evaluator call cannot hold every candidate from a long video. Strategy:

- Split the sentence list into contiguous ~20-minute windows.
- Snap each boundary to the longest inter-sentence pause inside a ±2.5 minute
  search window around the target — long pauses approximate topic changes, so
  potential clips rarely span a chunk boundary.
- Sentence indices stay GLOBAL throughout, so downstream agents (tension,
  knowledge gap, evaluator, cut finder) are unaffected by chunking.
"""

from __future__ import annotations

TARGET_CHUNK_S      = 1200.0   # ~20 min of speech per Reader call
BOUNDARY_SEARCH_S   = 150.0    # snap window around each target boundary
MAX_CHUNK_SENTENCES = 500      # hard cap regardless of durations
SINGLE_CALL_MAX_S   = 2400.0   # transcripts ≤ 40 min keep today's single-call path
MIN_TAIL_FRACTION   = 0.25     # a final chunk shorter than this × target merges back


def chunk_sentence_ranges(
    sentences: list[dict],
    target_s: float = TARGET_CHUNK_S,
    search_s: float = BOUNDARY_SEARCH_S,
    max_sentences: int = MAX_CHUNK_SENTENCES,
    single_call_max_s: float = SINGLE_CALL_MAX_S,
) -> list[tuple[int, int]]:
    """
    Contiguous, exhaustive [lo, hi] sentence-index ranges covering the whole
    transcript. Short transcripts return a single range.
    """
    n = len(sentences)
    if n == 0:
        return []
    total_s = sentences[-1]["end"] - sentences[0]["start"]
    if total_s <= single_call_max_s and n <= max_sentences:
        return [(0, n - 1)]

    def pause_after(i: int) -> float:
        if i + 1 >= n:
            return float("inf")
        return sentences[i + 1]["start"] - sentences[i]["end"]

    ranges: list[tuple[int, int]] = []
    lo = 0
    while lo < n:
        hard_hi = min(lo + max_sentences - 1, n - 1)
        ideal_t = sentences[lo]["start"] + target_s

        if sentences[hard_hi]["end"] <= ideal_t + search_s:
            # Remainder fits in this chunk (or the sentence cap forces the break)
            hi = hard_hi
        else:
            window = [
                i for i in range(lo, hard_hi + 1)
                if abs(sentences[i]["end"] - ideal_t) <= search_s
            ]
            if window:
                # Break at the longest pause — most likely a topic boundary
                hi = max(window, key=pause_after)
            else:
                # Nothing ends near the target: last sentence before it, if any
                before = [i for i in range(lo, hard_hi + 1) if sentences[i]["end"] < ideal_t]
                hi = before[-1] if before else lo

        hi = max(hi, lo)  # always make forward progress
        ranges.append((lo, hi))
        lo = hi + 1

    # A degenerate tiny tail chunk reads better merged into its predecessor
    if len(ranges) > 1:
        t_lo, t_hi = ranges[-1]
        tail_s = sentences[t_hi]["end"] - sentences[t_lo]["start"]
        p_lo, _ = ranges[-2]
        if tail_s < target_s * MIN_TAIL_FRACTION and (t_hi - p_lo + 1) <= max_sentences:
            ranges[-2:] = [(p_lo, t_hi)]

    return ranges
