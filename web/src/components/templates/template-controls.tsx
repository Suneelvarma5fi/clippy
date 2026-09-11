"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pipette } from "lucide-react";
import { PresetConfig, DEFAULT_HIGHLIGHT_STYLE } from "@/lib/types";
import { getCaptionStyle } from "@/lib/caption-styles";
import { POSITION_MIN, POSITION_MAX, nudge } from "@/lib/editor-bounds";
import { Saturation, Hue, hexToHsva, hsvaToHex } from "@uiw/react-color";

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Words shown in the caption-style preview. Uses the first few words of the clip's
// transcript so the preview reflects the real output; falls back to filler when the
// transcript isn't available yet.
const PLACEHOLDER_WORDS = ["GREAT", "CONTENT", "STARTS"];
export function captionPreviewWords(text?: string | null): string[] {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return words.length ? words : PLACEHOLDER_WORDS;
}

export function CaptionOverlay({ config, previewWidth = 270, text, editable = false, containerRef, onMoveY, onDragStateChange }: {
  config: PresetConfig;
  previewWidth?: number;
  /** First transcript line of the clip, used as representative preview text. */
  text?: string | null;
  /** When set, the caption block can be dragged vertically within `containerRef`. */
  editable?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  onMoveY?: (pct: number) => void;
  /** Fired while a drag is in progress so the host can show guides. */
  onDragStateChange?: (active: boolean) => void;
}) {
  const dragging = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const setDrag = (v: boolean) => { dragging.current = v; setDragActive(v); onDragStateChange?.(v); };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || !containerRef?.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).focus();
    setDrag(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !containerRef?.current) return;
    const r = containerRef.current.getBoundingClientRect();
    onMoveY?.(Math.max(POSITION_MIN, Math.min(POSITION_MAX, ((e.clientY - r.top) / r.height) * 100)));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setDrag(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const pos = config.layout.vertical_position ?? "bottom";
  const pct = config.layout.vertical_percent;

  // Arrow keys nudge the block by 1% (Shift = 10%); Esc deselects.
  const curY = pct ?? 80;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable) return;
    const d = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowUp")        { e.preventDefault(); onMoveY?.(nudge(curY, -d)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onMoveY?.(nudge(curY,  d)); }
    else if (e.key === "Escape")    { (e.currentTarget as HTMLElement).blur(); }
  };

  const posStyle: React.CSSProperties = (() => {
    if (pct !== undefined) return { top: `${pct}%`, transform: "translateY(-50%)" };
    if (pos === "top") return { top: "10%" };
    if (pos === "middle") return { top: "50%", transform: "translateY(-50%)" };
    return { bottom: "12%" };
  })();

  // ── Per-style preview rendering ─────────────────────────────────────────────
  // Mirrors the worker's renderers: HF styles match worker/captions/<id>.html
  // (fonts, base sizes at 1080w, colors from highlight.*); PIL styles (clean,
  // box) match subtitle.py's look (colors from color.*).
  const styleId = config.style_id ?? (config.hyperframes_component ? "pill" : "clean");
  getCaptionStyle(styleId); // catalog is authoritative; unknown ids fall back inside
  const { typography: t, color: c } = config;
  const hl = config.highlight ?? DEFAULT_HIGHLIGHT_STYLE;
  const SCALE = previewWidth / 1080;
  const sizePct = t.font_size / 100;
  const px = (base: number) => Math.max(7, Math.round(base * sizePct * SCALE));

  const outline = (r: number, col: string) => [
    `-${r}px -${r}px 0 ${col}`, `${r}px -${r}px 0 ${col}`,
    `-${r}px ${r}px 0 ${col}`, `${r}px ${r}px 0 ${col}`,
    `0 ${r}px 0 ${col}`, `0 -${r}px 0 ${col}`,
    `${r}px 0 0 ${col}`, `-${r}px 0 0 ${col}`,
  ].join(",");

  const words = captionPreviewWords(text);
  const hi = Math.floor((words.length - 1) / 2);  // "active" word in the preview
  const row: React.CSSProperties = {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center",
  };

  let body: React.ReactNode;
  if (styleId === "impact" || styleId === "beast") {
    const beast = styleId === "beast";
    const fs = px(beast ? 74 : 72);
    const strokeR = Math.max(1, Math.round(fs * 0.08));
    body = (
      <div style={{ ...row, gap: Math.round(fs * (beast ? 0.42 : 0.22)) }}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`} style={{
            fontFamily: beast ? "var(--font-luckiest), cursive" : "var(--font-anton), sans-serif",
            fontSize: fs, lineHeight: 1.15, textTransform: "uppercase",
            color: i === hi ? hl.fill_color : hl.font_color,
            textShadow: outline(strokeR, c.stroke_color ?? "#000000"),
            display: "inline-block",
            transform: i === hi ? (beast ? "scale(1.12) rotate(-2deg)" : "scale(1.13)") : undefined,
          }}>{w.toUpperCase()}</span>
        ))}
      </div>
    );
  } else if (styleId === "karaoke") {
    const fs = px(58);
    body = (
      <div style={{ ...row, gap: Math.round(fs * 0.22) }}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`} style={{
            fontFamily: "var(--font-montserrat), sans-serif", fontWeight: 800,
            fontSize: fs, lineHeight: 1.2,
            color: i <= hi ? hl.fill_color : hl.font_color,
            opacity: i <= hi ? 1 : 0.55,
            textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            display: "inline-block",
            transform: i === hi ? "scale(1.1)" : undefined,
          }}>{w}</span>
        ))}
      </div>
    );
  } else if (styleId === "box") {
    const fs = px(56);
    body = (
      <div style={{ ...row }}>
        <span style={{
          fontWeight: 700, fontSize: fs, lineHeight: 1.35, textAlign: "center",
          color: c.text_color,
          background: hexToRgba(c.bg_color || "#000000", c.bg_opacity ?? 0.65),
          borderRadius: Math.max(3, Math.round(fs * 0.2)),
          padding: `${Math.round(fs * 0.18)}px ${Math.round(fs * 0.4)}px`,
        }}>{words.join(" ")}</span>
      </div>
    );
  } else if (styleId === "clean") {
    const fs = px(56);
    const strokeR = Math.max(1, Math.ceil((c.stroke_width ?? 0) * SCALE * 2.5));
    body = (
      <div style={{ ...row, gap: Math.round(fs * 0.25) }}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`} style={{
            fontWeight: 700, fontSize: fs, lineHeight: 1.2,
            color: i === hi ? c.highlight_color : c.text_color,
            textShadow: c.stroke_width
              ? outline(strokeR, c.stroke_color ?? "#000000")
              : "0 2px 6px rgba(0,0,0,0.6)",
            display: "inline-block",
          }}>{w}</span>
        ))}
      </div>
    );
  } else {
    // pill (default)
    const fs = px(58);
    const hlShadow = hl.shadow_blur > 0
      ? `0 2px ${Math.max(2, Math.round(hl.shadow_blur * SCALE))}px ${hexToRgba(hl.fill_color, 0.45)}`
      : "none";
    body = (
      <div style={{ ...row, gap: Math.round(fs * 0.14) }}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`} style={{
            fontFamily: "var(--font-montserrat), sans-serif", fontWeight: 800,
            fontSize: fs, lineHeight: 1.15, textTransform: "uppercase",
            letterSpacing: `${hl.letter_spacing}em`,
            color: hl.font_color,
            textShadow: "0 1px 4px rgba(0,0,0,0.45)",
            padding: "1px 4px",
            borderRadius: Math.max(2, Math.round(hl.border_radius * SCALE * 2)),
            background: i === hi ? hl.fill_color : "transparent",
            boxShadow: i === hi ? hlShadow : "none",
          }}>{w.toUpperCase()}</span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`absolute left-0 right-0 z-20 px-3 outline-none ${editable ? "rounded-md focus-visible:ring-2 focus-visible:ring-white/70" : ""}`}
      style={{ ...posStyle, cursor: editable ? "grab" : undefined, touchAction: editable ? "none" : undefined }}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "button" : undefined}
      aria-label={editable ? "Caption position — drag or use arrow keys" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {editable && dragActive && (
        <div className="absolute left-1/2 -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums pointer-events-none"
          style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
          Y {Math.round(curY)}%
        </div>
      )}
      {body}
    </div>
  );
}

