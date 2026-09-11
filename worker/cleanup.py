"""
Daily storage cleanup — wipes all video/clip/export data from both
Supabase and Cloudflare R2.

Preserves: presets, user_profiles  (user config — never deleted)
Deletes  : videos → cascades to transcripts, clips, exports
           collections, clip_series, jobs  (cleared separately)
           all objects in the R2 bucket

Activated by DAILY_CLEANUP_ENABLED=true in worker/.env.
Runs once per day at midnight UTC.
"""

from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from db.supabase import get_db

log = logging.getLogger(__name__)

# Tables deleted in order (videos CASCADE handles transcripts/clips/exports)
_SUPABASE_TABLES = [
    "exports",       # delete first to satisfy any FK not covered by CASCADE
    "clips",
    "transcripts",
    "videos",        # CASCADE → transcripts, clips, exports (belt-and-suspenders above)
    "collections",
    "clip_series",
    "jobs",
]


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def clear_supabase() -> dict[str, int]:
    """Delete all rows from data tables. Returns row counts per table."""
    db = get_db()
    counts: dict[str, int] = {}
    for table in _SUPABASE_TABLES:
        try:
            # Supabase postgrest requires a filter — match all rows via epoch
            col = "queued_at" if table == "jobs" else "created_at"
            res = db.table(table).delete().gt(col, "2000-01-01").execute()
            counts[table] = len(res.data) if res.data else 0
            log.info("Cleanup Supabase: deleted %d rows from %s", counts[table], table)
        except Exception as exc:
            log.error("Cleanup Supabase: failed on %s — %s", table, exc)
            counts[table] = -1
    return counts


def clear_r2() -> int:
    """Delete every object in the R2 bucket. Returns total count deleted."""
    bucket = os.environ["R2_BUCKET"]
    s3     = _r2_client()
    total  = 0

    try:
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket):
            objects = page.get("Contents", [])
            if not objects:
                continue
            keys = [{"Key": obj["Key"]} for obj in objects]
            s3.delete_objects(Bucket=bucket, Delete={"Objects": keys})
            total += len(keys)
            log.info("Cleanup R2: deleted %d objects (running total %d)", len(keys), total)
    except (BotoCoreError, ClientError) as exc:
        log.error("Cleanup R2: error — %s", exc)

    return total


async def run_cleanup() -> None:
    """Run the full cleanup in a thread pool so it doesn't block the event loop."""
    log.info("=== Daily cleanup starting ===")
    loop = asyncio.get_event_loop()

    sb_counts = await loop.run_in_executor(None, clear_supabase)
    r2_total  = await loop.run_in_executor(None, clear_r2)

    log.info(
        "=== Daily cleanup complete — Supabase: %s | R2: %d objects deleted ===",
        sb_counts,
        r2_total,
    )


async def schedule_daily_cleanup() -> None:
    """
    Wait until the next midnight UTC, then run cleanup every 24 hours.
    Call this from your FastAPI startup event as an asyncio task.
    """
    now     = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    wait_secs = (midnight - now).total_seconds()

    log.info(
        "Daily cleanup scheduled: first run in %.0f s at %s UTC",
        wait_secs,
        midnight.strftime("%Y-%m-%d %H:%M"),
    )
    await asyncio.sleep(wait_secs)

    while True:
        try:
            await run_cleanup()
        except Exception as exc:
            log.error("Daily cleanup loop error: %s", exc)
        await asyncio.sleep(24 * 60 * 60)
