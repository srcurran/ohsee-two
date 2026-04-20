"use client";

import { useSidebar } from "./SidebarProvider";

/**
 * Sidebar collapse/expand button placed in the macOS title bar area,
 * 40px to the right of the stoplight buttons.
 *
 * The Electron window uses `titleBarStyle: "hiddenInset"` which puts the
 * traffic lights at their standard positions (close ~x=20, min ~40, zoom ~60,
 * right edge of the zoom button ~x=66). A 40px gap puts the button at ~106px.
 *
 * `-webkit-app-region: no-drag` on the button is required so clicks activate
 * it instead of initiating a window drag.
 */
export default function TitlebarCollapseButton() {
  const { collapsed, toggleCollapsed } = useSidebar();

  return (
    <button
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className="fixed left-[80px] top-[4px] z-50 flex h-[28px] w-[32px] items-center justify-center rounded-[6px] transition-colors hover:bg-foreground/10"
    >
      {collapsed ? <SidebarIconFilled /> : <SidebarIconOutlined />}
    </button>
  );
}

/**
 * Pixel-perfect icons (all axis-aligned rectangles on the integer grid),
 * hand-shaded at the corners with mid/light greys to fake anti-aliased
 * rounding. Render with `crispEdges` so the browser doesn't smear them.
 * Colors are hardcoded (not `currentColor`) because the shading relationship
 * between #333 / #A8A7A5 / #D9D9D9 is integral to the illusion.
 */

/** Shown when sidebar is OPEN — click collapses it. */
function SidebarIconOutlined() {
  return (
    <svg
      width="20"
      height="16"
      viewBox="0 0 20 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g clipPath="url(#clip0_121_82)">
        {/* Outer frame */}
        <rect x="1" width="18" height="1" fill="#333333" />
        <rect x="1" y="15" width="18" height="1" fill="#333333" />
        <rect x="20" y="1" width="14" height="1" transform="rotate(90 20 1)" fill="#333333" />
        <rect x="1" y="1" width="14" height="1" transform="rotate(90 1 1)" fill="#333333" />
        {/* Vertical divider + sidebar item lines (only in "open" state) */}
        <rect x="7" width="16" height="1" transform="rotate(90 7 0)" fill="#333333" />
        <line x1="2" y1="2.5" x2="5" y2="2.5" stroke="#A8A7A5" />
        <line x1="2" y1="4.5" x2="5" y2="4.5" stroke="#A8A7A5" />
        <line x1="2" y1="6.5" x2="5" y2="6.5" stroke="#A8A7A5" />
        {/* Outer-corner shading */}
        <rect width="1" height="1" fill="#A8A7A5" />
        <rect y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" width="1" height="1" fill="#A8A7A5" />
        {/* Inner-corner highlights */}
        <rect x="18" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="18" y="14" width="1" height="1" fill="#D9D9D9" />
      </g>
      <defs>
        <clipPath id="clip0_121_82">
          <rect width="20" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Shown when sidebar is CLOSED — click expands it. */
function SidebarIconFilled() {
  return (
    <svg
      width="20"
      height="16"
      viewBox="0 0 20 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <g clipPath="url(#clip0_121_101)">
        {/* Outer frame */}
        <rect x="1" width="18" height="1" fill="#333333" />
        <rect x="1" y="15" width="18" height="1" fill="#333333" />
        <rect x="20" y="1" width="14" height="1" transform="rotate(90 20 1)" fill="#333333" />
        <rect x="1" y="1" width="14" height="1" transform="rotate(90 1 1)" fill="#333333" />
        {/* Narrow sidebar strip divider (collapsed state) */}
        <rect x="4" width="16" height="1" transform="rotate(90 4 0)" fill="#333333" />
        {/* Outer-corner shading */}
        <rect width="1" height="1" fill="#A8A7A5" />
        <rect y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" y="15" width="1" height="1" fill="#A8A7A5" />
        <rect x="19" width="1" height="1" fill="#A8A7A5" />
        {/* Inner-corner highlights */}
        <rect x="18" y="1" width="1" height="1" fill="#D9D9D9" />
        <rect x="18" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="14" width="1" height="1" fill="#D9D9D9" />
        <rect x="1" y="1" width="1" height="1" fill="#D9D9D9" />
      </g>
      <defs>
        <clipPath id="clip0_121_101">
          <rect width="20" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