type HsvaColor = { h: number; s: number; v: number; a: number };

/**
 * Space-aware popover placement: prefer below the trigger; flip above when the
 * bottom would overflow the viewport; clamp inside as a last resort. Pure so
 * it can be unit-tested without a DOM.
 */
export function placePopover(
  trigger: { top: number; bottom: number; left: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  gap = 6,
  margin = 8,
): { top: number; left: number } {
  let top = trigger.bottom + gap;
  if (top + size.h > viewport.h - margin) {
    const above = trigger.top - size.h - gap;
    top = above >= margin ? above : Math.max(margin, viewport.h - size.h - margin);
  }
  const left = Math.max(margin, Math.min(trigger.left, viewport.w - size.w - margin));
  return { top, left };
}

const PICKER_W = 220;
const PICKER_H_ESTIMATE = 340;   // refined by measurement once the popover renders

const PALETTE = [
  "#ff1745", "#ff6b00", "#ffe600", "#4ade80", "#22d3ee", "#3b82f6",
  "#8b5cf6", "#ec4899", "#ffffff", "#aaaaaa", "#3f3f3f", "#000000",
];

export function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hsva, setHsva] = useState<HsvaColor>({ h: 0, s: 0, v: 100, a: 1 });
  const [hexInput, setHexInput] = useState(value.replace("#", "").toUpperCase());
  const [recent, setRecent] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("cf_recent_colors") ?? "[]"); } catch { return []; }
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [hasEyeDropper, setHasEyeDropper] = useState(false);

  useEffect(() => { setHasEyeDropper(typeof window !== "undefined" && "EyeDropper" in window); }, []);

  useEffect(() => {
    if (!open) {
      try { setHsva(hexToHsva(value) as HsvaColor); } catch {}
      setHexInput(value.replace("#", "").toUpperCase());
    }
  }, [value, open]);

  // Compute a viewport-aware position from the trigger + actual popover size.
  const reposition = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const h = pickerRef.current?.offsetHeight ?? PICKER_H_ESTIMATE;
    setPos(placePopover(r, { w: PICKER_W, h }, { w: window.innerWidth, h: window.innerHeight }));
  };

  // Once the popover has rendered, re-place it with its measured height (the
  // estimate can be off when e.g. the "Recent" row is present).
  useLayoutEffect(() => {
    if (open) reposition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the fixed-position popover glued to the trigger when the dialog body
  // scrolls or the window resizes (capture=true catches the inner scroll).
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        closeAndSave();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const closeAndSave = () => {
    setRecent(prev => {
      const next = [value, ...prev.filter(c => c.toLowerCase() !== value.toLowerCase())].slice(0, 8);
      try { localStorage.setItem("cf_recent_colors", JSON.stringify(next)); } catch {}
      return next;
    });
    setOpen(false);
  };

  const handleToggle = () => {
    if (open) { closeAndSave(); return; }
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos(placePopover(r, { w: PICKER_W, h: PICKER_H_ESTIMATE }, { w: window.innerWidth, h: window.innerHeight }));
    }
    try { setHsva(hexToHsva(value) as HsvaColor); } catch {}
    setHexInput(value.replace("#", "").toUpperCase());
    setOpen(true);
  };

  const apply = (newHsva: HsvaColor) => {
    setHsva(newHsva);
    const hex = hsvaToHex(newHsva);
    setHexInput(hex.replace("#", "").toUpperCase());
    onChange(hex);
  };

  const pickSwatch = (c: string) => {
    onChange(c);
    setHexInput(c.replace("#", "").toUpperCase());
    try { setHsva(hexToHsva(c) as HsvaColor); } catch {}
  };

  const pickEyedropper = async () => {
    try {
      // @ts-expect-error EyeDropper is not yet in the TS DOM lib
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) pickSwatch(result.sRGBHex);
    } catch { /* user cancelled */ }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--yt-text-2)" }}>{label}</span>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg transition-all duration-150"
        style={{ background: "var(--yt-surface-2)", border: `1px solid ${open ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}` }}
      >
        <span className="w-3.5 h-3.5 flex-shrink-0 rounded-[3px]" style={{ background: value, boxShadow: "0 0 0 1px rgba(255,255,255,0.12)" }} />
        <span className="text-[10px] font-mono truncate" style={{ color: "var(--yt-text)" }}>{value}</span>
      </button>

      {open && createPortal(
        <div
          ref={pickerRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
            width: PICKER_W, background: "#1a1a1a", borderRadius: 10,
            border: "1px solid #333", boxShadow: "0 12px 40px rgba(0,0,0,0.75)",
            overflow: "hidden",
          }}
        >
          {/* Saturation/Brightness square */}
          <Saturation
            hsva={hsva as any}
            onChange={(partial: any) => apply({ ...hsva, ...partial })}
            style={{ width: "100%", height: 150, display: "block", borderRadius: 0 }}
          />
          {/* Hue bar */}
          <div style={{ padding: "10px 12px 6px" }}>
            <Hue
              hue={hsva.h}
              onChange={({ h }: any) => apply({ ...hsva, h })}
              style={{ height: 10, borderRadius: 5 }}
            />
          </div>
          {/* Hex input row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px 10px" }}>
            <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>#</span>
            <input
              value={hexInput}
              onChange={e => {
                const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
                setHexInput(raw);
                if (raw.length === 6) {
                  const hex = "#" + raw.toLowerCase();
                  onChange(hex);
                  try { setHsva(hexToHsva(hex) as HsvaColor); } catch {}
                }
              }}
              maxLength={6}
              spellCheck={false}
              style={{
                flex: 1, background: "#252525", border: "1px solid #333",
                borderRadius: 4, color: "#f1f1f1", fontSize: 11, fontFamily: "monospace",
                padding: "3px 6px", outline: "none",
              }}
            />
            {hasEyeDropper && (
              <button
                type="button" onClick={pickEyedropper} title="Pick a color from the screen"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 4, background: "#252525", border: "1px solid #333", cursor: "pointer", flexShrink: 0 }}
              >
                <Pipette style={{ width: 13, height: 13, color: "#f1f1f1" }} />
              </button>
            )}
            <span style={{ width: 22, height: 22, borderRadius: 4, background: value, flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.15)" }} />
          </div>

          {/* Recent colors */}
          {recent.length > 0 && (
            <div style={{ padding: "6px 12px 8px", borderTop: "1px solid #252525" }}>
              <p style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Recent</p>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {recent.map(c => (
                  <button key={c} onClick={() => pickSwatch(c)} style={{
                    width: 18, height: 18, borderRadius: 4, background: c, cursor: "pointer",
                    border: c.toLowerCase() === value.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Default palette */}
          <div style={{ padding: "6px 12px 10px", borderTop: "1px solid #252525" }}>
            <p style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Colors</p>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {PALETTE.map(c => (
                <button key={c} onClick={() => pickSwatch(c)} style={{
                  width: 18, height: 18, borderRadius: 4, background: c, cursor: "pointer",
                  border: c.toLowerCase() === value.toLowerCase() ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                }} />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

