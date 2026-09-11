"""
Offline tests for the Comparative Ranker — LLM mocked at the call_agent seam.
Run: python test_ranker.py
"""

from __future__ import annotations
import asyncio

import pipeline.ranker as ranker
from pipeline.ranker import rank_clips, _overlap_fraction, _sanitize_order, _apply_constraints


def _clip(i: int, start: float, dur: float = 30.0, archetype: str = "insight",
          score_total: int = 8, scout_score: int = 50) -> dict:
    return {
        "archetype": archetype, "score_total": score_total, "scout_score": scout_score,
        "duration_sec": dur, "transplant": False,
        "cuts_raw": [{"start": start, "end": start + dur}],
        "text": f"clip {i} text",
    }


def _run(clips, response, target_tones=None, max_clips=10):
    async def fake_call_agent(agent, system, user, **kw):
        assert agent == "ranker"
        fake_call_agent.last = (system, user)
        return response

    orig = ranker.call_agent
    ranker.call_agent = fake_call_agent
    try:
        out = asyncio.run(rank_clips(clips, "key", target_tones, max_clips))
        return out, fake_call_agent
    finally:
        ranker.call_agent = orig


def test_overlap_fraction():
    a = [{"start": 0.0, "end": 30.0}]
    b = [{"start": 25.0, "end": 55.0}]
    assert abs(_overlap_fraction(a, b) - 5 / 30) < 1e-9
    assert _overlap_fraction(a, a) == 1.0
    assert _overlap_fraction(a, [{"start": 100.0, "end": 130.0}]) == 0.0
    # Multi-cut (stitched) clips accumulate overlap across pairs
    c = [{"start": 0.0, "end": 10.0}, {"start": 50.0, "end": 60.0}]
    d = [{"start": 5.0, "end": 15.0}, {"start": 55.0, "end": 65.0}]
    assert abs(_overlap_fraction(c, d) - 10 / 20) < 1e-9


def test_sanitize_order():
    clips = [_clip(i, i * 100.0, score_total=i) for i in range(4)]
    # Junk filtered, missing ids appended by checklist score (3,2 better than 0)
    order = _sanitize_order({"order": [2, "x", 2, 99, 1]}, 4, clips)
    assert order[:2] == [2, 1]
    assert set(order) == {0, 1, 2, 3}
    assert order[2:] == [3, 0]
    # Non-dict / garbage → pure fallback order
    order = _sanitize_order(None, 4, clips)
    assert order == [3, 2, 1, 0]


def test_llm_order_respected_and_ranked():
    clips = [_clip(0, 0.0), _clip(1, 100.0), _clip(2, 200.0)]
    out, fake = _run(clips, {"order": [1, 2, 0]})
    assert [c["rank"] for c in out] == [1, 2, 3]
    assert out[0]["cuts_raw"][0]["start"] == 100.0
    system, user = fake.last
    assert "Clip 0" in user and "Clip 2" in user


def test_overlap_dedup_keeps_better_ranked():
    clips = [
        _clip(0, 0.0),                # winner
        _clip(1, 5.0),                # overlaps clip 0 by 25/30 — duplicate
        _clip(2, 500.0),
    ]
    out, _ = _run(clips, {"order": [0, 1, 2]})
    starts = [c["cuts_raw"][0]["start"] for c in out]
    assert starts == [0.0, 500.0]


def test_archetype_diversity_cap():
    # 6 insight clips + 2 humor; max_clips=4 → cap 2 insight in first pass,
    # spare slots filled from deferred insights afterwards
    clips = [_clip(i, i * 200.0, archetype="insight") for i in range(6)]
    clips += [_clip(6, 2000.0, archetype="humor"), _clip(7, 3000.0, archetype="humor")]
    out, _ = _run(clips, {"order": [0, 1, 2, 3, 4, 5, 6, 7]}, max_clips=4)
    assert len(out) == 4
    archetypes = [c["archetype"] for c in out]
    assert archetypes.count("humor") == 2          # cap let both humor clips in
    assert archetypes[:3] == ["insight", "insight", "humor"]


def test_max_clips_and_single_clip():
    clips = [_clip(i, i * 200.0) for i in range(8)]
    out, _ = _run(clips, {"order": list(range(8))}, max_clips=3)
    assert len(out) == 3
    # Single clip skips the LLM entirely
    async def boom(*a, **kw):
        raise AssertionError("should not be called")
    orig = ranker.call_agent
    ranker.call_agent = boom
    try:
        out = asyncio.run(rank_clips([_clip(0, 0.0)], "key"))
    finally:
        ranker.call_agent = orig
    assert len(out) == 1 and out[0]["rank"] == 1
    assert asyncio.run(rank_clips([], "key")) == []


def test_llm_failure_falls_back_to_checklist_order():
    clips = [
        _clip(0, 0.0, score_total=5),
        _clip(1, 200.0, score_total=11),
        _clip(2, 400.0, score_total=8),
    ]
    async def boom(*a, **kw):
        raise RuntimeError("down")
    orig = ranker.call_agent
    ranker.call_agent = boom
    try:
        out = asyncio.run(rank_clips(clips, "key"))
    finally:
        ranker.call_agent = orig
    assert [c["score_total"] for c in out] == [11, 8, 5]


def test_tone_hint_in_prompt():
    clips = [_clip(0, 0.0), _clip(1, 200.0)]
    _, fake = _run(clips, {"order": [0, 1]}, target_tones=["entertaining", "emotional"])
    system, _ = fake.last
    assert "entertaining, emotional" in system


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all tests passed")
