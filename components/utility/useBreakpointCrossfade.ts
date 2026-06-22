"use client";

import { useEffect, useState } from "react";

/** The fade-OUT leg of the breakpoint cross-fade, in ms. The displayed
 *  breakpoint is swapped at the trough (fully hidden), so this must match the
 *  fade-out duration on `.bp-crossfade--switching`. Kept short so a full
 *  out+in cycle is quicker than a typical click, which stops the fades from
 *  stacking into a flicker when clicking through tabs. */
export const BP_FADE_MS = 90;

/**
 * Cross-fade state for switching breakpoints, shared by the report grid and
 * the page-detail panel so both animate identically.
 *
 * The rendered breakpoint (`displayedBp`) lags `activeBp` by one fade: the
 * outgoing content fades out, the image sources swap while hidden, then the
 * incoming content fades back in. `switching` drives the
 * `.bp-crossfade--switching` class. Reduced motion swaps instantly (no fade).
 *
 * Note: callers should keep the shot hidden until the swapped-in image is
 * actually decoded (see PageDetailPanel) — otherwise the `<img>` keeps
 * painting the *previous* breakpoint until the new one decodes, and the fade
 * back in briefly shows the old image (reads as an out/in/out stutter).
 */
export function useBreakpointCrossfade(activeBp: number): {
  displayedBp: number;
  switching: boolean;
} {
  const [displayedBp, setDisplayedBp] = useState(activeBp);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (activeBp === displayedBp) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedBp(activeBp);
      return;
    }
    setSwitching(true); // fade the current content out
    const t = setTimeout(() => {
      setDisplayedBp(activeBp); // swap sources while hidden
      setSwitching(false); // fade the new content in
    }, BP_FADE_MS);
    return () => clearTimeout(t);
  }, [activeBp, displayedBp]);

  return { displayedBp, switching };
}
