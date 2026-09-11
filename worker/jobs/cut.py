"""cut_clip job — plain ffmpeg cut of a clip, uploaded to R2 (no face tracking)."""

from __future__ import annotations
import asyncio
import logging
import tempfile
from datetime import datetime
from pathlib import Path

from sources import ensure_source
from pipeline.clip_cut import cut_clip
from storage.r2 import upload_file, public_url
from db.supabase import update_job, finish_job, get_video, get_clip

log = logging.getLogger(__name__)


async def handle_cut_clip(job: dict) -> None:
    """
    Cut a clip from source video, upload raw cut to R2.
    payload: {"clip_id", "video_id"}
    """
    payload  = job["payload"]
    clip_id  = payload["clip_id"]
    video_id = payload["video_id"]
    job_id   = job["id"]

    update_job(job_id, status="processing", started_at=datetime.utcnow().isoformat())

    source_local = None
    output_local = None
    try:
        clip  = get_clip(clip_id)
        video = get_video(video_id)
        cuts  = clip["cuts"]

        source_local, _ = await ensure_source(video_id, video["youtube_url"])

        output_local = tempfile.mktemp(suffix=".mp4")
        await asyncio.to_thread(cut_clip, source_local, cuts, output_local)

        r2_key = f"cuts/{clip_id}/cut.mp4"
        await asyncio.to_thread(upload_file, output_local, r2_key, "video/mp4")
        clip_url = public_url(r2_key)

        finish_job(
            job_id, status="done",
            finished_at=datetime.utcnow().isoformat(),
            result={"r2_key": r2_key, "url": clip_url},
        )
        log.info("Clip cut done: %s", clip_id)

    except Exception as e:
        log.exception("Cut clip failed for job %s", job_id)
        finish_job(job_id, status="error", error_msg=str(e), finished_at=datetime.utcnow().isoformat())
        raise
    finally:
        for p in [source_local, output_local]:
            if p:
                Path(p).unlink(missing_ok=True)
