"use client";

import { useRef, useState } from "react";
import { TextStickerConfig, ImageStickerConfig, IMAGE_STICKER_MIN_WPCT, IMAGE_STICKER_MAX_WPCT } from "@/lib/types";
import { POSITION_MIN, POSITION_MAX, STICKER_SCALE_MIN, STICKER_SCALE_MAX, snapAxis, nudge } from "@/lib/editor-bounds";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Group words into lines by their vertical position. Words sharing the same
 * (rounded) `top` are on one line. Pure so it can be unit-tested without layout.
 */
export function groupWordsIntoLines(words: { word: string; top: number }[]): string[] {
  const lines: string[] = [];
  let cur: string[] = [];
  let lastTop: number | null = null;
  for (const { word, top } of words) {
    if (lastTop !== null && top !== lastTop) {
      lines.push(cur.join(" "));
      cur = [];
    }
    cur.push(word);
    lastTop = top;
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines;
}

/**
 * Read the sticker's *actual* line breaks straight from the rendered DOM, so the
 * worker can reproduce them exactly. Measures each word's position via a Range;
 * `scale`/position transforms don't change which words share a line.
 */
export function extractWrappedLines(span: HTMLElement): string[] {
  const node = span.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return [];
  const text = node.textContent ?? "";
  const range = document.createRange();
  const words: { word: string; top: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    range.setStart(node, m.index);
    range.setEnd(node, m.index + m[0].length);
    words.push({ word: m[0], top: Math.round(range.getBoundingClientRect().top) });
  }
  return groupWordsIntoLines(words);
}

interface ImageProps {
  config: ImageStickerConfig;
  previewWidth: number;
  editable?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  onMove?: (x_pct: number, y_pct: number) => void;
  /** Called as the corner handle is dragged — new width as % of video width. */
  onResize?: (width_pct: number) => void;
  onDragStateChange?: (active: boolean) => void;
}

/**
 * User-uploaded PNG sticker (logo) — same drag/resize interactions as the text
 * sticker, but sized as a % of video width so the export matches the preview.
 */
export function ImageStickerOverlay({ config, previewWidth, editable = false, containerRef, onMove, onResize, onDragStateChange }: ImageProps) {
  const dragging = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const setDrag = (v: boolean) => { dragging.current = v; setDragActive(v); onDragStateChange?.(v); };
  const outerRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ dist: number; width_pct: number } | null>(null);

  const widthPx = (config.width_pct / 100) * previewWidth;

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
    onMove?.(
      snapAxis(clamp(((e.clientX - r.left) / r.width) * 100, POSITION_MIN, POSITION_MAX)),
      clamp(((e.clientY - r.top) / r.height) * 100, POSITION_MIN, POSITION_MAX),
    );
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setDrag(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const distToCenter = (e: React.PointerEvent) => {
    const r = outerRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeStart.current = { dist: distToCenter(e) || 1, width_pct: config.width_pct };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizeStart.current) return;
    e.stopPropagation();
    const ratio = distToCenter(e) / resizeStart.current.dist;
    onResize?.(Math.round(clamp(resizeStart.current.width_pct * ratio, IMAGE_STICKER_MIN_WPCT, IMAGE_STICKER_MAX_WPCT)));
  };
  const onResizeUp = (e: React.PointerEvent) => {
    resizeStart.current = null;
    e.stopPropagation();
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable) return;
    const d = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft")       { e.preventDefault(); onMove?.(nudge(config.x_pct, -d), config.y_pct); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onMove?.(nudge(config.x_pct,  d), config.y_pct); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); onMove?.(config.x_pct, nudge(config.y_pct, -d)); }
    else if (e.key === "ArrowDown")  { e.preventDefault(); onMove?.(config.x_pct, nudge(config.y_pct,  d)); }
    else if (e.key === "Escape")     { (e.currentTarget as HTMLElement).blur(); }
  };

  return (
    <div
      ref={outerRef}
      style={{
        position: "absolute",
        left: `${config.x_pct}%`,
        top: `${config.y_pct}%`,
        transform: "translate(-50%,-50%)",
        cursor: editable ? "move" : "default",
        touchAction: "none",
        userSelect: "none",
        zIndex: 25,
      }}
      className={editable ? "outline-none rounded-md focus-visible:ring-2 focus-visible:ring-white/70" : undefined}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "button" : undefined}
      aria-label={editable ? "Image sticker position — drag or use arrow keys" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {editable && dragActive && (
        <div className="absolute left-1/2 -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums whitespace-nowrap pointer-events-none"
          style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
          X {Math.round(config.x_pct)} · Y {Math.round(config.y_pct)}
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={config.url} alt="" draggable={false} style={{ width: widthPx, height: "auto", display: "block" }} />
      {editable && onResize && (
        <div
          role="slider"
          aria-label="Resize image sticker"
          aria-valuenow={Math.round(config.width_pct)}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          style={{
            position: "absolute", right: -7, bottom: -7, width: 14, height: 14,
            borderRadius: "50%", background: "#fff", border: "2px solid var(--yt-red)",
            cursor: "nwse-resize", touchAction: "none",
          }}
        />
      )}
    </div>
  );
}

interface Props {
  config: TextStickerConfig;
  previewWidth: number;
  /** When set, the sticker can be dragged within `containerRef`. */
  editable?: boolean;
  containerRef?: React.RefObject<HTMLElement | null>;
  onMove?: (x_pct: number, y_pct: number) => void;
  /** Called as the corner handle is dragged to resize the sticker. */
  onScale?: (scale: number) => void;
  /** Fired while a drag is in progress so the host can show guides. */
  onDragStateChange?: (active: boolean) => void;
}

/**
 * Instagram-style sticker preview — black text on solid-white per-line pills,
 * center-aligned. `box-decoration-break: clone` gives each wrapped line its own
 * rounded white background, mirroring the PIL renderer on the worker.
 */
export function TextStickerOverlay({ config, previewWidth, editable = false, containerRef, onMove, onScale, onDragStateChange }: Props) {
  const dragging = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const setDrag = (v: boolean) => { dragging.current = v; setDragActive(v); onDragStateChange?.(v); };
  const outerRef = useRef<HTMLDivElement>(null);
  const scaleStart = useRef<{ dist: number; scale: number } | null>(null);

  if (!config.text.trim()) return null;

  const fs = (config.size_pct / 100) * previewWidth;

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
    onMove?.(
      // Snap horizontally to center so users can reliably center a sticker.
      snapAxis(clamp(((e.clientX - r.left) / r.width) * 100, POSITION_MIN, POSITION_MAX)),
      clamp(((e.clientY - r.top) / r.height) * 100, POSITION_MIN, POSITION_MAX),
    );
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setDrag(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // Corner handle → scale relative to the pointer's distance from the sticker center.
  const distToCenter = (e: React.PointerEvent) => {
    const r = outerRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  const onScaleDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    scaleStart.current = { dist: distToCenter(e) || 1, scale: config.scale };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onScaleMove = (e: React.PointerEvent) => {
    if (!scaleStart.current) return;
    e.stopPropagation();
    const ratio = distToCenter(e) / scaleStart.current.dist;
    onScale?.(clamp(scaleStart.current.scale * ratio, STICKER_SCALE_MIN, STICKER_SCALE_MAX));
  };
  const onScaleUp = (e: React.PointerEvent) => {
    scaleStart.current = null;
    e.stopPropagation();
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // Arrow keys nudge by 1% (Shift = 10%); Esc deselects.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editable) return;
    const d = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft")       { e.preventDefault(); onMove?.(nudge(config.x_pct, -d), config.y_pct); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onMove?.(nudge(config.x_pct,  d), config.y_pct); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); onMove?.(config.x_pct, nudge(config.y_pct, -d)); }
    else if (e.key === "ArrowDown")  { e.preventDefault(); onMove?.(config.x_pct, nudge(config.y_pct,  d)); }
    else if (e.key === "Escape")     { (e.currentTarget as HTMLElement).blur(); }
  };

  return (
    <div
      ref={outerRef}
      style={{
        position: "absolute",
        left: `${config.x_pct}%`,
        top: `${config.y_pct}%`,
        transform: `translate(-50%,-50%) scale(${config.scale})`,
        maxWidth: "85%",
        textAlign: "center",
        cursor: editable ? "move" : "default",
        touchAction: "none",
        userSelect: "none",
      }}
      className={editable ? "outline-none rounded-md focus-visible:ring-2 focus-visible:ring-white/70" : undefined}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "button" : undefined}
      aria-label={editable ? "Sticker position — drag or use arrow keys" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {editable && dragActive && (
        <div className="absolute left-1/2 -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums whitespace-nowrap pointer-events-none"
          style={{ background: "rgba(0,0,0,0.8)", color: "#fff" }}>
          X {Math.round(config.x_pct)} · Y {Math.round(config.y_pct)}
        </div>
      )}
      <span
        data-sticker-span
        style={{
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          background: config.bg,
          color: config.fg,
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          fontWeight: 700,
          fontSize: `${fs}px`,
          // Tight line-height + vertical padding makes consecutive line
          // backgrounds overlap into one connected white block (no gap).
          lineHeight: 1.1,
          padding: `${fs * 0.18}px ${fs * 0.4}px`,
          borderRadius: `${fs * 0.28}px`,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {config.text}
      </span>

      {editable && onScale && (
        <div
          role="slider"
          aria-label="Resize sticker"
          aria-valuenow={Math.round(config.scale * 100)}
          onPointerDown={onScaleDown}
          onPointerMove={onScaleMove}
          onPointerUp={onScaleUp}
          style={{
            position: "absolute", right: -7, bottom: -7, width: 14, height: 14,
            borderRadius: "50%", background: "#fff", border: "2px solid var(--yt-red)",
            cursor: "nwse-resize", touchAction: "none",
          }}
        />
      )}
    </div>
  );
}
