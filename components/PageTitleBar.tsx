"use client";

import { useSidebar } from "./SidebarProvider";

// Matches the sidebar widths in components/Sidebar.tsx. Kept in sync manually;
// if you change either, change both. main has pr-[12px] which we mirror as
// the right inset so the title centers over the white card, not the gap.
const SIDEBAR_WIDTH_OPEN = 240;
const MAIN_RIGHT_PADDING = 12;

/**
 * Centered title rendered in the 36px blank space above <main>. Centered
 * over the white `<main>` content area, not the full window — so it doesn't
 * drift left when the sidebar is open.
 */
export default function PageTitleBar() {
  const { pageTitle, collapsed } = useSidebar();
  if (!pageTitle) return null;

  const left = collapsed ? 0 : SIDEBAR_WIDTH_OPEN;

  return (
    <div
      aria-hidden
      style={{ left, right: MAIN_RIGHT_PADDING }}
      className="pointer-events-none fixed top-0 z-40 flex h-[36px] items-center justify-center transition-[left] duration-200"
    >
      <span className="max-w-[60%] truncate text-[13px] font-semibold text-foreground/80">
        {pageTitle}
      </span>
    </div>
  );
}
