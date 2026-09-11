"""Tests for the startup orphaned-job reaper."""

import db.supabase as sb


def _run_reaper_with(jobs):
    """Run reap_orphaned_jobs against fake job rows, capturing all writes."""
    rec = {"job": [], "video": [], "export": [], "edit": []}
    orig = (sb.get_reapable_jobs, sb.finish_job, sb.update_video, sb.update_export, sb.update_clip_edit)
    sb.get_reapable_jobs = lambda: jobs
    sb.finish_job      = lambda jid, **f: rec["job"].append((jid, f))
    sb.update_video    = lambda vid, **f: rec["video"].append((vid, f))
    sb.update_export   = lambda eid, **f: rec["export"].append((eid, f))
    sb.update_clip_edit = lambda eid, **f: rec["edit"].append((eid, f))
    try:
        n = sb.reap_orphaned_jobs()
    finally:
        sb.get_reapable_jobs, sb.finish_job, sb.update_video, sb.update_export, sb.update_clip_edit = orig
    return n, rec


def test_reaps_and_maps_each_entity():
    jobs = [
        {"id": "j1", "type": "transcribe",     "payload": {"video_id": "v1"}, "entity_id": "v1"},
        {"id": "j2", "type": "identify_clips", "payload": {"video_id": "v2"}, "entity_id": "v2"},
        {"id": "j3", "type": "export_clip",    "payload": {"export_id": "e3"}, "entity_id": "e3"},
        {"id": "j4", "type": "export_clip",    "payload": {},                  "entity_id": "e4"},
    ]
    n, rec = _run_reaper_with(jobs)

    assert n == 4
    # every job marked error
    assert {jid for jid, _ in rec["job"]} == {"j1", "j2", "j3", "j4"}
    assert all(f["status"] == "error" for _, f in rec["job"])
    # transcribe + identify map to their video
    assert {vid for vid, _ in rec["video"]} == {"v1", "v2"}
    assert all(f["status"] == "error" for _, f in rec["video"])
    # export jobs map to their export (entity_id fallback when payload lacks it)
    assert {eid for eid, _ in rec["export"]} == {"e3", "e4"}


def test_reaps_queued_style_and_edit_orphans():
    # A 'queued' style_clip / edit_clip left behind by a worker restart (or a
    # failed trigger) is orphaned just like a 'processing' one — reap it so the
    # export doesn't stay pinned at 90% forever.
    jobs = [
        {"id": "j5", "type": "style_clip", "status": "queued",
         "payload": {"export_id": "e5", "edit_id": "ed5"}, "entity_id": "e5"},
        {"id": "j6", "type": "edit_clip",  "status": "queued",
         "payload": {"export_id": "e6", "edit_id": "ed6"}, "entity_id": "e6"},
    ]
    n, rec = _run_reaper_with(jobs)

    assert n == 2
    assert {jid for jid, _ in rec["job"]} == {"j5", "j6"}
    # both surface the failure on their export
    assert {eid for eid, _ in rec["export"]} == {"e5", "e6"}
    assert all(f["status"] == "error" for _, f in rec["export"])
    # edit_clip also marks its clip_edit row errored
    assert {eid for eid, _ in rec["edit"]} == {"ed6"}


def test_no_orphans_is_noop():
    n, rec = _run_reaper_with([])
    assert n == 0
    assert rec == {"job": [], "video": [], "export": [], "edit": []}


if __name__ == "__main__":
    test_reaps_and_maps_each_entity()
    test_reaps_queued_style_and_edit_orphans()
    test_no_orphans_is_noop()
    print("ok")
