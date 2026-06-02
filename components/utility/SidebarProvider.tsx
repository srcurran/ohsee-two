"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
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
  /** Custom titlebar content (rendered inside the 36px drag region).
   *  When set, takes precedence over pageTitle in PageTitleBar. */
  pageHeader: ReactNode;
  setPageHeader: (node: ReactNode) => void;
  /** Whether the app settings overlay is open. */
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** ID of the project whose settings overlay is open, or null if none. */
  projectSettingsId: string | null;
  openProjectSettings: (projectId: string) => void;
  closeProjectSettings: () => void;
  /** ID of the project whose sign-in (auth) profiles overlay is open. */
  authProfilesProjectId: string | null;
  openAuthProfiles: (projectId: string) => void;
  closeAuthProfiles: () => void;
  /** Project + test ids whose test settings overlay is open. */
  testSettings: { projectId: string; testId: string } | null;
  openTestSettings: (projectId: string, testId: string) => void;
  closeTestSettings: () => void;
  /** New-project wizard state (null = not open). */
  newProjectWizardOpen: boolean;
  openNewProjectWizard: () => void;
  closeNewProjectWizard: () => void;
  /** New-test wizard state — projectId, an optional pre-filled name (set
   *  during the project→test handoff), and an optional testId to resume an
   *  in-progress draft via "Finish creating test". */
  newTestWizard: { projectId: string; initialName?: string; testId?: string } | null;
  openNewTestWizard: (
    projectId: string,
    opts?: { initialName?: string; testId?: string },
  ) => void;
  closeNewTestWizard: () => void;
  /** null = still loading, false = zero projects, true = has projects. */
  hasProjects: boolean | null;
  setHasProjects: (v: boolean | null) => void;
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
  pageHeader: null,
  setPageHeader: () => {},
  settingsOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
  projectSettingsId: null,
  openProjectSettings: () => {},
  closeProjectSettings: () => {},
  authProfilesProjectId: null,
  openAuthProfiles: () => {},
  closeAuthProfiles: () => {},
  testSettings: null,
  openTestSettings: () => {},
  closeTestSettings: () => {},
  newProjectWizardOpen: false,
  openNewProjectWizard: () => {},
  closeNewProjectWizard: () => {},
  newTestWizard: null,
  openNewTestWizard: () => {},
  closeNewTestWizard: () => {},
  hasProjects: null,
  setHasProjects: () => {},
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

/**
 * Sets a custom titlebar header (rendered inside the 36px drag region) for
 * the duration of the calling component's lifetime. Pass null to clear.
 */
export function usePageHeader(node: ReactNode) {
  const { setPageHeader } = useContext(SidebarContext);
  useEffect(() => {
    setPageHeader(node);
    return () => setPageHeader(null);
  }, [node, setPageHeader]);
}

const STORAGE_KEY = "ohsee-sidebar-collapsed";

