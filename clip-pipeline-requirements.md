# Podcast Clip Extraction Pipeline
**Technical Requirements & Agent Architecture — v1.0 · June 2026**

---

## 1. Overview

This document defines the end-to-end requirements for an automated podcast clip extraction pipeline. The system takes a raw podcast transcript (with word-level timestamps) and its corresponding audio file, and returns a ranked list of short-form clips — each with precise cut points, a quality score, and a ready-to-use hook line.

The pipeline is built on five specialised LLM agents and one audio processing layer, orchestrated via LangGraph. Each agent has a single cognitive job. No agent is asked to do two different types of thinking.

> **Goal:** Surface the 3–5% of a podcast that can exist alone and make a stranger stop scrolling — without watching the full episode.

---

## 2. Core Principles

### 2.1 Tension-First Thinking

Clips are not found by pattern matching — they are found by locating friction. Every shareable clip has one of three tensions:

- **Belief vs Reality** — the speaker says something that contradicts what most people assume to be true
- **Before vs After** — the speaker's thinking visibly changed. The distance between who they were and who they became is the tension
- **Known vs Unknown** — the speaker reveals something the listener didn't know they didn't know. Not just a fact — a fact that reframes something familiar

The pipeline scans for tension first. Content patterns (hot takes, myth-busts, Q&A exchanges) are downstream of tension — they are tension in a specific shape. Finding tension is the entry criterion. The checklist is the exit criterion.

### 2.2 Knowledge Gap Scoring

Every clip must fill a knowledge gap. The wider the gap — the less commonly known the information is to a general adult — the higher the clip's value. Scoring follows this hierarchy:

- Common knowledge restated → no gap, deprioritise
- Common knowledge reframed in a new way → small gap, decent clip
- Uncommon knowledge made accessible → real gap, strong clip
- Unknown knowledge that reframes something the viewer thought they understood → maximum gap, hero clip

### 2.3 The Cold-Start Test

Every clip must pass this test before scoring: read it as if you have never heard the podcast. Does a total stranger understand it? Does it make them feel something? If no — trim until it does, or drop it. This is a hard gate, not a scoring consideration.

---

## 3. Clip Quality Checklist

### 3.1 Duration Gate (Hard Cutoff)

- Minimum: **10 seconds** (~25–30 spoken words)
- Maximum: **120 seconds** (~300–320 spoken words)
- Anything outside this range is not a clip. No exceptions.

### 3.2 Must-Haves (5 points, 1 each)

A clip with fewer than 3 must-haves should not be published.

| Check | Definition |
|---|---|
| Hook | Opens mid-thought or with a strong line. No warm-up, no "so yeah" |
| Cold-start | A total stranger understands it without any episode context |
| Single point | One clear idea, story, or argument — not three half-finished ones |
| Clean ending | Thought lands fully — not cut off, not trailing into the next topic |
| Learning | Viewer walks away knowing something they didn't before, or sees something familiar in a new way |

### 3.3 Quality Signals (6 points, 1 each)

These elevate a decent clip into a strong or hero clip.

| Signal | Definition |
|---|---|
| Emotion | Triggers curiosity, surprise, relatability, awe, or laughter |
| Quotable line | One sentence inside the clip someone would screenshot or repeat |
| Contrast / flip | Contains a reversal or counterintuitive angle |
| Speaker energy | Delivery is engaged — not monotone or trailing off |
| Curiosity gap | Clip satisfies but leaves one question open — viewer wants more |
| Low filler | Minimal ums/uhs, or they are editable without breaking meaning |

### 3.4 Scoring and Classification

| Label | Criteria | Action |
|---|---|---|
| Hero clip | 5 must-haves + 4–6 signals (9–11 total) | Lead with this one |
| Strong clip | 4–5 must-haves + 3–4 signals (7–9 total) | Publish |
| Decent clip | 3–4 must-haves + 1–3 signals (4–7 total) | Publish if content is thin |
| Skip | Fewer than 3 must-haves | Drop — do not publish |

Clips are ordered by total score, highest first. Ties broken by must-have count.

---

## 4. Pipeline Architecture

The pipeline is composed of 5 LLM agents and 1 audio processing layer. Each has a single job. Orchestrated via LangGraph, which models the flow as a directed graph and enables parallel execution where appropriate.

