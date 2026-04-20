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
  const markers = changes ? dedupeMarkers(changes, scale) : [];

  return (
    <div>
      <div ref={containerRef} className="diff-viewer">
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="diff-viewer__image"
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
                data-change-id={marker.changes[0]?.id}
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
