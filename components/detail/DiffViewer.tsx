"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SemanticChange } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from "@/lib/colors";

interface Props {
  /** Prod screenshot — used as blend overlay when no highlight image. */
  prodSrc: string;
  /** Dev screenshot — shown on press-and-hold so the user can compare. */
  devSrc: string;
  /** Highlight image — prod with pink-tinted change regions. When available,
   *  replaces the blend-mode approach with a clearer visual. */
  highlightSrc?: string;
  alt?: string;
  changes?: SemanticChange[];
  highlightedChangeId?: string | null;
}

function DiffViewerComponent({
  prodSrc,
  devSrc,
  highlightSrc,
  alt = "Diff view",
  changes,
  highlightedChangeId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Measure the base image — drives marker positioning.
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Hide the overlay until it has actually loaded — otherwise a partly-loaded
  // dev image briefly composites against the (white) container background and
  // flashes inverted before prod paints in behind it.
  const [overlayLoaded, setOverlayLoaded] = useState(false);
  // Press-and-hold: when highlight image is available, shows the change
  // markers (hidden by default so the highlight regions are clean). Without
  // highlight, ramps the blend overlay opacity to surface the pixel difference.
  const [peek, setPeek] = useState(false);
  const hasHighlight = !!highlightSrc;
  const overlayOpacity = peek ? 0.8 : 0.2;

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const update = () => {
      setNaturalHeight(img.naturalHeight);
      setRenderedHeight(img.clientHeight);
    };

    if (img.complete) update();
    img.addEventListener("load", update);
    window.addEventListener("resize", update);

    // ResizeObserver catches layout changes that don't fire `load` or
    // `resize` — e.g. the panel animating in from off-screen. Without
    // this, a cached image (img.complete === true at mount) gets
    // measured once at the wrong size, scale stays tiny, and every
    // marker collapses near y=0.
    const ro = new ResizeObserver(update);
    ro.observe(img);

    return () => {
      img.removeEventListener("load", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [highlightSrc, devSrc]);

  // Reset overlay-loaded gate when the overlay source changes, so a
  // breakpoint / variant switch doesn't keep showing the previous overlay
  // while the new one streams in.
  useEffect(() => {
    setOverlayLoaded(false);
  }, [prodSrc]);

  const scale = naturalHeight > 0 ? renderedHeight / naturalHeight : 0;

  useEffect(() => {
    // Markers only exist once the image has loaded (scale > 0). If the user
    // switched into the Changes view by clicking a change, this effect runs
    // once with scale === 0 (no-op) and again with scale > 0 (scrolls).
    //
    // dedupeMarkers groups changes that are vertically close into a single
    // marker, so a marker hosts a *list* of change IDs. We use the
    // whitespace-separated `~=` attribute selector so highlighting any
    // change in the group resolves to that group's marker.
    if (!highlightedChangeId || !containerRef.current || scale === 0) return;
    const el = containerRef.current.querySelector(
      `[data-change-ids~="${highlightedChangeId}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedChangeId, scale]);
  // dedupeMarkers is O(n log n) over the change set — re-running it on
  // every render (including every peek pointerdown) was the dominant
  // cost in this view per the perf audit.
  const markers = useMemo(
    () => (changes ? dedupeMarkers(changes, scale) : []),
    [changes, scale],
  );

  return (
    <div>
      <div
        ref={containerRef}
        className="diff-viewer"
        // Push-to-peek. setPointerCapture guarantees pointerup fires here even
        // if the cursor drifts outside the container during the press, so we
        // don't get stuck in peek mode. pointercancel handles OS-level aborts
        // (focus stolen by a screenshot tool, etc.). We deliberately don't
        // listen to pointerleave — under capture, leave still fires on drift,
        // and we *want* peek to survive drift until release.
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setPeek(true);
        }}
        onPointerUp={() => setPeek(false)}
        onPointerCancel={() => setPeek(false)}
      >
        {/* When highlight image exists: always show it (markers toggle on
            press). When no highlight: legacy blend (dev base + prod overlay
            with mix-blend-mode difference). */}
        <img
          ref={imgRef}
          src={hasHighlight ? highlightSrc : devSrc}
          alt={hasHighlight ? `${alt} (highlight)` : `${alt} (dev)`}
          className="diff-viewer__image diff-viewer__image--base"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        {!hasHighlight && (
          <img
            src={prodSrc}
            alt={`${alt} (prod)`}
            onLoad={() => setOverlayLoaded(true)}
            loading="lazy"
            decoding="async"
            style={{ opacity: overlayLoaded ? overlayOpacity : 0 }}
            className="diff-viewer__image diff-viewer__image--overlay"
            draggable={false}
          />
        )}
        {scale > 0 &&
          markers.map((marker) => {
            const isHighlighted = highlightedChangeId
              ? marker.changes.some((c) => c.id === highlightedChangeId)
              : false;

            // In highlight mode the markers are hidden by default — the pink
            // overlay already carries the signal — and shown while peeking.
            // The one exception is the marker the user just clicked in the
            // sidebar: it must render even when hidden so the scroll-into-view
            // effect has a target and the change can be pulsed.
            if (hasHighlight && !peek && !isHighlighted) return null;

            return (
              <div
                key={marker.id}
                data-change-ids={marker.changes.map((c) => c.id).join(" ")}
                className={`diff-viewer__marker ${isHighlighted ? "diff-viewer__marker--highlighted" : ""}`}
                style={{ top: marker.y * scale }}
                onMouseEnter={() => setHoveredId(marker.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div
                  className="diff-viewer__line"
                  style={{ backgroundColor: marker.color }}
                />
                <div
                  className="diff-viewer__label"
                  style={{ backgroundColor: `color-mix(in srgb, ${marker.color} 70%, #000)` }}
                >
                  {marker.label}
                  {marker.count > 1 && (
                    <span className="diff-viewer__label-extra">+{marker.count - 1}</span>
                  )}
                </div>
                {hoveredId === marker.id && marker.changes.length > 1 && (
                  <div className="diff-viewer__tooltip">
                    {marker.changes.map((c) => (
                      <span key={c.id} className="diff-viewer__tooltip-line">
                        {c.description}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

interface Marker {
  id: string;
  y: number;
  label: string;
  color: string;
  count: number;
  changes: SemanticChange[];
}

function dedupeMarkers(changes: SemanticChange[], scale: number): Marker[] {
  const sorted = [...changes].sort((a, b) => a.yPosition - b.yPosition);
  const markers: Marker[] = [];
  const GROUP_THRESHOLD = scale > 0 ? 30 / scale : 50;

  for (const change of sorted) {
    const lastMarker = markers[markers.length - 1];
    if (lastMarker && Math.abs(change.yPosition - lastMarker.y) < GROUP_THRESHOLD) {
      lastMarker.changes.push(change);
      lastMarker.count++;
      const primary = lastMarker.changes.sort(severityOrder)[0];
      lastMarker.label = primary.description;
      lastMarker.color = CATEGORY_COLORS[primary.category] || CATEGORY_COLOR_FALLBACK;
    } else {
      markers.push({
        id: change.id,
        y: change.yPosition,
        label: change.description,
        color: CATEGORY_COLORS[change.category] || CATEGORY_COLOR_FALLBACK,
        count: 1,
        changes: [change],
      });
    }
  }

  return markers;
}

function severityOrder(a: SemanticChange, b: SemanticChange): number {
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
}

const DiffViewer = memo(DiffViewerComponent);
DiffViewer.displayName = "DiffViewer";
export default DiffViewer;