> **Key principle:** Spend on frontier models where judgment and creativity are the job. Drop to fast/cheap models where the task is mechanical.

### 4.1 Pipeline Flow

```
Transcript + Audio File
         │
         ▼
   Agent 1 — Reader
   Chunks transcript → segments[]
         │
         ▼
   Audio Preprocessor (runs once)
   WhisperX alignment → whisperx_words[]
   librosa RMS → energy_index[]
   Both stored in pipeline state
         │
         ▼
   ┌─────────────────────────────┐
   │        PARALLEL FANOUT      │
   │    one thread per segment   │
   └─────────────────────────────┘
     │           │           │
     ▼           ▼           ▼
  Agent 2     Agent 2     Agent 2
  Tension     Tension     Tension
  Detector    Detector    Detector
     │           │           │
     ▼           ▼           ▼
  Agent 3     Agent 3     Agent 3
  KG Scorer   KG Scorer   KG Scorer
     │           │           │
     └─────┬─────┘
           ▼
     COLLECT + FILTER
     drop weak candidates
           │
           ▼
     Agent 4 — Evaluator
     Checklist + rank all clips
           │
           ▼
   ┌─────────────────────────────┐
   │        PARALLEL FANOUT      │
   │     one thread per clip     │
   └─────────────────────────────┘
     │           │           │
     ▼           ▼           ▼
  Agent 6     Agent 6     Agent 6
  Audio Cut   Audio Cut   Audio Cut
  Finder      Finder      Finder
     │           │           │
     ▼           ▼           ▼
  Agent 5     Agent 5     Agent 5
  Hook        Hook        Hook
  Writer      Writer      Writer
     │           │           │
     └─────┬─────┘
           ▼
      FINAL OUTPUT
  ranked clips + hooks + timestamps
```

### 4.2 Agent Specifications

---

#### Agent 1 — Reader

| Property | Value |
|---|---|
| Job | Chunk the transcript into natural segments. Respect speaker turns and topic shifts. |
| Skillset | Structure · Segmentation · Neutrality |
| Model | Gemini 3.1 Flash-Lite |
| Fallback | GPT-5.4 Mini |
| Input | Raw transcript with word-level timestamps (WhisperX format) |
| Output | Array of segments — each with speaker ID, text, word-level start/end timestamps |
| Execution | Sequential — must complete before any other agent runs |

---

#### Agent 2 — Tension Detector

| Property | Value |
|---|---|
| Job | Identify the semantic friction in each segment. Flag tension type and annotate in one line. |
| Skillset | Psychology · Contrast · Pattern-recognition |
| Model | GPT-5.5 |
| Fallback | Claude Opus 4.6 (A/B test — less filtered, more contrarian) |
| Input | Single segment from Agent 1 |
| Output | flagged: true/false · tension_type (belief_vs_reality / before_vs_after / known_vs_unknown) · one-line annotation |
| Execution | Parallel — one instance per segment simultaneously |
| Note | Most cognitively demanding job in the pipeline. Do not route to a budget model. |

---

#### Agent 3 — Knowledge Gap Scorer

| Property | Value |
|---|---|
| Job | Estimate how widely known this information is to a general adult. Score 1–3. Drop score-1 segments. |
| Skillset | Calibration · Awareness · Relatability |
| Model | GPT-5.4 |
| Fallback | Claude Sonnet 4.6 |
| Input | Flagged segment + tension annotation from Agent 2 |
| Output | knowledge_gap_score (1 = common knowledge, 2 = uncommon, 3 = reframes familiar belief) · drop_flag for score-1 |
| Execution | Parallel — one instance per flagged segment |

---

#### Agent 4 — Clip Evaluator

| Property | Value |
|---|---|
| Job | Run the full checklist against every surviving candidate. Apply duration gate. Score and classify. |
| Skillset | Judgment · Precision · Consistency |
| Model | GPT-5.4 Mini |
| Fallback | Claude Haiku 4.5 |
| Input | All scored segments from Agent 3 (post-filter) |
| Output | Ranked clip list — each with must-have ticks, signal ticks, total score, classification label, approximate timestamps |
| Execution | Sequential — needs all candidates to rank them |

---

#### Agent 5 — Hook Writer

