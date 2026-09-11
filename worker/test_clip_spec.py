"""
Unit tests for ClipSpec v1 (pipeline.clip_spec.build_clip_spec).

Verifies the locked modeling decisions:
  - cuts preserved in play order (non-chronological) — decision #1
  - coordinates normalized 0-100 -> 0-1 against the output frame
  - analysis_ref / cache_ref pulled from the cached edit
  - declarative layers keyed by component_id; NO audio bed layer (decision #4)

Run: .venv/bin/python test_clip_spec.py
"""

from pipeline.clip_spec import build_clip_spec, SPEC_VERSION


def _edit():
    return {"r2_key": "clip_edits/e1/portrait.mp4", "analysis_r2_key": "clip_edits/e1/analysis.json"}


def test_cuts_play_order_preserved():
    # Hook transplant: payoff cut plays first, then the earlier setup cut.
    cuts = [{"start": 90.0, "end": 95.0}, {"start": 10.0, "end": 18.0}]
    spec = build_clip_spec(
        video_id="v1", clip={"cuts": cuts}, edit=_edit(),
        aspect_ratio="9:16", preset_config=None,
    )
    assert spec["cuts"] == cuts, "cuts must be preserved verbatim in play order"
    assert spec["version"] == SPEC_VERSION
    print("ok: cuts preserved in play order (non-chronological)")


def test_output_dims_by_aspect():
    for aspect, dims in [("9:16", (1080, 1920)), ("16:9", (1920, 1080)),
                         ("1:1", (1080, 1080)), ("4:5", (1080, 1350))]:
        spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=None,
                               aspect_ratio=aspect, preset_config=None)
        assert (spec["output"]["w"], spec["output"]["h"]) == dims, aspect
        assert spec["output"]["aspect"] == aspect
    # unknown / missing aspect falls back to 9:16
    spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=None,
                           aspect_ratio=None, preset_config=None)
    assert spec["output"] == {"w": 1080, "h": 1920, "aspect": "9:16"}
    print("ok: output dims resolved by aspect ratio with 9:16 fallback")


def test_refs_from_edit():
    spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=_edit(),
                           aspect_ratio="9:16", preset_config=None)
    assert spec["analysis_ref"] == "clip_edits/e1/analysis.json"
    assert spec["edit"]["cache_ref"] == "clip_edits/e1/portrait.mp4"
    assert spec["edit"]["reframe"]["mode"] == "auto"
    # missing edit -> null refs, no crash
    spec2 = build_clip_spec(video_id="v", clip={"cuts": []}, edit=None,
                            aspect_ratio="9:16", preset_config=None)
    assert spec2["analysis_ref"] is None
    assert spec2["edit"]["cache_ref"] is None
    print("ok: analysis_ref / cache_ref pulled from edit (null-safe)")


def test_caption_layer_coords_normalized():
    preset = {
        "hyperframes_component": "caption.karaoke.v1",
        "layout": {"vertical_position": "bottom", "vertical_percent": 80},
        "typography": {"font": "Inter", "size": 64},
    }
    spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=_edit(),
                           aspect_ratio="9:16", preset_config=preset)
    cap = spec["style"]["layers"][0]
    assert cap["type"] == "captions"
    assert cap["component_id"] == "caption.karaoke.v1"
    assert cap["words_ref"] == "transcript:raw_words"
    assert cap["position"] == {"anchor": "bottom", "y": 0.8}, "80% -> 0.8"
    assert cap["props"] == {"font": "Inter", "size": 64}
    assert spec["style"]["render"]["engine"] == "hyperframes"
    print("ok: caption layer normalizes vertical_percent 80 -> 0.8")


def test_sticker_layer():
    spec = build_clip_spec(
        video_id="v", clip={"cuts": []}, edit=_edit(), aspect_ratio="9:16",
        preset_config={},  # empty preset -> no caption layer
        text_sticker_config={"text": "WAIT FOR IT", "x_pct": 12, "y_pct": 8, "size_pct": 10, "scale": 1.5},
    )
    types = [l["type"] for l in spec["style"]["layers"]]
    assert types == ["text_sticker"], types
    st = spec["style"]["layers"][0]
    assert st["position"] == {"x": 0.12, "y": 0.08}
    assert st["props"] == {"size": 0.1, "scale": 1.5}
    print("ok: sticker layer built with normalized coords")


def test_sticker_text_truncated_to_30():
    long = "x" * 50
    spec = build_clip_spec(
        video_id="v", clip={"cuts": []}, edit=_edit(), aspect_ratio="9:16",
        preset_config={}, text_sticker_config={"text": long, "x_pct": 50, "y_pct": 50},
    )
    assert spec["style"]["layers"][0]["text"] == "x" * 30, "sticker text capped at 30 chars"
    print("ok: sticker text truncated to 30 chars")


def test_empty_sticker_text_skipped():
    spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=_edit(),
                           aspect_ratio="9:16", preset_config={},
                           text_sticker_config={"text": "   "})
    assert spec["style"]["layers"] == [], "blank sticker text adds no layer"
    print("ok: blank sticker text produces no layer")


def test_branding_badge_and_no_atmosphere():
    preset = {"layout": {}, "typography": {}}
    spec = build_clip_spec(video_id="v", clip={"cuts": []}, edit=_edit(),
                           aspect_ratio="9:16", preset_config=preset,
                           branding_watermark=True)
    types = [l["type"] for l in spec["style"]["layers"]]
    # captions (empty layout still emits), branding watermark
    assert any(l.get("component_id") == "brand.badge.v1" for l in spec["style"]["layers"])
    # atmosphere is retired — never written to the spec
    assert "atmosphere" not in spec["style"]
    # decision #4: no audio bed layer anywhere
    assert "audio" not in types
    print("ok: branding badge present; atmosphere retired; no audio bed layer")


if __name__ == "__main__":
    test_cuts_play_order_preserved()
    test_output_dims_by_aspect()
    test_refs_from_edit()
    test_caption_layer_coords_normalized()
    test_sticker_layer()
    test_sticker_text_truncated_to_30()
    test_empty_sticker_text_skipped()
    test_branding_badge_and_no_atmosphere()
    print("\nAll ClipSpec tests passed.")
