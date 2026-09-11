"""
Offline tests for clip pipeline v2 pure logic — no API keys, no audio files.
Run: python test_clip_pipeline.py
"""

from __future__ import annotations
import numpy as np

from pipeline.energy_index import EnergyIndex, silence_threshold
from pipeline.cut_finder import find_cut_points, _clear_overlap
from pipeline.evaluator import classify, _resolve_groups


def test_classify():
    assert classify(5, 4) == "hero"
    assert classify(5, 6) == "hero"
    assert classify(5, 3) == "strong"   # 5 must-haves but only 3 signals
    assert classify(4, 3) == "strong"
    assert classify(4, 2) == "decent"
    assert classify(3, 0) == "decent"
    assert classify(2, 6) is None       # fewer than 3 must-haves → skip
    assert classify(0, 0) is None


def test_resolve_groups():
    sentences = [
        {"index": 0, "text": "First.",  "start": 0.0,  "end": 2.0},
        {"index": 1, "text": "Second.", "start": 2.5,  "end": 5.0},
        {"index": 2, "text": "Third.",  "start": 10.0, "end": 14.0},
    ]
    cuts, text = _resolve_groups([[0, 1], [2, 2]], sentences)
    assert cuts == [{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 14.0}]
    assert text == "First. Second. Third."
    # Out-of-range indices are clamped
    cuts, _ = _resolve_groups([[1, 99]], sentences)
    assert cuts == [{"start": 2.5, "end": 14.0}]
    # Malformed group rejected
    assert _resolve_groups([[2, 1, 0]], sentences) is None


def test_silence_threshold_robust_to_loud_intro():
    # 90% speech at 1.0, 10% loud music intro at 50.0
    rms = np.concatenate([np.full(100, 50.0), np.full(900, 1.0)])
    thr = silence_threshold(rms)
    # mean-based threshold would be 0.59 — more than half of speech-pause
    # energy; p60-based stays at 10% of typical speech energy
    assert abs(thr - 0.1) < 1e-9
    # Quiet pauses at 0.05 are silent, speech is not
    assert 0.05 < thr < 1.0
    # Large silent fraction doesn't zero the threshold
    rms = np.concatenate([np.zeros(400), np.full(600, 1.0)])
    assert silence_threshold(rms) == 0.1
    # Empty index
    assert silence_threshold(np.array([])) == 0.0


def _index_with_silence(silent_frames: set[int], n: int = 2000) -> EnergyIndex:
    """20ms frames; loud everywhere except the given frame numbers."""
    rms = np.full(n, 1.0)
    for f in silent_frames:
        rms[f] = 0.0
    return EnergyIndex(rms=rms, hop_ms=20.0, threshold=float(np.mean(rms)) * 0.1)


def test_cut_snapping():
    # Words span 5.0s–10.0s; silence at 4.8s (frame 240) and 10.3s (frame 515)
    index = _index_with_silence({240, 515})
    clip = {"cuts_raw": [{"start": 5.0, "end": 10.0}], "speaker": "A"}
    out = find_cut_points(clip, index, diar_timeline=[])
    [chunk] = out["chunks"]
    assert chunk["start_ms"] == 4800, chunk
    assert chunk["end_ms"] == 10300, chunk
    assert not out["crosstalk_flagged"]
    assert out["cuts"] == [{"start": 4.8, "end": 10.3}]


def test_cut_fallback_to_word_boundary():
    # No silence anywhere → exact word timestamps (spec §5.4 step 7)
    index = _index_with_silence(set())
    clip = {"cuts_raw": [{"start": 5.0, "end": 10.0}], "speaker": None}
    out = find_cut_points(clip, index, diar_timeline=[])
    [chunk] = out["chunks"]
    assert chunk["start_ms"] == 5000
    assert chunk["end_ms"] == 10000
    # No index at all → same fallback
    out = find_cut_points(clip, None, diar_timeline=[])
    assert out["chunks"][0]["start_ms"] == 5000


def test_speaker_safe_silence():
    # Silence at 4.8s, but speaker B is talking through 4.0–4.9s →
    # not speaker-safe for a clip by speaker A; falls back to word boundary.
    index = _index_with_silence({240})
    diar = [(4.0, 4.9, "B")]
    clip = {"cuts_raw": [{"start": 5.0, "end": 10.0}], "speaker": "A"}
    out = find_cut_points(clip, index, diar)
    assert out["chunks"][0]["start_ms"] == 5000
    # Same silence is fine when it belongs to the clip's own speaker
    out = find_cut_points({**clip, "speaker": "B"}, index, diar)
    assert out["chunks"][0]["start_ms"] == 4800


def test_crosstalk_shift():
    # Two speakers overlap 9.9–10.5s; end cut at 10.0 sits inside the overlap
    diar = [(2.0, 10.5, "A"), (9.9, 10.5, "B")]
    shifted, flagged = _clear_overlap(10_000.0, diar)
    assert flagged
    assert shifted > 10_500.0 - 20  # cleared just past the overlap
    # No overlap → untouched
    shifted, flagged = _clear_overlap(5_000.0, diar)
    assert not flagged and shifted == 5_000.0


def test_stitched_chunks_refined_independently():
    # Silences near both chunk boundaries: 4.8s, 10.3s, 19.9s, 30.4s
    index = _index_with_silence({240, 515, 995, 1520})
    clip = {
        "cuts_raw": [{"start": 5.0, "end": 10.0}, {"start": 20.0, "end": 30.0}],
        "speaker": None,
    }
    out = find_cut_points(clip, index, diar_timeline=[])
    assert [(c["start_ms"], c["end_ms"]) for c in out["chunks"]] == [
        (4800, 10300), (19900, 30400),
    ]
    assert out["duration_sec"] == round((10.3 - 4.8) + (30.4 - 19.9), 3)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all tests passed")