| Property | Value |
|---|---|
| Job | Write one punchy hook line per approved clip. No captions, no metadata — one line only. |
| Skillset | Brevity · Provocation · Instinct |
| Model | GPT-5.5 |
| Fallback | Claude Opus 4.7 |
| Input | Single approved clip with final precise timestamps |
| Output | One hook line per clip |
| Execution | Parallel — one instance per approved clip |

---

#### Agent 6 — Audio Cut Finder

| Property | Value |
|---|---|
| Job | Resolve approximate text timestamps to precise millisecond cut points via energy index lookup. |
| Skillset | Signal processing — not an LLM |
| Stack | Reads from pre-built `whisperx_words[]` and `energy_index[]` — no direct audio or librosa calls at this stage |
| Input | Approved clip with approximate start/end timestamps + pipeline state (energy_index, whisperx_words) |
| Output | Precise start_ms and end_ms per chunk · crosstalk_flagged bool if speaker overlap detected at cut point |
| Execution | Parallel — one instance per approved clip (runs before Agent 5) |

---

## 5. Timestamp Accuracy & Audio Cutting

### 5.1 The Timestamp Problem

LLM agents work on text. Text transcripts have two accuracy issues that must be resolved before cuts are placed:

- **Word-level vs sentence-level** — cuts need word-level precision. Sentence-level timestamps are insufficient. "Starting at 00:12:34" is useless if the clean cut point is 3 words into that sentence.
- **Drift** — transcription services accumulate small errors over a long episode. A timestamp accurate at minute 10 can be off by 2–3 seconds at minute 45. For a 10-second clip this is significant.

> **Fix:** WhisperX forced alignment assigns a precise start and end timestamp to every individual word, and corrects drift using phoneme-level alignment. All timestamps in the pipeline use WhisperX word-level output.

### 5.2 Why Text Timestamps Are Not Enough

Text tells you what was said. Audio tells you where the natural cut actually is. These are different things.

A sentence might end at word level at 00:12:41 — but the speaker pauses at 00:12:39. The clean cut is at the pause, not the punctuation mark.

Three audio signals determine where a cut should land:

- **Silence / pause detection** — find the nearest silence window within ±1–2 seconds of the text boundary. Always cut in silence, not mid-breath.
- **Breath detection** — a short silence (80–150ms) between words from the same speaker is almost always a breath. Infer directly from WhisperX word gap data.
- **Energy drop** — audio energy drops at the end of a spoken phrase. Cutting on an energy drop feels clean. Cutting mid-energy feels abrupt.

### 5.3 Audio Pre-Processing — Energy Index

The audio file is pre-processed **once at pipeline start**, before any agent fanout begins. This produces two indexes stored in pipeline state and reused by Agent 6 for every cut point lookup — no audio re-processing happens during clip extraction.

**WhisperX** provides:

| Capability | How WhisperX provides it |
|---|---|
| Word-level timestamps | Every word has precise start_ms and end_ms |
| Drift correction | Forced alignment corrects Whisper's natural timestamp drift at phoneme level |
| Speaker diarization | Who is speaking when — enables crosstalk and speaker-safe cut detection |
| Breath detection | Short gaps (80–150ms) between same-speaker words inferred from gap data |

**librosa** builds a frame-level RMS energy index across the full audio:

- `librosa.feature.rms(y=audio, hop_length=512)` runs once on the full file
- At 22050 Hz sample rate, each frame covers ~23ms — roughly 156,000 frames for a 60-minute episode
- Result stored as `energy_index[{ time_ms, rms }]` — one entry per frame
- Silence threshold set dynamically: `threshold = mean(energy_array) * 0.1` — adapts to any noise floor, whether studio-recorded or phone-quality audio

At cut time, Agent 6 does a simple array lookup — no librosa calls, no audio file access. Microseconds per query.

### 5.4 Cut Point Algorithm

Agent 6 resolves every cut boundary by querying the pre-built `energy_index` and `whisperx_words` — no audio file access at this stage.

**Start cut**
1. Take `start_ms` of the first word in the clip from `whisperx_words`
2. Query `energy_index` for all frames in the window `[start_ms - 500, start_ms]`
3. Filter frames where `rms < silence_threshold`
4. Pick the silent frame with the highest `time_ms` — closest to the word boundary
5. Check `whisperx_words` diarization — confirm no other speaker active at that frame
6. If silent frame found and speaker-safe → set as true `start_ms`
7. If not found → fall back to exact WhisperX word `start_ms`

