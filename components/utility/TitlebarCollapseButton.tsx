"use client";

import { useSidebar } from "@/components/utility/SidebarProvider";
import { Icon } from "@/components/utility/Icon";
import { IS_ELECTRON_BUILD } from "@/lib/electron";

/**
 * Sidebar collapse/expand button. Position depends on state and runtime:
 *
 * - Sidebar open (any runtime): pinned to the inside of the sidebar's right
 *   edge so it reads as the panel's own affordance.
 * - Sidebar collapsed, Electron: sits ~40px right of the macOS stoplight
 *   buttons (titleBarStyle: "hiddenInset" places them around x=66).
 * - Sidebar collapsed, web: sits in the top-right corner.
 *
 * Transitions between positions are gated on the sidebar's `ready` flag so
 * the button doesn't animate from a default position to its stored state on
 * first paint.
 *
 * `-webkit-app-region: no-drag` (set in CSS) ensures clicks activate the
 * button instead of initiating a window drag in Electron.
 */
export default function TitlebarCollapseButton() {
  const { collapsed, toggleCollapsed, ready } = useSidebar();

  const stateMod = collapsed
    ? IS_ELECTRON_BUILD
      ? "titlebar-collapse--collapsed-electron"
      : "titlebar-collapse--collapsed-web"
    : "titlebar-collapse--open";
  const animatedMod = ready ? "titlebar-collapse--animated" : "";

  return (
    <button
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={`titlebar-collapse ${stateMod} ${animatedMod}`}
    >
      {collapsed ? <SidebarIconFilled /> : <SidebarIconOutlined />}
    </button>
  );
}

/** Shown when sidebar is OPEN — click collapses it. */
function SidebarIconOutlined() {
  return <Icon name="sidebar-expanded" size={{ width: 20, height: 16 }} />;
}

/** Shown when sidebar is CLOSED — click expands it. */
function SidebarIconFilled() {
  return <Icon name="sidebar-collapsed" size={{ width: 20, height: 16 }} />;
}
