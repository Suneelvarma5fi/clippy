"""
Unit tests for the persisted clip-analysis artifact (analysis_ref).

Covers the two pure helpers added to the portrait pipeline:
  - _slim_records : drop face embeddings, keep geometry + speaker fields
  - _write_analysis : serialize the per-frame scan with a coord-space label

Run: .venv/bin/python test_clip_analysis.py
"""

import json
import tempfile
from pathlib import Path

from pipeline.portrait import _slim_records, _write_analysis, ANALYSIS_VERSION, SCAN_FPS


def _sample_records():
    return [
        {
            "t": 0.0,
            "active_speaker": "SPEAKER_00",
            "overlap": False,
            "faces": [
                {
                    "bbox": [100, 50, 300, 400],
                    "embedding": [0.1] * 512,   # heavy — must be dropped
                    "cx": 200, "cy": 225, "fw": 200, "fh": 350,
                },
            ],
        },
        {
            "t": 0.25,
            "active_speaker": None,
            "overlap": True,
            "faces": [],
        },
    ]


def test_slim_drops_embeddings_keeps_geometry():
    slim = _slim_records(_sample_records())
    assert len(slim) == 2
    face = slim[0]["faces"][0]
    assert "embedding" not in face, "embedding must be stripped from the artifact"
    assert face == {"bbox": [100, 50, 300, 400], "cx": 200, "cy": 225, "fw": 200, "fh": 350,
                    "mouth": None, "talk": None}   # mouth fields ride along (None when unscanned)
    # speaker/overlap/time fields preserved
    assert slim[0]["active_speaker"] == "SPEAKER_00"
    assert slim[0]["overlap"] is False
    assert slim[1]["active_speaker"] is None
    assert slim[1]["overlap"] is True
    assert slim[1]["faces"] == []
    print("ok: _slim_records strips embeddings, preserves geometry + speaker fields")


def test_slim_rounds_time():
    recs = [{"t": 0.333333, "active_speaker": None, "overlap": False, "faces": []}]
    assert _slim_records(recs)[0]["t"] == 0.333
    print("ok: _slim_records rounds frame time to ms")


def test_write_analysis_shape_and_coord_label():
    slim = _slim_records(_sample_records())
    reframe = [{"start": 0.0, "end": 5.0, "mode": "single", "crop": {"x": 420, "y": 0, "w": 1080, "h": 1080}}]
    path = tempfile.mktemp(suffix=".json")
    try:
        _write_analysis(path, slim, reframe, fps=30.0, src_w=1920, src_h=1080)
        data = json.loads(Path(path).read_text())
    finally:
        Path(path).unlink(missing_ok=True)

    assert data["version"] == ANALYSIS_VERSION
    # decision #2: coords are stitched-clip space, NOT source — must be labelled
    assert data["coord_space"] == "stitched_landscape_px"
    assert data["dims"] == [1920, 1080]
    assert data["fps"] == 30.0
    assert data["scan_fps"] == SCAN_FPS
    assert data["frames"] == slim, "artifact frames must equal the slim records"
    # decision #2 second hop: crop timeline (stitched->output) travels with the artifact
    assert data["reframe_timeline"] == reframe
    print("ok: _write_analysis writes versioned, coord-labelled artifact + reframe timeline")


def test_write_analysis_bad_path_is_non_fatal():
    # A render must still ship if the artifact can't be written.
    _write_analysis("/nonexistent_dir_xyz/analysis.json", [], [], fps=30.0, src_w=10, src_h=10)
    print("ok: _write_analysis swallows write failures (non-fatal)")


if __name__ == "__main__":
    test_slim_drops_embeddings_keeps_geometry()
    test_slim_rounds_time()
    test_write_analysis_shape_and_coord_label()
    test_write_analysis_bad_path_is_non_fatal()
    print("\nAll clip-analysis tests passed.")
