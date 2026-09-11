import { describe, it, expect } from "vitest";
import {
  CAPTION_STYLES, getCaptionStyle, applyCaptionStyle, normalizeCaptionConfig,
} from "./caption-styles";
import { DEFAULT_PRESET_CONFIG, PresetConfig } from "./types";

describe("CAPTION_STYLES catalog", () => {
  it("has unique ids and names", () => {
    expect(new Set(CAPTION_STYLES.map(s => s.id)).size).toBe(CAPTION_STYLES.length);
    expect(new Set(CAPTION_STYLES.map(s => s.name)).size).toBe(CAPTION_STYLES.length);
  });

  it("HF styles use their id as the component name; PIL styles have none", () => {
    for (const s of CAPTION_STYLES) {
      if (s.component !== null) expect(s.component).toBe(s.id);
    }
    expect(getCaptionStyle("clean").component).toBeNull();
    expect(getCaptionStyle("box").component).toBeNull();
  });

  it("falls back to the first style for unknown ids", () => {
    expect(getCaptionStyle("nope").id).toBe(CAPTION_STYLES[0].id);
  });
});

describe("applyCaptionStyle", () => {
  it("sets the style identity and default colors, keeps size + position", () => {
    const base: PresetConfig = {
      ...DEFAULT_PRESET_CONFIG,
      typography: { ...DEFAULT_PRESET_CONFIG.typography, font_size: 150 },
      layout: { ...DEFAULT_PRESET_CONFIG.layout, vertical_percent: 42 },
    };
    const beast = applyCaptionStyle(base, getCaptionStyle("beast"));
    expect(beast.style_id).toBe("beast");
    expect(beast.hyperframes_component).toBe("beast");
    expect(beast.highlight?.fill_color).toBe(getCaptionStyle("beast").accent);
    expect(beast.typography.font_size).toBe(150);
    expect(beast.layout.vertical_percent).toBe(42);
  });

  it("encodes PIL looks into color.*", () => {
    const clean = applyCaptionStyle(DEFAULT_PRESET_CONFIG, getCaptionStyle("clean"));
    expect(clean.hyperframes_component).toBeNull();
    expect(clean.color.stroke_width).toBe(2);
    expect(clean.color.bg_opacity).toBe(0);
    expect(clean.color.highlight_color).toBe(getCaptionStyle("clean").accent);

    const box = applyCaptionStyle(DEFAULT_PRESET_CONFIG, getCaptionStyle("box"));
    expect(box.hyperframes_component).toBeNull();
    expect(box.color.bg_opacity).toBeGreaterThan(0);
    expect(box.color.bg_color).toBe(getCaptionStyle("box").accent);
    // Box has no karaoke tint — active word matches the text color
    expect(box.color.highlight_color).toBe(box.color.text_color);
  });
});

describe("normalizeCaptionConfig", () => {
  it("maps the legacy registry component name to pill", () => {
    const legacy = { ...DEFAULT_PRESET_CONFIG, style_id: undefined, hyperframes_component: "caption-highlight" };
    const n = normalizeCaptionConfig(legacy);
    expect(n.style_id).toBe("pill");
    expect(n.hyperframes_component).toBe("pill");
  });

  it("defaults configs with no component (pre-style era) to pill", () => {
    const old = { ...DEFAULT_PRESET_CONFIG, style_id: undefined, hyperframes_component: undefined };
    expect(normalizeCaptionConfig(old).style_id).toBe("pill");
  });

  it("repairs an unknown style_id", () => {
    const bad = { ...DEFAULT_PRESET_CONFIG, style_id: "sparkles", hyperframes_component: "karaoke" };
    const n = normalizeCaptionConfig(bad);
    expect(n.style_id).toBe("karaoke");
    expect(n.hyperframes_component).toBe("karaoke");
  });

  it("keeps a valid config untouched (same reference)", () => {
    const ok = { ...DEFAULT_PRESET_CONFIG, style_id: "impact", hyperframes_component: "impact" };
    expect(normalizeCaptionConfig(ok)).toBe(ok);
  });

  it("preserves user colors while fixing identity", () => {
    const legacy = {
      ...DEFAULT_PRESET_CONFIG,
      style_id: undefined,
      hyperframes_component: "caption-highlight",
      highlight: { fill_color: "#123456", font_color: "#abcdef", shadow_blur: 5, border_radius: 3, letter_spacing: 0.01 },
    };
    const n = normalizeCaptionConfig(legacy);
    expect(n.highlight?.fill_color).toBe("#123456");
    expect(n.highlight?.font_color).toBe("#abcdef");
  });
});
