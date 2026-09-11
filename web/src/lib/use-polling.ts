"use client";

import { useEffect, useRef } from "react";

/**
 * Run `fn` every `ms` while `enabled`, pausing whenever the tab is hidden and
 * firing once immediately when it becomes visible again. Consolidates the
 * ad-hoc setInterval loops so hidden tabs stop hitting the network.
 */
export function usePolling(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let iv: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (iv || document.hidden) return;
      iv = setInterval(() => fnRef.current(), ms);
    };
    const stop = () => {
      if (iv) { clearInterval(iv); iv = null; }
    };
    const onVisibility = () => {
      if (document.hidden) { stop(); }
      else { fnRef.current(); start(); }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [ms, enabled]);
}
