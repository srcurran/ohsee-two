"use client";

import { useRef, useState, useEffect } from "react";
import type { SemanticChange } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from "@/lib/colors";

interface Props {
  /** Prod screenshot — rendered on top with `mix-blend-mode: difference`,
   *  so identical pixels go black and differences glow as the color delta.
   *  `mix-blend-mode: difference` is symmetric, so which image is on top
   *  doesn't change the difference math — but the bottom layer is the one
   *  that "shows through" at lower overlay opacities, so we put dev on the
   *  bottom (the user is shipping dev, that's the layer to inspect). */
  prodSrc: string;
  /** Dev screenshot — rendered as the base layer. */
  devSrc: string;
  alt?: string;
  changes?: SemanticChange[];
  highlightedChangeId?: string | null;
}

export default function DiffViewer({
  prodSrc,
  devSrc,
  alt = "Diff view",
  changes,
  highlightedChangeId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Measure the base (dev) image — both layers are aligned to identical
  // intrinsic dimensions, so one measurement drives marker positioning.
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Hide the overlay until it has actually loaded — otherwise a partly-loaded
  // dev image briefly composites against the (white) container background and
  // flashes inverted before prod paints in behind it.
  const [overlayLoaded, setOverlayLoaded] = useState(false);
  // Press-and-hold anywhere on the diff-viewer to surface the difference.
  // At rest the overlay sits at 0.2 (mostly dev with subtle change highlights
  // — readable as a real screenshot). While held it ramps to 0.8 (strong
  // difference glow over a dim dev base — easy to spot exactly what changed).
  const [peek, setPeek] = useState(false);
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

    return () => {
      img.removeEventListener("load", update);
      window.removeEventListener("resize", update);
    };
  }, [devSrc]);

  // Reset overlay-loaded gate when the prod (overlay) source changes, so a
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
  const markers = changes ? dedupeMarkers(changes, scale) : [];

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
        <img
          ref={imgRef}
          src={devSrc}
          alt={`${alt} (dev)`}
          className="diff-viewer__image diff-viewer__image--base"
          draggable={false}
        />
        <img
          src={prodSrc}
          alt={`${alt} (prod)`}
          onLoad={() => setOverlayLoaded(true)}
          /* Hybrid blend (option 5): the difference layer at <1 opacity lets
             the base (dev) image show through. Identical regions render as
             (1 - opacity) × dev (dim but readable); differences render as
             opacity × delta + (1 - opacity) × dev (the "glow" tinted by
             what's underneath). Press-and-hold toggles strength — see
             `peek` above. */
          style={{ opacity: overlayLoaded ? overlayOpacity : 0 }}
          className="diff-viewer__image diff-viewer__image--overlay"
          draggable={false}
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
                  style={{ backgroundColor: marker.color }}
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
