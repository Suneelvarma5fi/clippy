"""
identify_clips job — the agent clip pipeline:
Feature Enrichment → Moment Scout ∥ → Clip Crafter ∥ → Comparative Ranker
→ Audio Cut Finder → Hook Writer ∥
"""

from __future__ import annotations
import asyncio
import logging
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

import httpx

from config import OPENROUTER_API_KEY
from pipeline.sentencize    import sentencize
from pipeline.features      import enrich_sentences, infer_roles
from pipeline.scout         import scout_moments
from pipeline.crafter       import craft_clips
from pipeline.ranker        import rank_clips
from pipeline.cut_finder    import find_cut_points
from pipeline.hook_writer   import write_hooks
from pipeline.energy_index  import build_energy_index
from pipeline.clip_thumbnail import extract_clip_thumbnail, extract_portrait_preview
from jobs.common import _build_diar_timeline
from storage.r2 import download_file, public_url, upload_bytes, delete_keys
from db.supabase import (
    update_job, finish_job, update_video, get_video, get_transcript,
    insert_clips, get_exports_for_video, delete_jobs_for_exports,
    get_clip_ids_for_video, delete_clips_by_ids, get_max_clip_generation,
    update_clip_thumbnail,
)

log = logging.getLogger(__name__)


async def handle_identify_clips(job: dict) -> None:
    """
    Run the agent clip pipeline.
    payload: {"video_id", "preferences": {...}, "niche_profile"?: {...}}
    """
    payload       = job["payload"]
    video_id      = payload["video_id"]
    preferences   = payload.get("preferences", {})
    niche_profile = payload.get("niche_profile")  # Stage 2: audience config
    keep_existing = bool(payload.get("keep_existing"))  # keep old clips as a previous generation
    job_id        = job["id"]
    t0            = time.monotonic()

    update_job(job_id, status="processing", started_at=datetime.utcnow().isoformat())

    try:
        transcript = get_transcript(video_id)
        if not transcript:
            raise RuntimeError("No transcript found — transcribe first")

        raw_words = transcript["raw_words"]
        video     = get_video(video_id)
        audio_url = public_url(video["audio_r2_key"]) if video.get("audio_r2_key") else None

        # Merge niche profile into preferences if provided
        if niche_profile:
            preferences = {
                **preferences,
                "min_duration_seconds": niche_profile.get("clip_duration_min", preferences.get("min_duration_seconds", 30)),
                "max_duration_seconds": niche_profile.get("clip_duration_max", preferences.get("max_duration_seconds", 90)),
                "target_tones":         niche_profile.get("preferred_tones", preferences.get("target_tones", [])),
                "audience":             niche_profile.get("audience", ""),
                "niche":                niche_profile.get("niche", ""),
                "hook_style":           niche_profile.get("hook_style", ""),
            }

        # Step 1: Sentencize
        sentences = sentencize(raw_words)
        log.info("Sentencize: %d sentences from video %s", len(sentences), video_id)

        if not sentences:
            finish_job(job_id, status="done", finished_at=datetime.utcnow().isoformat(),
                       result={"clips": [], "warning": "empty_transcript"})
            return

        diar_timeline = _build_diar_timeline(transcript)

        # Audio Preprocessor — runs once, concurrent with the Reader LLM call.
        # Failure is non-fatal: cut finder falls back to exact word timestamps.
        # Streamed to disk and decoded incrementally so multi-hour audio never
        # sits in RAM (a 10h WAV is ~1.2 GB, ~2.3 GB once decoded to float32).
        async def _prefetch_and_index(url: str):
            tmp_path = tempfile.mktemp(suffix=".audio")
            try:
                async with httpx.AsyncClient(timeout=300.0) as c:
                    async with c.stream("GET", url) as r:
                        r.raise_for_status()
                        with open(tmp_path, "wb") as f:
                            async for chunk in r.aiter_bytes(1 << 20):
                                f.write(chunk)
                return await asyncio.to_thread(build_energy_index, tmp_path)
            except Exception as e:
                log.warning("Energy index build failed — word-timestamp fallback: %s", e)
                return None
            finally:
                Path(tmp_path).unlink(missing_ok=True)

        index_task = asyncio.create_task(_prefetch_and_index(audio_url)) if audio_url else None

        # The index is awaited BEFORE scouting (not just before cut finding):
        # scout/crafter prompts embed acoustic annotations ([laughter],
        # [energy spike], …) computed from it. Without audio the pipeline
        # still runs, only text/speaker features apply.
        energy_index = await index_task if index_task else None

        # Stage 0 — deterministic acoustic + speaker features (no LLM)
        feats = enrich_sentences(sentences, diar_timeline, energy_index)
        roles = infer_roles(sentences, feats)

        # Stage 1 — Moment Scout: archetype candidates per ~20-min chunk
        scout_context = {
            "title":        video.get("title") or "",
            "niche":        preferences.get("niche", ""),
            "audience":     preferences.get("audience", ""),
            "target_tones": preferences.get("target_tones") or [],
        }
        candidates = await scout_moments(
            sentences, feats, roles, OPENROUTER_API_KEY, scout_context,
        )

        # Stage 2 — Clip Crafter: exact boundaries in play order (hook
        # transplant may put the payoff cut first), checklist, duration gate
        crafted = await craft_clips(
            candidates, sentences, feats, roles, OPENROUTER_API_KEY,
            min_duration_s=preferences.get("min_duration_seconds"),
            max_duration_s=preferences.get("max_duration_seconds"),
        )

        # Stage 3 — Comparative Ranker: side-by-side ordering + overlap
        # dedup, archetype diversity, and the user's max_clips cap
        max_clips = int(preferences.get("max_clips") or 10)
        ranked = await rank_clips(
            crafted, OPENROUTER_API_KEY, scout_context["target_tones"], max_clips,
        )

        # Audio Cut Finder: pure index lookups per chunk boundary
        refined = [find_cut_points(c, energy_index, diar_timeline) for c in ranked]

        # Hook Writer (parallel fanout, capped)
        refined = await write_hooks(refined, OPENROUTER_API_KEY, preferences.get("hook_style", ""))

        # Persist clips to Supabase — ordered by rank, so row 0 is the top pick
        now = datetime.utcnow().isoformat()
        clip_rows = [
            {
                "id":                str(uuid.uuid4()),
                "video_id":          video_id,
                "user_id":           job["user_id"],
                "hook":              c.get("hook_line", ""),
                "text":              c.get("text", ""),
                "cuts":              c.get("cuts", c.get("cuts_raw", [])),
                "duration_sec":      c.get("duration_sec"),
                "score":             round(c["score_total"] / 11, 3),  # normalized for existing UI
                "tone":              c.get("archetype"),  # free-text column; UI has fallback styling
                "sentence_groups":   c.get("sentence_groups"),
                "reasoning":         c.get("reasoning"),
                "label":             c.get("label"),
                "must_haves":        c.get("must_haves"),
                "signals":           c.get("signals"),
                "score_total":       c.get("score_total"),
                "stitched":          c.get("stitched", False),
                "chunks":            c.get("chunks", []),
                "crosstalk_flagged": c.get("crosstalk_flagged", False),
                "source":            "ai",
                "created_at":        now,
                "updated_at":        now,
            }
            for c in refined
        ]

        if keep_existing:
            # Keep old clips + exports as a previous generation
            generation = get_max_clip_generation(video_id) + 1
            old_clip_ids: list[str] = []
            log.info("Keeping existing clips for video %s — new generation %d", video_id, generation)
        else:
            generation = 1
            old_clip_ids = get_clip_ids_for_video(video_id)

        for row in clip_rows:
            row["generation"] = generation
        saved_clips = insert_clips(clip_rows) if clip_rows else []

        # ── Delete replaced clips only AFTER the new ones are safely saved ────
        # so a failed insert never loses existing clips. Jobs have no FK to
        # exports, so orphaned rows must be removed manually; R2 files for old
        # exports are also deleted to reclaim storage (clip delete cascades to
        # export rows).
        if old_clip_ids:
            try:
                # New clips have no exports yet, so this is old-clip exports only
                old_exports = get_exports_for_video(video_id)
                if old_exports:
                    old_export_ids  = [e["id"]     for e in old_exports]
                    old_r2_keys     = [e["r2_key"] for e in old_exports if e.get("r2_key")]
                    delete_jobs_for_exports(old_export_ids)
                    delete_keys(old_r2_keys)
                    log.info(
                        "Re-run cleanup: deleted %d export jobs + %d R2 files for video %s",
                        len(old_export_ids), len(old_r2_keys), video_id,
                    )
                delete_clips_by_ids(old_clip_ids)
            except Exception as cleanup_err:
                log.warning("Re-run cleanup failed (non-fatal): %s", cleanup_err)

        # ── Face thumbnail extraction ─────────────────────────────────────────
        # Download source video once, scan each clip's first cut for the best
        # face frame, upload as a JPEG thumbnail, and update the clip row.
        source_r2_key = video.get("source_r2_key")
        if source_r2_key and saved_clips:
            source_local_thumb = tempfile.mktemp(suffix=".mp4")
            try:
                log.info("Downloading source for thumbnail extraction: %s", source_r2_key)
                download_file(source_r2_key, source_local_thumb)
                for saved, row in zip(saved_clips, clip_rows):
                    try:
                        cuts = row.get("cuts") or []
                        if not cuts:
                            continue
                        thumb = extract_clip_thumbnail(
                            source_local_thumb,
                            float(cuts[0]["start"]),
                            float(cuts[0]["end"]),
                        )
                        if thumb:
                            r2_key  = f"thumbnails/{saved['id']}.jpg"
                            upload_bytes(thumb, r2_key, content_type="image/jpeg")
                            update_clip_thumbnail(saved["id"], public_url(r2_key))
                    except Exception as thumb_err:
                        log.warning("Thumbnail failed for clip %s: %s", saved.get("id"), thumb_err)
            except Exception as dl_err:
                log.warning("Source download for thumbnails failed: %s", dl_err)
            finally:
                Path(source_local_thumb).unlink(missing_ok=True)

        # ── Portrait preview frame ────────────────────────────────────────────
        # Pick the highest-scoring clip (first after score-sort), extract a
        # face-centred 9:16 JPEG, and store it on the video row so the web UI
        # can display it in the frame designer without triggering a full export.
        if source_r2_key and saved_clips:
            source_local_preview = tempfile.mktemp(suffix=".mp4")
            try:
                download_file(source_r2_key, source_local_preview)
                best_clip_cuts = clip_rows[0].get("cuts") or []
                if best_clip_cuts:
                    preview_bytes = extract_portrait_preview(
                        source_local_preview,
                        float(best_clip_cuts[0]["start"]),
                        float(best_clip_cuts[0]["end"]),
                    )
                    if preview_bytes:
                        preview_r2_key = f"previews/{video_id}/portrait_preview.jpg"
                        upload_bytes(preview_bytes, preview_r2_key, content_type="image/jpeg")
                        update_video(video_id, portrait_preview_url=public_url(preview_r2_key))
                        log.info("Portrait preview uploaded for video %s", video_id)
            except Exception as preview_err:
                log.warning("Portrait preview failed (non-fatal): %s", preview_err)
            finally:
                Path(source_local_preview).unlink(missing_ok=True)

        update_video(video_id, status="ready")

        # Summary line (spec §7)
        runtime = time.monotonic() - t0
        label_counts = {"hero": 0, "strong": 0, "decent": 0}
        for c in refined:
            label_counts[c["label"]] += 1
        summary = (
            f"Found {len(refined)} clips — {label_counts['hero']} hero, "
            f"{label_counts['strong']} strong, {label_counts['decent']} decent."
            + (f" Top pick: Clip 1 · {refined[0]['hook_line']}." if refined else "")
            + f" Runtime: {runtime:.0f}s."
        )
        finish_job(
            job_id,
            status="done",
            finished_at=now,
            result={
                "clip_count":           len(saved_clips),
                "summary":              summary,
                "energy_index_applied": energy_index is not None,
            },
        )
        log.info("Clip identification done: %s", summary)

    except Exception as e:
        log.exception("Clip identification failed for job %s", job_id)
        finish_job(job_id, status="error", error_msg=str(e), finished_at=datetime.utcnow().isoformat())
        update_video(video_id, status="error", error_msg=str(e))
        raise
