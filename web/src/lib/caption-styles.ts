import { PresetConfig, DEFAULT_HIGHLIGHT_STYLE } from "./types";

// The caption style catalog. Each style is either a custom-authored HyperFrames
// component (worker/captions/<component>.html — animated, Puppeteer-rendered) or
// a PIL-renderer look (component: null — static, burned in by worker subtitle.py).
//
// A style owns its animation + opinionated color defaults; the user customizes
// colors / size / position on top. Selecting a style resets colors to the
// style's defaults but keeps font size and Y position.
export interface CaptionStyle {
  id: string;
  name: string;
  component: string | null;   // hyperframes_component value; null = PIL renderer
  accent: string;             // default accent (pill fill / active word / box bg)
  text: string;               // default text color
  accentLabel: string;        // knob label — what "accent" means for this style
  /** Contrast between text and accent matters (text sits ON the accent surface). */
  accentIsSurface: boolean;
}

export const CAPTION_STYLES: CaptionStyle[] = [
  {
    id: "pill", name: "Pill", component: "pill",
    accent: "#ff1745", text: "#ffffff",
    accentLabel: "Pill color", accentIsSurface: true,
  },
  {
    id: "impact", name: "Impact", component: "impact",
    accent: "#ffdd00", text: "#ffffff",
    accentLabel: "Accent color", accentIsSurface: false,
  },
  {
    id: "beast", name: "Beast", component: "beast",
    accent: "#ffd900", text: "#ffffff",
    accentLabel: "Accent color", accentIsSurface: false,
  },
  {
    id: "karaoke", name: "Karaoke", component: "karaoke",
    accent: "#ff1745", text: "#ffffff",
    accentLabel: "Accent color", accentIsSurface: false,
  },
  {
    id: "clean", name: "Clean", component: null,
    accent: "#ffdd00", text: "#ffffff",
    accentLabel: "Highlight color", accentIsSurface: false,
  },
  {
    id: "box", name: "Box", component: null,
    accent: "#000000", text: "#ffffff",
    accentLabel: "Box color", accentIsSurface: true,
  },
];

export function getCaptionStyle(id: string): CaptionStyle {
  return CAPTION_STYLES.find(s => s.id === id) ?? CAPTION_STYLES[0];
}

/**
 * Apply a style to a config: sets the style identity + the style's default
 * colors, keeps the user's font size and vertical position.
 */
export function applyCaptionStyle(config: PresetConfig, style: CaptionStyle): PresetConfig {
  const next: PresetConfig = {
    ...config,
    style_id: style.id,
    hyperframes_component: style.component,
    highlight: {
      ...(config.highlight ?? DEFAULT_HIGHLIGHT_STYLE),
      fill_color: style.accent,
      font_color: style.text,
    },
  };
  if (!style.component) {
    // PIL renderer reads color.* — encode the style's look there.
    next.color = {
      ...config.color,
      text_color: style.text,
      highlight_color: style.id === "clean" ? style.accent : style.text,
      bg_color: style.id === "box" ? style.accent : config.color.bg_color,
      bg_opacity: style.id === "box" ? 0.65 : 0,
      stroke_width: style.id === "clean" ? 2 : 0,
      drop_shadow: style.id === "clean",
    };
  }
  return next;
}

/**
 * Give any stored config (old presets, last-export localStorage, previous
 * exports) a valid style identity. Legacy configs carry the registry component
 * name "caption-highlight" — or nothing at all, from the era when the pill was
 * hard-coded at export time — both mean pill.
 */
export function normalizeCaptionConfig(config: PresetConfig): PresetConfig {
  let id = config.style_id;
  if (!id || !CAPTION_STYLES.some(s => s.id === id)) {
    const comp = config.hyperframes_component;
    id = comp && CAPTION_STYLES.some(s => s.component === comp) ? comp : "pill";
  }
  const style = getCaptionStyle(id);
  if (config.style_id === style.id && config.hyperframes_component === style.component) return config;
  return { ...config, style_id: style.id, hyperframes_component: style.component };
}
