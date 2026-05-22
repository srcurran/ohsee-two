/** View-mode toggle (tap / slider) plus a separate Diff toggle that swaps
 * the plain screenshots for their change-highlighted variants. Also handles
 * scroll-position preservation across mode swaps: toggling swaps the
 * screenshot column's child, the new <img> reports zero height until it
 * loads, and during that gap the browser clamps scrollTop. We snapshot
 * scrollTop synchronously in `changeViewMode` and re-apply it once the new
 * content has grown. (Toggling Diff keeps the same dimensions, so it needs
 * no restoration.) */

import { useCallback, useEffect, useRef, useState } from "react";

export type ViewMode = "tap" | "slider";

interface UsePageDetailViewModeArgs {
  pageId: string;
}

interface UsePageDetailViewModeResult {
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  changeViewMode: (next: ViewMode) => void;
  diffMode: boolean;
  setDiffMode: React.Dispatch<React.SetStateAction<boolean>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  screenshotRef: React.RefObject<HTMLDivElement | null>;
}

export function usePageDetailViewMode({
  pageId,
}: UsePageDetailViewModeArgs): UsePageDetailViewModeResult {
  // Default to the Tap comparison with Diff on — the change-highlighted
  // screenshots are the primary thing users come here to see.
  const [viewMode, setViewMode] = useState<ViewMode>("tap");
  const [diffMode, setDiffMode] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const screenshotRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  // Captured by changeViewMode before we flip viewMode so the restore effect
  // below can put scrollTop back where it was once the new SliderComparison
  // content has loaded. Null when no restore is pending.
  const pendingRestoreRef = useRef<number | null>(null);

  // Always change viewMode through this so scroll restoration is armed.
  // Capturing scrollTop here (synchronous with the click) is essential —
  // the scroll listener below would overwrite scrollTopRef once the
  // browser clamps scrollTop during the new image's loading gap.
  const changeViewMode = useCallback(
    (next: ViewMode) => {
      if (next !== viewMode && scrollRef.current) {
        pendingRestoreRef.current = scrollRef.current.scrollTop;
      }
      setViewMode(next);
    },
    [viewMode],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    scrollTopRef.current = 0;
  }, [pageId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      scrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Preserve scroll position across view-mode toggles (Tap / Slider / Changes).
  // Toggling swaps the screenshot column's child component, and the new
  // <img> reports zero height until it loads — during that gap the browser
  // clamps scrollTop. We snapshot scrollTop into pendingRestoreRef *before*
  // the state change (in changeViewMode above), then re-apply it here once
  // the screenshot wrapper has grown back to a sufficient height.
  useEffect(() => {
    const target = pendingRestoreRef.current;
    if (target === null) return;
    pendingRestoreRef.current = null;

    const el = scrollRef.current;
    const content = screenshotRef.current;
    if (!el || !content) return;

    const tryRestore = () => {
      const max = el.scrollHeight - el.clientHeight;
      const clamped = Math.min(target, max);
      if (el.scrollTop !== clamped) el.scrollTop = clamped;
      // Done if we were able to land at (or past) the original position.
      return max >= target;
    };

    if (tryRestore()) return;

    const observer = new ResizeObserver(() => {
      if (tryRestore()) observer.disconnect();
    });
    observer.observe(content);

    // Bail after the new image surely has loaded; if it never grows back
    // to the original height, the clamped value is the best we can do.
    const timeout = setTimeout(() => observer.disconnect(), 1500);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [viewMode]);

  return {
    viewMode,
    setViewMode,
    changeViewMode,
    diffMode,
    setDiffMode,
    scrollRef,
    screenshotRef,
  };
}
