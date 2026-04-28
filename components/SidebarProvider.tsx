"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SidebarContextValue {
  refreshKey: number;
  refreshProjects: () => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  /**
   * True once the collapsed state has been read from localStorage and committed.
   * Use this to gate the CSS transition so the sidebar doesn't animate from
   * default (open) to stored state on first mount.
   */
  ready: boolean;
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;
  /** Whether the app settings overlay is open. */
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** ID of the project whose settings overlay is open, or null if none. */
  projectSettingsId: string | null;
  openProjectSettings: (projectId: string) => void;
  closeProjectSettings: () => void;
  /** Project + test ids whose test settings overlay is open. */
  testSettings: { projectId: string; testId: string } | null;
  openTestSettings: (projectId: string, testId: string) => void;
  closeTestSettings: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  refreshKey: 0,
  refreshProjects: () => {},
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
  ready: false,
  pageTitle: null,
  setPageTitle: () => {},
  settingsOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
  projectSettingsId: null,
  openProjectSettings: () => {},
  closeProjectSettings: () => {},
  testSettings: null,
  openTestSettings: () => {},
  closeTestSettings: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

/**
 * Sets the titlebar page title for the duration of the calling component's lifetime.
 * Pass null/undefined to clear. Safe to call with a value that may still be loading —
 * it simply won't render until a non-null value is set.
 */
export function usePageTitle(title: string | null | undefined) {
  const { setPageTitle } = useContext(SidebarContext);
  useEffect(() => {
    setPageTitle(title ?? null);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
}

const STORAGE_KEY = "ohsee-sidebar-collapsed";

export default function SidebarProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [collapsed, setCollapsedState] = useState(false);
  const [ready, setReady] = useState(false);
  const [pageTitle, setPageTitleState] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);
  const [testSettings, setTestSettingsState] = useState<{ projectId: string; testId: string } | null>(null);
  const pathname = usePathname();

  const refreshProjects = useCallback(() => setRefreshKey((k) => k + 1), []);
  const setPageTitle = useCallback((title: string | null) => setPageTitleState(title), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openProjectSettings = useCallback((id: string) => setProjectSettingsId(id), []);
  const closeProjectSettings = useCallback(() => setProjectSettingsId(null), []);
  const openTestSettings = useCallback(
    (projectId: string, testId: string) => setTestSettingsState({ projectId, testId }),
    [],
  );
  const closeTestSettings = useCallback(() => setTestSettingsState(null), []);

  // Hydrate collapsed state from localStorage, then enable transitions
  useEffect(() => {
    try {
      setCollapsedState(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
    // Defer one frame so the state change is committed before we opt back into
    // CSS transitions — otherwise the state snap would animate.
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  // Persist last viewed path for home-page redirect
  useEffect(() => {
    if (pathname && pathname !== "/") {
      localStorage.setItem("ohsee-last-path", pathname);
    }
  }, [pathname]);

  return (
    <SidebarContext.Provider
      value={{
        refreshKey,
        refreshProjects,
        collapsed,
        setCollapsed,
        toggleCollapsed,
        ready,
        pageTitle,
        setPageTitle,
        settingsOpen,
        openSettings,
        closeSettings,
        projectSettingsId,
        openProjectSettings,
        closeProjectSettings,
        testSettings,
        openTestSettings,
        closeTestSettings,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
