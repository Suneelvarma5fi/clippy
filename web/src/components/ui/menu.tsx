"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

const MENUITEM = '[role="menuitem"]:not([disabled])';

/**
 * Given item count, the active item index, and the key, returns the next index
 * to focus, or null when the key doesn't move focus. Pure → unit-testable.
 * Wraps at both ends. Home/End jump to first/last.
 */
export function nextMenuIndex(
  count: number,
  activeIndex: number,
  key: string,
): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowDown": return (activeIndex + 1) % count;
    case "ArrowUp":   return (activeIndex - 1 + count) % count;
    case "Home":      return 0;
    case "End":       return count - 1;
    default:          return null;
  }
}

interface MenuProps {
  /** Content of the trigger button (icon and/or label). */
  button: React.ReactNode;
  buttonClassName?: string;
  ariaLabel?: string;
  /** Popover width in px. */
  width?: number;
  /** Horizontal alignment of the popover to the trigger. */
  align?: "start" | "end";
  /** Extra classes for the popover panel. */
  className?: string;
  /** Fired when the menu closes (any reason) — handy for resetting sub-state. */
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * Keyboard-complete dropdown: role="menu", Arrow/Home/End/Enter/Esc navigation,
 * outside-click to close, and vertical flip so it never clips below the viewport.
 * Items are any elements with role="menuitem" (use <MenuItem>).
 */
export function Menu({
  button,
  buttonClassName,
  ariaLabel,
  width = 208,
  align = "end",
  className = "",
  onClose,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Fire onClose only on an actual open → closed transition (not on mount).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open && wasOpen.current) onCloseRef.current?.();
    wasOpen.current = open;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Decide flip direction from available space, then open.
  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setOpenUp(window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom);
    }
    setOpen((o) => !o);
  };

  // Outside-click / focus-out closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>(MENUITEM)?.focus();
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { setOpen(false); return; }
    const items = Array.from(popRef.current?.querySelectorAll<HTMLElement>(MENUITEM) ?? []);
    const active = items.indexOf(document.activeElement as HTMLElement);
    const to = nextMenuIndex(items.length, active, e.key);
    if (to !== null) { e.preventDefault(); items[to].focus(); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        className={buttonClassName}
      >
        {button}
      </button>

      {open && (
        <div
          ref={popRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onKeyDown}
          onClick={(e) => onMenuPanelClick(e, () => setOpen(false))}
          style={{ width }}
          className={`absolute z-50 rounded-xl py-1 shadow-2xl ${
            align === "end" ? "right-0" : "left-0"
          } ${openUp ? "bottom-full mb-1" : "top-full mt-1"} ${className}`}
          data-open-up={openUp || undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Click anywhere in the open panel. Both calls matter: stopPropagation keeps
 * it from React handlers up the tree, and preventDefault keeps the browser
 * from following an enclosing <a> — a menu rendered inside a card link would
 * otherwise navigate on every item click (the trigger already does both).
 * Selecting an item closes the menu unless it opts out (e.g. a submenu toggle).
 */
export function onMenuPanelClick(
  e: { preventDefault(): void; stopPropagation(): void; target: EventTarget | null },
  close: () => void,
) {
  e.preventDefault();
  e.stopPropagation();
  const item = (e.target as HTMLElement | null)?.closest?.('[role="menuitem"]');
  if (item && !item.hasAttribute("data-keep-open")) close();
}

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
  size?: "sm" | "md";
  /** Keep the menu open after this item is clicked (e.g. a submenu toggle). */
  keepOpen?: boolean;
}

const ITEM_SIZE = {
  sm: "gap-2 px-3 py-1.5 text-xs",
  md: "gap-3 px-4 py-2.5 text-sm",
};

/** A single menu row. role="menuitem", -1 tabindex so the menu manages focus. */
export function MenuItem({ destructive, size = "md", keepOpen, className = "", children, ...props }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-keep-open={keepOpen || undefined}
      className={`w-full flex items-center transition-colors hover:bg-[var(--yt-surface-2)] focus:bg-[var(--yt-surface-2)] focus:outline-none disabled:opacity-50 ${ITEM_SIZE[size]} ${
        destructive ? "text-red-400" : "text-[var(--yt-text)]"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
