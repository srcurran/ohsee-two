"use client";

import { useEffect, useState } from "react";

interface LoadingOverlayProps {
  /** Flip to true when the page is ready to render. The overlay fades
   * out over 0.3s, then unmounts itself. */
  ready: boolean;
}

/** Neutral white loading scrim with an animated three-dot ellipsis. Used
 * as a top-level wrapper around route pages so the loading state is the
 * same everywhere and the transition into rendered content is a clean
 * cross-fade rather than a layout shift. */
export function LoadingOverlay({ ready }: LoadingOverlayProps) {
  const [unmounted, setUnmounted] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setUnmounted(true), 300);
    return () => clearTimeout(t);
  }, [ready]);

  if (unmounted) return null;

  return (
    <div
      className={`loading-overlay${ready ? " loading-overlay--ready" : ""}`}
      aria-hidden={ready}
    >
      <span className="loading-overlay__text">Loading</span>
      <span className="loading-overlay__dots" aria-hidden />
    </div>
  );
}
