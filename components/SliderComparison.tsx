"use client";

import { useRef, useState, useCallback, useEffect } from "react";

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

export default function SliderComparison({
  prodSrc,
  devSrc,
  mode: controlledMode,
  onModeChange,
  onPressedChange,
  hideHeader,
  forceDev,
}: Props) {
  const [internalMode, setInternalMode] = useState<ComparisonMode>("tap");
  const mode = controlledMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;

  return (
    <div>
      {!hideHeader && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <ComparisonHeader mode={mode} onModeChange={setMode} />
        </div>
      )}

      {mode === "tap" ? (
        <TapReveal prodSrc={prodSrc} devSrc={devSrc} onPressedChange={onPressedChange} forceDev={forceDev} />
      ) : (
        <SliderReveal prodSrc={prodSrc} devSrc={devSrc} />
      )}
    </div>
  );
}

function TapReveal({ prodSrc, devSrc, onPressedChange, forceDev }: Props) {
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
      <img src={devSrc} alt="Dev version" className="comparison__image" draggable={false} />
      <img
        src={prodSrc}
        alt="Prod version"
        className="comparison__overlay"
        style={{ opacity: showingDev ? 0 : 1 }}
        draggable={false}
      />
    </div>
  );
}

function SliderReveal({ prodSrc, devSrc }: Props) {
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
      <img src={devSrc} alt="Dev version" className="comparison__image" draggable={false} />

      <div className="comparison__clip" style={{ clipPath: `inset(0 ${100 - dividerPos}% 0 0)` }}>
        <img src={prodSrc} alt="Prod version" className="comparison__image" draggable={false} />
      </div>

      <div className="comparison__divider" style={{ left: `${dividerPos}%` }}>
        <div className="comparison__handle">
          <span>&lt;</span>
          <span>&gt;</span>
        </div>
      </div>
    </div>
  );
}
