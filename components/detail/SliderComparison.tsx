"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { SemanticChange } from "@/lib/types";

export type ComparisonMode = "slider" | "tap";

interface Props {
  prodSrc: string;
  devSrc: string;
  mode?: ComparisonMode;
  onModeChange?: (mode: ComparisonMode) => void;
  onPressedChange?: (pressed: boolean) => void;
  hideHeader?: boolean;
  /** When true, locks the view to show the dev screenshot (overrides tap hold) */
  forceDev?: boolean;
  /** Detected changes — used to scroll a clicked change into view. */
  changes?: SemanticChange[];
  /** The change to scroll into view, set when one is clicked in the sidebar. */
  highlightedChangeId?: string | null;
}

export function ComparisonHeader({
  mode,
  onModeChange,
  showingDev,
}: {
  mode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
  showingDev?: boolean;
}) {
  return (
    <div className="comparison-header">
      <span className={`comparison-header__label ${showingDev ? "" : "comparison-header__label--active"}`}>
        Prod
      </span>
      <div className="segmented">
        <button
          onClick={() => onModeChange("tap")}
          className={`segmented__item ${mode === "tap" ? "segmented__item--active" : ""}`}
        >
          Tap
        </button>
        <button
          onClick={() => onModeChange("slider")}
          className={`segmented__item ${mode === "slider" ? "segmented__item--active" : ""}`}
        >
          Slider
        </button>
      </div>
      <span className={`comparison-header__label ${showingDev ? "comparison-header__label--active" : ""}`}>
        Dev
      </span>
    </div>
  );
}

/**
 * Invisible scroll anchors — one per change, positioned by the change's page
 * Y as a fraction of the screenshot's natural height. Clicking a change in
 * the sidebar scrolls its anchor (and so the change region) into view.
 */
function ChangeAnchors({
  changes,
  naturalHeight,
  highlightedChangeId,
}: {
  changes: SemanticChange[];
  naturalHeight: number;
  highlightedChangeId?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightedChangeId || !ref.current || naturalHeight === 0) return;
    const el = ref.current.querySelector(`[data-change-id="${highlightedChangeId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedChangeId, naturalHeight]);

  if (naturalHeight === 0) return null;

  return (
    <div ref={ref} className="comparison__anchors" aria-hidden>
      {changes.map((c) => (
        <div
          key={c.id}
          data-change-id={c.id}
          className="comparison__anchor"
          style={{ top: `${(c.yPosition / naturalHeight) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default function SliderComparison({
  prodSrc,
  devSrc,
  mode: controlledMode,
  onModeChange,
  onPressedChange,
  hideHeader,
  forceDev,
  changes,
  highlightedChangeId,
}: Props) {
  const [internalMode, setInternalMode] = useState<ComparisonMode>("tap");
  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;

  // Natural pixel height of the screenshots — drives change-anchor placement.
  // Measured off-DOM so it's independent of which reveal component is mounted.
  // prod / dev / highlight all share dimensions per breakpoint, so a stale
  // value across a Diff toggle is harmless; only a breakpoint switch resizes.
  const [naturalHeight, setNaturalHeight] = useState(0);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalHeight(img.naturalHeight);
    img.src = devSrc;
    return () => {
      img.onload = null;
    };
  }, [devSrc]);

  const anchors =
    changes && changes.length > 0 ? (
      <ChangeAnchors
        changes={changes}
        naturalHeight={naturalHeight}
        highlightedChangeId={highlightedChangeId}
      />
    ) : null;

  return (
    <div>
      {!hideHeader && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <ComparisonHeader mode={mode} onModeChange={setMode} />
        </div>
      )}

      {mode === "tap" ? (
        <TapReveal prodSrc={prodSrc} devSrc={devSrc} onPressedChange={onPressedChange} forceDev={forceDev} overlay={anchors} />
      ) : (
        <SliderReveal prodSrc={prodSrc} devSrc={devSrc} overlay={anchors} />
      )}
    </div>
  );
}

function TapReveal({
  prodSrc,
  devSrc,
  onPressedChange,
  forceDev,
  overlay,
}: Props & { overlay?: React.ReactNode }) {
  const [pressed, setPressed] = useState(false);
  // When Dev is locked, a tap should reveal Prod (inverse). XOR gives both:
  // locked-on-Prod press → show Dev; locked-on-Dev press → show Prod.
  const showingDev = forceDev ? !pressed : pressed;

  const updatePressed = (val: boolean) => {
    setPressed(val);
    onPressedChange?.(forceDev ? !val : val);
  };

  return (
    <div
      className="comparison comparison--tap"
      onMouseDown={() => updatePressed(true)}
      onMouseUp={() => updatePressed(false)}
      onMouseLeave={() => updatePressed(false)}
      onTouchStart={() => updatePressed(true)}
      onTouchEnd={() => updatePressed(false)}
      onTouchCancel={() => updatePressed(false)}
    >
      <img
        src={devSrc}
        alt="Dev version"
        className="comparison__image"
        draggable={false}
        loading="lazy"
        decoding="async"
      />
      <img
        src={prodSrc}
        alt="Prod version"
        className="comparison__overlay"
        style={{ opacity: showingDev ? 0 : 1 }}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
      {overlay}
    </div>
  );
}

function SliderReveal({
  prodSrc,
  devSrc,
  overlay,
}: Props & { overlay?: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dividerPos, setDividerPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setDividerPos(pct);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onEnd = () => setIsDragging(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, handleMove]);

  return (
    <div
      ref={containerRef}
      className="comparison comparison--slider"
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      <img
        src={devSrc}
        alt="Dev version"
        className="comparison__image"
        draggable={false}
        loading="lazy"
        decoding="async"
      />

      <div className="comparison__clip" style={{ clipPath: `inset(0 ${100 - dividerPos}% 0 0)` }}>
        <img
          src={prodSrc}
          alt="Prod version"
          className="comparison__image"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="comparison__divider" style={{ left: `${dividerPos}%` }}>
        <div className="comparison__handle">
          <span>&lt;</span>
          <span>&gt;</span>
        </div>
      </div>

      {overlay}
    </div>
  );
}
