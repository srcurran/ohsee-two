"use client";

import { SessionProvider } from "next-auth/react";
import SidebarProvider, { useSidebar } from "@/components/SidebarProvider";
import Sidebar from "@/components/Sidebar";
import SettingsOverlay from "@/components/SettingsOverlay";
import ProjectSettingsOverlay from "@/components/ProjectSettingsOverlay";
import TestSettingsOverlay from "@/components/TestSettingsOverlay";
import NewProjectWizard from "@/components/NewProjectWizard";
import NewTestWizard from "@/components/NewTestWizard";
import TitlebarCollapseButton from "@/components/TitlebarCollapseButton";
import PageTitleBar from "@/components/PageTitleBar";

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
          <SettingsOverlay />
          <ProjectSettingsHost />
          <TestSettingsHost />
          <NewProjectWizardHost />
          <NewTestWizardHost />
        </SidebarProvider>
      </div>
    </SessionProvider>
  );
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
