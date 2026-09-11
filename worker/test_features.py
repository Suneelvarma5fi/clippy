"""
Offline tests for Stage 0 feature enrichment — no API keys, no audio files.
Run: python test_features.py
"""

from __future__ import annotations
import numpy as np

from pipeline.energy_index import EnergyIndex
from pipeline.features import (
    enrich_sentences, infer_roles, annotation_tags, format_sentence_line,
)


def _sent(idx: int, text: str, start: float, end: float, n_words: int | None = None) -> dict:
    words = [{"word": w} for w in text.split()] if n_words is None else [{"word": "x"}] * n_words
    return {"index": idx, "text": text, "start": start, "end": end, "words": words}


def _flat_index(n_frames: int = 3000, level: float = 0.5) -> EnergyIndex:
    rms = np.full(n_frames, level)
    return EnergyIndex(rms=rms, hop_ms=20.0, threshold=0.05)


def test_basic_features():
    sentences = [
        _sent(0, "Hello there everyone.", 0.0, 2.0),
        _sent(1, "Slow sentence here.", 4.0, 10.0),     # 2s lead pause
        _sent(2, "Fast quick rapid words now spoken.", 10.2, 11.2),
    ]
    feats = enrich_sentences(sentences, [], None)
    assert len(feats) == 3
    assert feats[0]["lead_pause"] == 0.0
    assert feats[1]["lead_pause"] == 2.0
    assert feats[0]["trail_pause"] == 2.0
    assert feats[2]["trail_pause"] == 0.0
    assert feats[2]["wps"] == 6.0          # 6 words / 1s
    assert feats[1]["wps"] == 0.5          # 3 words / 6s
    # No energy index → no energy features, no laughter
    assert feats[0]["energy_pct"] is None
    assert not feats[0]["laughter_after"]


def test_speaker_lookup_and_rapid_exchange():
    diar = [(0.0, 5.0, "A"), (5.0, 10.0, "B"), (10.0, 15.0, "A"), (15.0, 20.0, "B")]
    sentences = [
        _sent(0, "One.", 0.0, 4.0),
        _sent(1, "Two.", 5.5, 9.0),
        _sent(2, "Three.", 10.5, 14.0),
        _sent(3, "Four.", 15.5, 19.0),
    ]
    feats = enrich_sentences(sentences, diar, None)
    assert [f["speaker"] for f in feats] == ["A", "B", "A", "B"]
    # 3 switches inside the window by sentence 3
    assert feats[3]["rapid_exchange"]
    assert not feats[0]["rapid_exchange"]


def test_laughter_proxy():
    # Frames are 20ms. Sentence ends at 2.0s, next starts at 4.0s.
    # Loud gap (laughter) vs quiet gap (true silence).
    rms = np.full(3000, 0.5)
    rms[100:200] = 2.0   # 2.0s-4.0s loud despite no words
    index = EnergyIndex(rms=rms, hop_ms=20.0, threshold=0.05)
    sentences = [
        _sent(0, "That is hilarious.", 0.0, 2.0),
        _sent(1, "Anyway moving on.", 4.0, 6.0),
    ]
    feats = enrich_sentences(sentences, [], index)
    assert feats[0]["laughter_after"]

    quiet = EnergyIndex(rms=np.full(3000, 0.5), hop_ms=20.0, threshold=0.05)
    feats = enrich_sentences(sentences, [], quiet)
    # Gap energy equals p70 of a flat signal → still "loud"; use a truly quiet gap
    rms2 = np.full(3000, 0.5)
    rms2[100:200] = 0.0
    quiet = EnergyIndex(rms=rms2, hop_ms=20.0, threshold=0.05)
    feats = enrich_sentences(sentences, [], quiet)
    assert not feats[0]["laughter_after"]


def test_energy_percentile():
    # Sentence 1 sits in a loud region, sentence 0 in a quiet one
    rms = np.full(3000, 0.1)
    rms[250:400] = 3.0   # 5.0s-8.0s
    index = EnergyIndex(rms=rms, hop_ms=20.0, threshold=0.05)
    sentences = [
        _sent(0, "Quiet bit.", 0.0, 2.0),
        _sent(1, "LOUD BIT!", 5.0, 7.5),
    ]
    feats = enrich_sentences(sentences, [], index)
    assert feats[1]["energy_pct"] > feats[0]["energy_pct"]
    assert feats[1]["energy_pct"] == 100


def test_infer_roles():
    diar = []
    sentences, features = [], []
    t = 0.0
    # A asks short questions, B gives long answers — 3 Q&A rounds
    for i in range(3):
        sentences.append(_sent(len(sentences), "What do you think about that?", t, t + 2))
        features.append({"speaker": "A"})
        t += 3
        sentences.append(_sent(len(sentences), "Well it is a long story with many details involved here.", t, t + 8))
        features.append({"speaker": "B"})
        t += 9
    roles = infer_roles(sentences, features)
    assert roles == {"A": "host", "B": "guest"}

    # Single speaker → no roles
    solo_feats = [{"speaker": "A"} for _ in sentences]
    assert infer_roles(sentences, solo_feats) == {}


def test_annotations_and_line_format():
    feat = {
        "speaker": "S0", "wps": 2.0, "lead_pause": 2.0, "trail_pause": 0.1,
        "energy_pct": 92, "laughter_after": True, "rapid_exchange": False,
    }
    tags = annotation_tags(feat)
    assert "[laughter]" in tags and "[long pause before]" in tags and "[energy spike]" in tags
    assert "[rapid exchange]" not in tags

    line = format_sentence_line(
        _sent(7, "Big reveal.", 10.0, 12.5), feat, {"S0": "host"}, marker=">>> "
    )
    assert line.startswith(">>> 7 (2.5s) [S0 host]")
    assert "[laughter]" in line and line.endswith("Big reveal.")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("all tests passed")
