"""Tests for the bundled caption components + hyperframes patching.

Run: .venv/bin/python test_captions.py
"""

from pipeline.hyperframes import (
    CAPTIONS_DIR,
    HF_COMPONENTS,
    LEGACY_COMPONENTS,
    _build_cfg,
    _ensure_component,
    _patch_component,
)


SAMPLE_WORDS = [
    {"text": "hello", "start": 0.0, "end": 0.4},
    {"text": "world", "start": 0.4, "end": 0.9},
]
SAMPLE_GROUPS = [[0, 1]]
SAMPLE_PRESET = {
    "typography": {"font_size": 120, "all_caps": True},
    "color": {"stroke_color": "#111111"},
    "layout": {"vertical_percent": 65},
    "highlight": {
        "fill_color": "#00ff00",
        "font_color": "#fafafa",
        "border_radius": 6,
        "shadow_blur": 12,
    },
}


def test_every_style_has_a_component_file():
    for name in HF_COMPONENTS:
        path = CAPTIONS_DIR / f"{name}.html"
        assert path.exists(), f"missing component file: {path}"


def test_components_follow_injection_contract():
    for name in HF_COMPONENTS:
        html = (CAPTIONS_DIR / f"{name}.html").read_text()
        assert "var WORDS" in html, f"{name}: missing WORDS marker"
        assert "var RAW_GROUPS" in html, f"{name}: missing RAW_GROUPS marker"
        assert "var CFG" in html, f"{name}: missing CFG marker"
        assert 'data-duration="' in html, f"{name}: missing data-duration"
        assert 'data-width="' in html, f"{name}: missing data-width"
        assert 'data-height="' in html, f"{name}: missing data-height"
        assert "window.__timelines" in html, f"{name}: timeline not registered"
        assert "data-timeline-locked" in html, f"{name}: missing data-timeline-locked"


def test_ensure_component_resolves_and_maps_legacy():
    for name in HF_COMPONENTS:
        assert _ensure_component(name).name == f"{name}.html"
    # Old presets stored "caption-highlight" — must map to pill
    assert _ensure_component("caption-highlight").name == "pill.html"
    assert LEGACY_COMPONENTS["caption-highlight"] == "pill"
    try:
        _ensure_component("caption-does-not-exist")
        assert False, "unknown style should raise"
    except RuntimeError:
        pass


def test_build_cfg_maps_preset_fields():
    cfg = _build_cfg(SAMPLE_PRESET)
    assert cfg["accent"] == "#00ff00"
    assert cfg["text"] == "#fafafa"
    assert cfg["stroke"] == "#111111"
    assert cfg["fontScale"] == 1.2
    assert cfg["yPct"] == 65.0
    assert cfg["radius"] == 6
    assert cfg["glow"] == 12
    assert cfg["allCaps"] is True


def test_build_cfg_defaults():
    cfg = _build_cfg({})
    assert cfg["accent"] == "#ff1745"
    assert cfg["text"] == "#ffffff"
    assert cfg["fontScale"] == 1.0
    assert cfg["yPct"] == 80.0   # bottom default


def test_build_cfg_vertical_position_fallback():
    assert _build_cfg({"layout": {"vertical_position": "top"}})["yPct"] == 15.0
    assert _build_cfg({"layout": {"vertical_position": "middle"}})["yPct"] == 50.0


def test_patch_component_injects_everything():
    for name in HF_COMPONENTS:
        html = (CAPTIONS_DIR / f"{name}.html").read_text()
        patched = _patch_component(
            html, SAMPLE_WORDS, SAMPLE_GROUPS,
            duration=42.5, canvas_w=1080, canvas_h=1920,
            preset_config=SAMPLE_PRESET,
        )
        assert '"text":"hello"' in patched, f"{name}: WORDS not injected"
        assert "var RAW_GROUPS = [[0,1]];" in patched, f"{name}: RAW_GROUPS not injected"
        assert '"accent":"#00ff00"' in patched, f"{name}: CFG not injected"
        assert 'data-duration="42.50"' in patched, f"{name}: duration not patched"
        assert 'data-width="1080"' in patched, f"{name}: width not patched"
        assert 'data-height="1920"' in patched, f"{name}: height not patched"
        # Demo data must be fully replaced, not duplicated
        assert patched.count("var WORDS") == 1, f"{name}: WORDS duplicated"
        assert patched.count("var CFG") == 1, f"{name}: CFG duplicated"


if __name__ == "__main__":
    test_every_style_has_a_component_file()
    test_components_follow_injection_contract()
    test_ensure_component_resolves_and_maps_legacy()
    test_build_cfg_maps_preset_fields()
    test_build_cfg_defaults()
    test_build_cfg_vertical_position_fallback()
    test_patch_component_injects_everything()
    print("test_captions: all tests passed")
