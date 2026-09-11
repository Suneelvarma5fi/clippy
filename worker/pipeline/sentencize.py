"""
Step 1 — Sentencize
Concatenate WhisperX raw_words into full text, run spaCy rule-based sentencizer,
map sentence spans back to word objects for precise timestamps per sentence.
"""

from __future__ import annotations
import re
from typing import Any
import spacy
from spacy.lang.en import English

# Load once — blank model + sentencizer only (no vectors, no NER, fast)
_nlp: spacy.language.Language | None = None


def _get_nlp() -> spacy.language.Language:
    global _nlp
    if _nlp is None:
        _nlp = English()
        _nlp.add_pipe("sentencizer")
    return _nlp


def _word_text(w: dict) -> str:
    """WhisperX uses 'word' or 'text' — handle both."""
    return w.get("word") or w.get("text") or ""


def sentencize(raw_words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Returns a list of sentence objects:
    {
        "index": int,
        "text": str,
        "start": float,
        "end": float,
        "words": [{"word", "start", "end", "score"}, ...]
    }
    """
    if not raw_words:
        return []

    nlp = _get_nlp()

    # Build full text with character offset → word index mapping
    chars: list[int] = []  # word index for each character position
    parts: list[str] = []
    for i, w in enumerate(raw_words):
        txt = _word_text(w)
        if not txt:
            continue
        if parts:
            parts.append(" ")
            chars.append(-1)   # space belongs to no word
        parts.append(txt)
        for _ in txt:
            chars.append(i)

    full_text = "".join(parts)
    doc = nlp(full_text)

    sentences: list[dict[str, Any]] = []
    for idx, sent in enumerate(doc.sents):
        text = sent.text.strip()
        if not text:
            continue

        # Map char range → word indices
        char_start = sent.start_char
        char_end = sent.end_char
        word_indices = sorted(set(
            chars[c] for c in range(char_start, min(char_end, len(chars)))
            if c < len(chars) and chars[c] >= 0
        ))

        if not word_indices:
            continue

        sent_words = [raw_words[i] for i in word_indices]

        # start = first word start, end = last word end
        starts = [w.get("start") for w in sent_words if w.get("start") is not None]
        ends   = [w.get("end")   for w in sent_words if w.get("end")   is not None]

        if not starts or not ends:
            continue

        sentences.append({
            "index": idx,
            "text": text,
            "start": starts[0],
            "end": ends[-1],
            "words": sent_words,
        })

    # Re-index contiguously (spaCy idx may skip blanks)
    for i, s in enumerate(sentences):
        s["index"] = i

    return sentences
