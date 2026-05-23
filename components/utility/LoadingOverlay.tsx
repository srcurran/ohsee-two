"use client";

import { useEffect, useState } from "react";

interface LoadingOverlayProps {
  /** Flip to true when the page is ready to render. The overlay fades
   * out over 0.3s, then unmounts itself. */
  ready: boolean;
}

// Module-level so it survives a route page's React state being reset on
// navigation. Once the app has rendered real content even once in this
// session, the full-screen overlay won't paint again — even if a route
// component momentarily renders null between two test reports, the user
// sees the previous (or next) view instead of a white flash.
let hasEverBeenReady = false;

/** Neutral white loading scrim with an animated three-dot ellipsis. Used
 * as a top-level wrapper around route pages so the loading state is the
 * same everywhere and the transition into rendered content is a clean
 * cross-fade rather than a layout shift. After the first paint of a
 * session, navigation-time `ready=false` flashes are suppressed. */
export function LoadingOverlay({ ready }: LoadingOverlayProps) {
  // Local fade-out flag: once `ready` flips true, the scrim fades for
  // 300ms then unmounts. Stays unmounted from there until the component
  // tree itself remounts.
  const [fadedOut, setFadedOut] = useState(false);

  useEffect(() => {
    if (!ready) return;
    hasEverBeenReady = true;
    const t = setTimeout(() => setFadedOut(true), 300);
    return () => clearTimeout(t);
  }, [ready]);

  if (fadedOut) return null;
  // After the first paint of the session, suppress the full-screen
  // overlay on subsequent `ready=false` periods — those are navigation
  // gaps, not cold loads, and showing the white scrim makes a same-
  // segment route hop feel like an app restart.
  if (hasEverBeenReady && !ready) return null;

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
