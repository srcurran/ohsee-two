"use client";

import { useRef, useState, useEffect } from "react";
import type { SemanticChange } from "@/lib/types";
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from "@/lib/colors";

interface Props {
  src: string;
  alt?: string;
  changes?: SemanticChange[];
  highlightedChangeId?: string | null;
}

export default function DiffViewer({
  src,
  alt = "Diff view",
  changes,
  highlightedChangeId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [renderedHeight, setRenderedHeight] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
  }, [src]);

  // Scroll to highlighted marker when it changes
  useEffect(() => {
    if (!highlightedChangeId || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-change-id="${highlightedChangeId}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedChangeId]);

  const scale = naturalHeight > 0 ? renderedHeight / naturalHeight : 0;

  // Group changes that are very close in Y position to avoid overlapping markers
  const markers = changes
    ? dedupeMarkers(changes, scale)
    : [];

  return (
    <div>
      <div ref={containerRef} className="relative overflow-auto border border-border-primary">
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="w-full"
          draggable={false}
        />
        {/* Overlay markers */}
        {scale > 0 &&
          markers.map((marker) => {
            // Check if any change in this marker group is highlighted
            const isHighlighted = highlightedChangeId
              ? marker.changes.some((c) => c.id === highlightedChangeId)
              : false;

            return (
              <div
                key={marker.id}
                data-change-id={marker.changes[0]?.id}
                className={`group absolute left-0 right-0 transition-opacity ${
                  isHighlighted ? "z-30" : ""
                }`}
                style={{ top: marker.y * scale }}
                onMouseEnter={() => setHoveredId(marker.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Horizontal line */}
                <div
                  className={`absolute left-0 right-0 transition-all ${
                    isHighlighted ? "h-[3px] opacity-100" : "h-[2px] opacity-60"
                  }`}
                  style={{ backgroundColor: marker.color }}
                />
                {/* Label pill */}
                <div
                  className={`absolute left-[8px] z-10 max-w-[90%] -translate-y-full rounded-[4px] leading-tight text-white transition-all duration-300 origin-left ${
                    isHighlighted
                      ? "scale-[1.2] px-[10px] py-[4px] text-[13px] shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                      : "px-[8px] py-[3px] text-[11px] shadow-sm"
                  }`}
                  style={{ backgroundColor: marker.color }}
                >
                  {marker.label}
                  {marker.count > 1 && (
                    <span className="ml-[4px] opacity-70">+{marker.count - 1}</span>
                  )}
                </div>
                {/* Expanded tooltip on hover */}
                {hoveredId === marker.id && marker.changes.length > 1 && (
                  <div
                    className="absolute left-[8px] top-[4px] z-20 flex max-w-[80%] flex-col gap-[2px] rounded-[6px] bg-black/90 px-[10px] py-[6px] shadow-lg"
                  >
                    {marker.changes.map((c) => (
                      <span key={c.id} className="text-[11px] leading-tight text-white/90">
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
  y: number; // natural image Y coordinate
  label: string;
  color: string;
  count: number;
  changes: SemanticChange[];
}

/**
 * Group changes that are within 30 rendered pixels of each other
 * to avoid overlapping marker labels.
 */
function dedupeMarkers(changes: SemanticChange[], scale: number): Marker[] {
  const sorted = [...changes].sort((a, b) => a.yPosition - b.yPosition);
  const markers: Marker[] = [];
  const GROUP_THRESHOLD = scale > 0 ? 30 / scale : 50; // 30 rendered px

  for (const change of sorted) {
    const lastMarker = markers[markers.length - 1];
    if (lastMarker && Math.abs(change.yPosition - lastMarker.y) < GROUP_THRESHOLD) {
      // Merge into existing marker
      lastMarker.changes.push(change);
      lastMarker.count++;
      // Update label to the most severe change in the group
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
