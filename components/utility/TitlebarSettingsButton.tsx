"use client";

import { useSidebar } from "@/components/utility/SidebarProvider";
import { Icon } from "@/components/utility/Icon";

/**
 * Settings gear shown in the titlebar on the empty (no-projects) state, where
 * the sidebar — which normally houses the app-settings gear — is hidden.
 *
 * Rendered at the top level of the layout (a sibling of the titlebar drag
 * region), NOT nested in page content. `-webkit-app-region: no-drag` is only
 * honored by the macOS drag-strip compositor for elements at this layer; nested
 * inside the page it was ignored, so real mouse clicks were swallowed as window
 * drags. Mirrors TitlebarCollapseButton, which sits in the same layer.
 */
export default function TitlebarSettingsButton() {
  const { hasProjects, openSettings } = useSidebar();

  // Only on the confirmed empty state. `null` = still loading: don't flash in.
  if (hasProjects !== false) return null;

  return (
    <button
      onClick={openSettings}
      aria-label="Settings"
      title="Settings"
      className="titlebar-settings icon-btn"
    >
      <Icon name="settings" size={18} />
    </button>
  );
}
