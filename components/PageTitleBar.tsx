"use client";

import { useSidebar } from "./SidebarProvider";

// Matches sidebar widths in components/Sidebar.tsx.
const SIDEBAR_WIDTH_OPEN = 240;
const MAIN_RIGHT_PADDING = 12;

export default function PageTitleBar() {
  const { pageTitle, collapsed } = useSidebar();
  if (!pageTitle) return null;

  const left = collapsed ? 0 : SIDEBAR_WIDTH_OPEN;

  return (
    <div
      aria-hidden
      style={{ left, right: MAIN_RIGHT_PADDING }}
      className="page-title-bar"
    >
      <span className="page-title-bar__label">{pageTitle}</span>
    </div>
  );
}
