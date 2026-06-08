"use client";

import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import SidebarProvider, { useSidebar } from "@/components/utility/SidebarProvider";
import Sidebar from "@/components/utility/Sidebar";
import ShortcutsOverlay from "@/components/utility/ShortcutsOverlay";
import TitlebarCollapseButton from "@/components/utility/TitlebarCollapseButton";
import PageTitleBar from "@/components/utility/PageTitleBar";

/* Overlays + wizards are lazy-loaded. Each is only mounted when the
 * user opens it via the sidebar context (Host components below) so
 * the initial bundle doesn't pay for them — particularly the test
 * settings overlay, which transitively pulls in CodeMirror via
 * ScriptStepEditor (~3MB). */
const SettingsOverlay = dynamic(
  () => import("@/components/settings/SettingsOverlay"),
  { ssr: false },
);
const ProjectSettingsOverlay = dynamic(
  () => import("@/components/settings/ProjectSettingsOverlay"),
  { ssr: false },
);
const TestSettingsOverlay = dynamic(
  () => import("@/components/settings/TestSettingsOverlay"),
  { ssr: false },
);
const NewProjectWizard = dynamic(
  () => import("@/components/settings/NewProjectWizard"),
  { ssr: false },
);
const NewTestWizard = dynamic(
  () => import("@/components/settings/NewTestWizard"),
  { ssr: false },
);

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="app-shell app-shell--flat">
        <SidebarProvider>
          {/* Transparent strip across the macOS hiddenInset titlebar area
              so the window can be dragged by clicking anywhere up there.
              Interactive children (e.g. TitlebarCollapseButton) opt out via
              `-webkit-app-region: no-drag`. Render first so it sits below
              the collapse button and page title in stacking order. */}
          <div aria-hidden className="titlebar-drag-region" />
          <TitlebarCollapseButton />
          <PageTitleBar />
          <Sidebar />
          <SidebarScrim />
          <MainFrame>{children}</MainFrame>
          <SettingsHost />
          <ProjectSettingsHost />
          <TestSettingsHost />
          <NewProjectWizardHost />
          <NewTestWizardHost />
          <ShortcutsOverlay />
        </SidebarProvider>
      </div>
    </SessionProvider>
  );
}

/** Defer SettingsOverlay's lazy chunk until the user actually opens
 *  the global settings overlay. */
function SettingsHost() {
  const { settingsOpen } = useSidebar();
  if (!settingsOpen) return null;
  return <SettingsOverlay />;
}

/** Subscribes to projectSettingsId from the sidebar context and mounts
 *  ProjectSettingsOverlay only while that ID is set. Splitting this out
 *  keeps useSidebar() out of the layout's outer scope (it lives outside
 *  SidebarProvider). */
function ProjectSettingsHost() {
  const { projectSettingsId, closeProjectSettings } = useSidebar();
  if (!projectSettingsId) return null;
  return (
    <ProjectSettingsOverlay
      projectId={projectSettingsId}
      onClose={closeProjectSettings}
    />
  );
}

/** Mounts the per-test settings overlay only while a test is selected via
 *  openTestSettings. Sibling to ProjectSettingsHost. */
function TestSettingsHost() {
  const { testSettings, closeTestSettings } = useSidebar();
  if (!testSettings) return null;
  return (
    <TestSettingsOverlay
      projectId={testSettings.projectId}
      testId={testSettings.testId}
      onClose={closeTestSettings}
    />
  );
}

/** Mounts the New-Project wizard while open. On creation, hands off to the
 *  New-Test wizard pre-filled with the project's name so the two flows feel
 *  continuous. */
function NewProjectWizardHost() {
  const {
    newProjectWizardOpen,
    closeNewProjectWizard,
    refreshProjects,
    openNewTestWizard,
  } = useSidebar();
  if (!newProjectWizardOpen) return null;
  return (
    <NewProjectWizard
      onClose={closeNewProjectWizard}
      onCreated={(projectId) => {
        refreshProjects();
        closeNewProjectWizard();
        openNewTestWizard(projectId);
      }}
    />
  );
}

/** Mounts the New-Test wizard while open. */
function NewTestWizardHost() {
  const { newTestWizard, closeNewTestWizard } = useSidebar();
  if (!newTestWizard) return null;
  return (
    <NewTestWizard
      projectId={newTestWizard.projectId}
      initialName={newTestWizard.initialName}
      testId={newTestWizard.testId}
      onClose={closeNewTestWizard}
    />
  );
}

/** Flatter shell: main is plain white, and the inner scroll container carries
 *  no rounding/shadow/background — just overflow behavior. */
function MainFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-main app-main--flat">
      <div className="app-main__scroll">{children}</div>
    </main>
  );
}

/** Backdrop visible only when the sidebar is expanded at a narrow viewport
 *  (CSS handles the viewport gate via @media). Click collapses the sidebar
 *  so the user can dismiss the overlay by tapping outside it. */
function SidebarScrim() {
  const { collapsed, setCollapsed } = useSidebar();
  return (
    <div
      aria-hidden
      className={`sidebar-scrim ${collapsed ? "" : "sidebar-scrim--visible"}`}
      onClick={() => setCollapsed(true)}
    />
  );
}
