"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Given the focusable count and the currently-focused index, returns the index
 * Tab/Shift+Tab should wrap to at the boundaries, or null when no wrap is needed.
 * Pure so the trap logic is unit-testable without a DOM.
 */
export function computeTabWrap(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (count === 0) return null;
  if (shiftKey && activeIndex <= 0) return count - 1;
  if (!shiftKey && activeIndex >= count - 1) return 0;
  return null;
}

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Panel classes (the surface, radius, width, etc). */
  className?: string;
  /** Panel inline style. */
  style?: React.CSSProperties;
  /** id of the element that labels the dialog. */
  labelledBy?: string;
  /** aria-label fallback when there is no visible title to reference. */
  label?: string;
  /** Close when the backdrop is clicked. Default true. */
  closeOnBackdrop?: boolean;
  /** Close when Escape is pressed. Default true. Set false to keep bespoke handling. */
  closeOnEsc?: boolean;
  /** Element to focus on open; defaults to the first focusable inside the panel. */
  initialFocus?: React.RefObject<HTMLElement | null>;
}

/**
 * One overlay primitive for every dialog: portal, role="dialog" aria-modal,
 * focus trap, focus restore on close, Esc, backdrop-click, one backdrop token.
 * Callers supply their own panel via `className`/`style` + children.
 */
export function Modal({
  onClose,
  children,
  className,
  style,
  labelledBy,
  label,
  closeOnBackdrop = true,
  closeOnEsc = true,
  initialFocus,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Focus management: focus into the panel on open, restore on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTarget =
      initialFocus?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panelRef.current;
    focusTarget?.focus();
    return () => previouslyFocused?.focus?.();
  }, [initialFocus]);

  // Esc + Tab trap.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEsc) {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      const wrapTo = computeTabWrap(items.length, activeIndex, e.shiftKey);
      if (wrapTo !== null) {
        e.preventDefault();
        items[wrapTo].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, closeOnEsc]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