**End cut**
1. Take `end_ms` of the last word in the clip from `whisperx_words`
2. Query `energy_index` for all frames in the window `[end_ms, end_ms + 500]`
3. Filter frames where `rms < silence_threshold`
4. Pick the silent frame with the lowest `time_ms` — closest to the word boundary
5. Check `whisperx_words` diarization — confirm no other speaker active at that frame
6. If silent frame found and speaker-safe → set as true `end_ms`
7. If not found → fall back to exact WhisperX word `end_ms`

**Crosstalk check**
After both cut points are set, verify neither boundary lands inside a speaker overlap. If two speaker IDs are active simultaneously at a cut point, shift to after the overlap clears.

**For stitched clips**
Run this algorithm independently on every chunk boundary — start and end of each chunk, not just the overall clip start and end.

---

## 6. LangGraph Orchestration

### 6.1 Why LangGraph

LangChain's base chain is linear. This pipeline requires:

- **Parallel fanout** — running the same agent on 40 segments simultaneously
- **Dynamic node count** — number of parallel threads depends on the transcript, not known ahead of time
- **Selective state passing** — each agent receives only what it needs, not the full transcript
- **Checkpointing** — if Agent 4 fails, restart from there without re-running Agents 1–3

LangGraph models the pipeline as a directed graph with nodes and edges. The `Send` API enables dynamic fanout — one thread per segment, spun up at runtime based on Agent 1's output count.

### 6.2 Concurrency Limits

Parallel calls across 40 segments simultaneously are fast but cause cost spikes. Apply a cap:

| Agent | Max parallel calls |
|---|---|
| Agent 2 — Tension Detector | 10 |
| Agent 3 — Knowledge Gap Scorer | 10 |
| Agent 5 — Hook Writer | 5 |
| Agent 6 — Audio Cut Finder | 10 (CPU-bound, not API-bound) |

### 6.3 State Schema

Each agent receives only the data it needs.

| Agent | Receives | Passes forward |
|---|---|---|
| Agent 1 | Raw transcript + audio file path | segments[] with word timestamps |
| Agent 2 | Single segment (text + timestamps) | flagged bool + tension type + annotation |
| Agent 3 | Flagged segment + tension annotation | Knowledge gap score + drop flag |
| Agent 4 | All surviving scored segments | Ranked clips with approximate timestamps |
| Agent 6 | Single clip timestamps + audio path | Precise start_ms + end_ms + crosstalk flag |
| Agent 5 | Single clip text + precise timestamps | Hook line |

---

## 7. Output Format

For each approved clip:

| Field | Type | Description |
|---|---|---|
| rank | integer | Position in ranked list — 1 is the best clip |
| label | string | hero / strong / decent |
| score | integer | Total checklist score out of 11 |
| must_haves | integer | Must-haves passed out of 5 |
| signals | integer | Quality signals passed out of 6 |
| tension_type | string | belief_vs_reality / before_vs_after / known_vs_unknown |
| knowledge_gap | integer | Score 1–3 from Agent 3 |
| start_ms | integer | Precise audio start in milliseconds |
| end_ms | integer | Precise audio end in milliseconds |
| duration_s | float | Clip duration in seconds |
| transcript | string | Exact spoken words within clip boundaries |
| hook_line | string | Ready-to-use hook line from Agent 5 |
| crosstalk_flagged | boolean | True if speaker overlap detected near a cut point |

**Summary line appended after all clips:**
```
Found N clips — X hero, X strong, X decent. Top pick: Clip 1 · [hook line]. Runtime: Xs.
```

---

## 8. Clip Stitching

### 8.1 What It Is

A stitched clip is two or more non-contiguous chunks from different parts of the episode, combined into a single clip because they make sense together. The speaker may have set up an idea at minute 12 and landed it at minute 47. Separately, neither chunk is a complete clip. Together, they are.

### 8.2 The Only Rule

If two or more chunks are semantically coherent when played back-to-back — a stranger watching the stitched result would not feel confused or jarred — they can be stitched. There is no hard limit on the number of chunks or how far apart they are in the episode.

The agent decides based on semantic coherence alone.

### 8.3 When Stitching Helps

