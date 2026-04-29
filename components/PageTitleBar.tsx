"use client";

import { useSidebar } from "./SidebarProvider";

// Matches sidebar widths in components/Sidebar.tsx.
const SIDEBAR_WIDTH_OPEN = 240;
const MAIN_RIGHT_PADDING = 12;

export default function PageTitleBar() {
  const { pageTitle, pageHeader, collapsed } = useSidebar();
  if (!pageHeader && !pageTitle) return null;

  const left = collapsed ? 0 : SIDEBAR_WIDTH_OPEN;

  if (pageHeader) {
    return (
      <div
        style={{ left, right: MAIN_RIGHT_PADDING }}
        className="page-title-bar page-title-bar--custom"
      >
        {pageHeader}
      </div>
    );
  }

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
