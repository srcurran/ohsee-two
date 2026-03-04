"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  prodSrc: string;
  devSrc: string;
}

export default function SliderComparison({ prodSrc, devSrc }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dividerPos, setDividerPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setDividerPos(pct);
    },
    []
  );

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
    <div>
      <div className="mb-[8px] flex items-start justify-between text-[14px] text-black">
        <span>Prod</span>
        <span>Dev</span>
      </div>
      <div
        ref={containerRef}
        className="relative cursor-col-resize select-none overflow-hidden bg-[#9d9297]"
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
        <img
          src={devSrc}
          alt="Dev version"
          className="block w-full"
          draggable={false}
        />

        {/* Prod image (clipped to left of divider) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${dividerPos}%` }}
        >
          <img
            src={prodSrc}
            alt="Prod version"
            className="block h-full object-cover object-left"
            style={{ width: containerRef.current?.offsetWidth || "100%" }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 z-10 w-[2px] bg-white/80"
          style={{ left: `${dividerPos}%`, transform: "translateX(-1px)" }}
        >
          {/* Handle */}
          <div className="absolute top-1/2 left-1/2 flex h-[36px] w-[36px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#4b4b4b]/50 text-[14px] text-white backdrop-blur-[8.6px]">
            <span>&lt;</span>
            <span>&gt;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
