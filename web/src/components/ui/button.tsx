"use client";

import { forwardRef } from "react";

type Variant = "white" | "red" | "surface" | "ghost" | "destructive";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--yt-text-2)]";

// CSS hover only — no JS onMouseEnter/Leave, which stick on touch and reset on re-render.
const VARIANTS: Record<Variant, string> = {
  white:       "bg-white text-[#0a0a0a] hover:bg-[#e5e5e5]",
  red:         "bg-[var(--yt-red)] text-white hover:bg-[var(--yt-red-hover)]",
  surface:     "bg-[var(--yt-surface-2)] text-[var(--yt-text)] border border-[var(--yt-border)] hover:bg-[var(--yt-hover)]",
  ghost:       "text-[var(--yt-text-2)] hover:text-[var(--yt-text)] hover:bg-[var(--yt-hover)]",
  destructive: "bg-[#dc2626] text-white hover:bg-[#b91c1c]",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Pill (rounded-full) instead of the default rounded-lg. */
  pill?: boolean;
}

/**
 * Shared button recipe. `variant` picks colours (CSS hover), `size` the padding.
 * Extra `className` is appended so callers can tweak layout without re-styling hover.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "surface", size = "md", pill, className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${pill ? "rounded-full" : "rounded-lg"} ${className}`}
      {...props}
    />
  );
});