- Setup at minute 10, payoff at minute 38, separated by unrelated conversation — stitch them
- Speaker makes a claim, digresses, then returns to prove it — keep the claim and the proof, drop the digression
- Two examples of the same idea, separated by filler — stitch them into one tight clip
- A question asked early in the episode, answered much later — stitch the Q and the A

### 8.4 When Stitching Hurts

- Two interesting but independent points that don't build on each other — keep as separate clips
- Stitching across a topic change just because both chunks scored well — they are two clips, not one
- The join would feel like a jump cut to a different conversation — don't stitch

### 8.5 How It Changes the Pipeline

Stitching is evaluated at the **Agent 4 — Clip Evaluator** stage, after individual candidates have been scored. Agent 4 looks across all surviving candidates and asks: do any of these belong together?

Stitched clips are scored as a single unit against the full checklist. The duration gate applies to the total combined length of all chunks.

Each stitched clip includes a `chunks` array in the output — each chunk with its own `start_ms` and `end_ms` from Agent 6. Agent 6 runs cut point refinement on every chunk boundary independently.

### 8.6 Output Fields for Stitched Clips

| Field | Type | Description |
|---|---|---|
| stitched | boolean | True if this clip is assembled from non-contiguous chunks |
| chunks | array | Each chunk: `{ start_ms, end_ms, transcript, crosstalk_flagged }` |
| total_duration_s | float | Sum of all chunk durations |

Non-stitched clips have `stitched: false` and a single-item `chunks` array.

---

## 9. Model Selection Summary

| Agent | Job type | Recommended | Fallback |
|---|---|---|---|
| Reader | Extraction | Gemini 3.1 Flash-Lite | GPT-5.4 Mini |
| Tension Detector | Nuanced judgment | GPT-5.5 | Claude Opus 4.6 |
| Knowledge Gap Scorer | Calibration | GPT-5.4 | Claude Sonnet 4.6 |
| Clip Evaluator | Structured scoring | GPT-5.4 Mini | Claude Haiku 4.5 |
| Hook Writer | Creative writing | GPT-5.5 | Claude Opus 4.7 |
| Audio Preprocessor | Index build (runs once) | WhisperX + librosa | — |
| Audio Cut Finder | Index lookup (per clip) | energy_index + whisperx_words | Exact WhisperX word timestamps |

---

## 10. Implementation Guidance

### 10.1 Observe Before You Enforce

Before applying any part of this pipeline to production, spend time observing the current implementation end to end. Do not replace or override existing behaviour until you understand what it is actually doing.

Specifically:

- **Run the current system on 3–5 real transcripts** — note what clips it surfaces, where it cuts, what it misses, and what it gets wrong
- **Compare current output against this spec** — for each agent's job, check whether the current implementation is doing something equivalent, something different, or nothing at all
- **Identify what is already working** — do not replace things that produce good output. Wrap or extend them instead.
- **Identify the biggest gaps first** — prioritise the differences that most affect clip quality, not the ones that are easiest to implement
- **Do not touch the audio cutting logic until you have validated the LLM agent outputs** — the energy index and cut point algorithm only matter if the right clips are being selected upstream

### 10.2 Suggested Observation Checklist

Before enforcing any new agent or logic, confirm you can answer these:

- What does the current system use as its clip selection signal? Is it keyword-based, energy-based, or LLM-scored?
- Does it currently do any form of tension detection or knowledge gap scoring — explicitly or implicitly?
- How does it currently determine clip boundaries — word timestamps, sentence boundaries, or fixed windows?
- Does it handle stitching of non-contiguous chunks at all?
- What does a low-scoring clip in the current system look like vs a high-scoring one?
- Where do editors most frequently override or reject what the current system surfaces?

### 10.3 Migration Order

Once observation is complete, enforce changes in this order — each stage should be stable before moving to the next:

1. Agent 1 — Reader (lowest risk, structural only)
2. Audio Preprocessor — energy index build (independent, no LLM)
3. Agent 3 — Knowledge Gap Scorer (additive filter, easy to validate)
4. Agent 4 — Clip Evaluator (replaces or wraps current scoring)
5. Agent 2 — Tension Detector (highest impact, validate thoroughly)
6. Agent 6 — Audio Cut Finder (replaces current cut logic last)
7. Agent 5 — Hook Writer (additive, does not affect clip selection)