export default function SidebarProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [collapsed, setCollapsedState] = useState(false);
  const [ready, setReady] = useState(false);
  const [pageTitle, setPageTitleState] = useState<string | null>(null);
  const [pageHeader, setPageHeaderState] = useState<ReactNode>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);
  const [authProfilesProjectId, setAuthProfilesProjectId] = useState<string | null>(null);
  const [testSettings, setTestSettingsState] = useState<{ projectId: string; testId: string } | null>(null);
  const [newProjectWizardOpen, setNewProjectWizardOpen] = useState(false);
  const [newTestWizard, setNewTestWizardState] = useState<{ projectId: string; initialName?: string; testId?: string } | null>(null);
  const [hasProjects, setHasProjects] = useState<boolean | null>(null);
  const pathname = usePathname();

  // Coalesce rapid refreshProjects() calls into one refetch. Multiple
  // surfaces (sidebar poll, report poll completion, settings save,
  // wizard finish) can fire this within tens of ms; without coalescing
  // each becomes its own N+1 refetch storm.
  const refreshPendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshProjects = useCallback(() => {
    if (refreshPendingRef.current) return;
    refreshPendingRef.current = setTimeout(() => {
      refreshPendingRef.current = null;
      setRefreshKey((k) => k + 1);
    }, 100);
  }, []);
  useEffect(
    () => () => {
      if (refreshPendingRef.current) clearTimeout(refreshPendingRef.current);
    },
    [],
  );
  const setPageTitle = useCallback((title: string | null) => setPageTitleState(title), []);
  const setPageHeader = useCallback((node: ReactNode) => setPageHeaderState(node), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openProjectSettings = useCallback((id: string) => setProjectSettingsId(id), []);
  const closeProjectSettings = useCallback(() => setProjectSettingsId(null), []);
  const openAuthProfiles = useCallback((id: string) => setAuthProfilesProjectId(id), []);
  const closeAuthProfiles = useCallback(() => setAuthProfilesProjectId(null), []);
  const openTestSettings = useCallback(
    (projectId: string, testId: string) => setTestSettingsState({ projectId, testId }),
    [],
  );
  const closeTestSettings = useCallback(() => setTestSettingsState(null), []);
  const openNewProjectWizard = useCallback(() => setNewProjectWizardOpen(true), []);
  const closeNewProjectWizard = useCallback(() => setNewProjectWizardOpen(false), []);
  const openNewTestWizard = useCallback(
    (projectId: string, opts?: { initialName?: string; testId?: string }) =>
      setNewTestWizardState({ projectId, ...opts }),
    [],
  );
  const closeNewTestWizard = useCallback(() => setNewTestWizardState(null), []);

  // Hydrate collapsed state from localStorage, then enable transitions.
  // Narrow viewports always start collapsed regardless of stored prefs —
  // the desktop preference shouldn't follow the user onto a narrow window
  // where an open sidebar would cover the content.
  useEffect(() => {
    const NARROW_QUERY = "(max-width: 1024px)";
    const isNarrow =
      typeof window !== "undefined" &&
      window.matchMedia(NARROW_QUERY).matches;

    if (isNarrow) {
      setCollapsedState(true);
    } else {
      try {
        setCollapsedState(localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // ignore
      }
    }

    // Re-collapse whenever the viewport becomes narrow (e.g. window resize),
    // and restore the stored preference when it widens again.
    const mm = window.matchMedia(NARROW_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setCollapsedState(true);
      } else {
        try {
          setCollapsedState(localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
          // ignore
        }
      }
    };
    mm.addEventListener("change", handler);

    // Defer one frame so the state change is committed before we opt back into
    // CSS transitions — otherwise the state snap would animate.
    const raf = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(raf);
      mm.removeEventListener("change", handler);
    };
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

  // Memoize the context value so consumers don't re-render every
  // time SidebarProvider itself re-renders (e.g. on each pathname
  // change). The action callbacks are all `useCallback`'d above so
  // they're stable references; the state primitives change only when
  // their respective setters fire.
  const value = useMemo(
    () => ({
      refreshKey,
      refreshProjects,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      ready,
      pageTitle,
      setPageTitle,
      pageHeader,
      setPageHeader,
      settingsOpen,
      openSettings,
      closeSettings,
      projectSettingsId,
      openProjectSettings,
      closeProjectSettings,
      authProfilesProjectId,
      openAuthProfiles,
      closeAuthProfiles,
      testSettings,
      openTestSettings,
      closeTestSettings,
      newProjectWizardOpen,
      openNewProjectWizard,
      closeNewProjectWizard,
      newTestWizard,
      openNewTestWizard,
      closeNewTestWizard,
      hasProjects,
      setHasProjects,
    }),
    [
      refreshKey,
      refreshProjects,
      collapsed,
      setCollapsed,
      toggleCollapsed,
      ready,
      pageTitle,
      setPageTitle,
      pageHeader,
      setPageHeader,
      settingsOpen,
      openSettings,
      closeSettings,
      projectSettingsId,
      openProjectSettings,
      closeProjectSettings,
      authProfilesProjectId,
      openAuthProfiles,
      closeAuthProfiles,
      testSettings,
      openTestSettings,
      closeTestSettings,
      newProjectWizardOpen,
      openNewProjectWizard,
      closeNewProjectWizard,
      newTestWizard,
      openNewTestWizard,
      closeNewTestWizard,
      hasProjects,
      setHasProjects,
    ],
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}
