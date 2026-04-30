"use client";

import { useSidebar } from "./SidebarProvider";
import { IS_ELECTRON_BUILD } from "@/lib/electron";

// Matches sidebar widths in components/Sidebar.tsx.
const SIDEBAR_WIDTH_OPEN = 240;
const MAIN_RIGHT_PADDING = 12;
// When the sidebar is collapsed the title bar shares the top strip with
// the TitlebarCollapseButton (and, in Electron, the macOS stoplights).
// These offsets keep the title clear of both. Numbers come from
// _shell.scss .titlebar-collapse positioning: web at left 24px (var
// --space-6, aligning with the content rail; 32px wide); Electron at
// left 80px (32px wide, after stoplights).
const COLLAPSED_LEFT_WEB = 40;
const COLLAPSED_LEFT_ELECTRON = 80 + 32 + 8; // 120

export default function PageTitleBar() {
  const { pageTitle, pageHeader, collapsed } = useSidebar();
  if (!pageHeader && !pageTitle) return null;

  const collapsedLeft = IS_ELECTRON_BUILD
    ? COLLAPSED_LEFT_ELECTRON
    : COLLAPSED_LEFT_WEB;
  const left = collapsed ? collapsedLeft : SIDEBAR_WIDTH_OPEN;

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
