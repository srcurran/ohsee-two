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
    <div className="flex items-center justify-between text-[14px]">
      <span className={`transition-colors duration-150 ${
        showingDev ? "text-text-muted" : "font-bold text-foreground"
      }`}>Prod</span>
      <div className="flex items-center gap-[4px] rounded-[8px] bg-surface-tertiary p-[3px]">
        <button
          onClick={() => onModeChange("tap")}
          className={`rounded-[6px] px-[10px] py-[3px] text-[12px] transition-colors ${
            mode === "tap"
              ? "bg-surface-content font-bold shadow-sm"
              : "text-text-muted hover:text-foreground"
          }`}
        >
          Tap
        </button>
        <button
          onClick={() => onModeChange("slider")}
          className={`rounded-[6px] px-[10px] py-[3px] text-[12px] transition-colors ${
            mode === "slider"
              ? "bg-surface-content font-bold shadow-sm"
              : "text-text-muted hover:text-foreground"
          }`}
        >
          Slider
        </button>
      </div>
      <span className={`transition-colors duration-150 ${
        showingDev ? "font-bold text-foreground" : "text-text-muted"
      }`}>Dev</span>
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
        <div className="mb-[8px]">
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

/* ── Tap to reveal ────────────────────────────────────────────── */

function TapReveal({ prodSrc, devSrc, onPressedChange, forceDev }: Props) {
  const [pressed, setPressed] = useState(false);
  const showingDev = forceDev || pressed;

  const updatePressed = (val: boolean) => {
    setPressed(val);
    onPressedChange?.(forceDev || val);
  };

  return (
    <div
      className="relative cursor-pointer select-none overflow-hidden bg-surface-comparison"
      onMouseDown={() => updatePressed(true)}
      onMouseUp={() => updatePressed(false)}
      onMouseLeave={() => updatePressed(false)}
      onTouchStart={() => updatePressed(true)}
      onTouchEnd={() => updatePressed(false)}
      onTouchCancel={() => updatePressed(false)}
    >
      <img src={devSrc} alt="Dev version" className="block w-full" draggable={false} />
      <img
        src={prodSrc}
        alt="Prod version"
        className="absolute inset-0 block w-full transition-opacity duration-150"
        style={{ opacity: showingDev ? 0 : 1 }}
        draggable={false}
      />
    </div>
  );
}

/* ── Slider ───────────────────────────────────────────────────── */

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
      className="relative cursor-col-resize select-none overflow-hidden bg-surface-comparison"
      onMouseDown={(e) => {
        setIsDragging(true);
        handleMove(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      {/* Dev image (full, behind) */}
      <img src={devSrc} alt="Dev version" className="block w-full" draggable={false} />

      {/* Prod image (clipped to left of divider) */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - dividerPos}% 0 0)` }}>
        <img src={prodSrc} alt="Prod version" className="block w-full" draggable={false} />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 z-10 w-[2px] bg-white/80"
        style={{ left: `${dividerPos}%`, transform: "translateX(-1px)" }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-[36px] w-[36px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slider-handle text-[14px] text-white backdrop-blur-[8.6px]">
          <span>&lt;</span>
          <span>&gt;</span>
        </div>
      </div>
    </div>
  );
}
