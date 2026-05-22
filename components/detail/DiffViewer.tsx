"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SemanticChange } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from "@/lib/colors";

interface Props {
  /** Prod screenshot — shown (pink-tinted via highlightSrc when available)
   *  as the background for the Prod side of the toggle. */
  prodSrc: string;
  /** Dev screenshot — the default background: the change annotations sit on
   *  the version the user is building. */
  devSrc: string;
  /** Highlight image — prod with pink-tinted change regions. Used as the
   *  Prod-side background when available. */
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
  // Which version backs the annotations. Defaults to dev — the build the
  // user is working on — and clicking the image toggles to prod to compare,
  // the same gesture as the Tap view. The change markers stay on either way.
  const [showingDev, setShowingDev] = useState(true);

  // Prod side prefers the pink-tinted highlight image; dev side is plain.
  const baseSrc = showingDev ? devSrc : highlightSrc ?? prodSrc;

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
  }, [baseSrc]);

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
  // every render was the dominant cost in this view per the perf audit.
  const markers = useMemo(
    () => (changes ? dedupeMarkers(changes, scale) : []),
    [changes, scale],
  );

  return (
    <div>
      <div
        ref={containerRef}
        className="diff-viewer"
        // Click toggles the backing version, mirroring the Tap view — the
        // change markers stay overlaid on whichever side is shown.
        onClick={() => setShowingDev((s) => !s)}
      >
        <span className="diff-viewer__side-badge">
          {showingDev ? "Dev" : "Prod"}
          <span className="diff-viewer__side-badge-hint">click to compare</span>
        </span>
        <img
          ref={imgRef}
          src={baseSrc}
          alt={`${alt} (${showingDev ? "dev" : "prod"})`}
          className="diff-viewer__image diff-viewer__image--base"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
        {scale > 0 &&
          markers.map((marker) => {
            const isHighlighted = highlightedChangeId
              ? marker.changes.some((c) => c.id === highlightedChangeId)
              : false;

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
