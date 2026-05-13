/** Mount-in / exit transition state for the test-settings overlay, plus an
 * Escape-key binding that either backs out one level (when an editor is
 * open) or closes the overlay. */

import { useCallback, useEffect, useState } from "react";

const ENTER_MS = 180;
const EXIT_MS = 140;

interface UseOverlayAnimArgs {
  /** Called after the exit animation completes. */
  onClose: () => void;
  /** Optional: when truthy, Esc backs out by calling this instead of close. */
  hasNestedView?: boolean;
  onBackNested?: () => void;
  /** Hook that runs synchronously before the exit animation starts —
   * usually flushSave/cancel timers. */
  beforeExit?: () => void;
}

export interface UseOverlayAnimResult {
  animState: "entering" | "visible" | "exiting";
  enterMs: number;
  exitMs: number;
  handleClose: () => void;
}

export function useOverlayAnim({
  onClose,
  hasNestedView,
  onBackNested,
  beforeExit,
}: UseOverlayAnimArgs): UseOverlayAnimResult {
  const [animState, setAnimState] = useState<"entering" | "visible" | "exiting">(
    "entering",
  );

  // Mount-in animation
  useEffect(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setAnimState("visible")),
    );
  }, []);

  const handleClose = useCallback(() => {
    if (beforeExit) beforeExit();
    setAnimState("exiting");
    setTimeout(onClose, EXIT_MS);
  }, [onClose, beforeExit]);

  // Esc closes (unless an editor is open — Esc backs out one level instead)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      e.preventDefault();
      if (hasNestedView && onBackNested) {
        onBackNested();
      } else {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasNestedView, onBackNested, handleClose]);

  return { animState, enterMs: ENTER_MS, exitMs: EXIT_MS, handleClose };
}
