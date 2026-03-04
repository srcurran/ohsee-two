"use client";

import { BREAKPOINTS } from "@/lib/constants";

interface Props {
  active: number;
  onChange: (bp: number) => void;
}

export default function BreakpointTabs({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-[24px] border-b border-black/20 bg-white px-[140px] py-[20px]">
      {BREAKPOINTS.map((bp) => (
        <button
          key={bp}
          onClick={() => onChange(bp)}
          className={`text-[14px] text-black ${
            active === bp ? "font-bold" : "font-normal"
          }`}
        >
          {bp}px
        </button>
      ))}
    </div>
  );
}
