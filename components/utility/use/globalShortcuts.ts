/** App-global keyboard shortcuts, registered once from the always-mounted
 * Sidebar (so they work on every authenticated screen):
 *
 *   Cmd/Ctrl + Opt + ↑ / ↓  — move to the previous / next test, walking the
 *                             same flattened order the sidebar shows (every
 *                             project's tests, across sites). Clamps at the
 *                             ends. With nothing open it enters from the
 *                             nearest end.
 *   Cmd/Ctrl + N            — new test in the current project (falls back to
 *                             the first project when nothing is in context).
 *   Cmd/Ctrl + Shift + N    — new site.
 *   Cmd/Ctrl + ,            — current test's settings.
 *   Cmd/Ctrl + Shift + ,    — current site's settings.
 *   Cmd/Ctrl + .            — toggle the sidebar.
 *   Cmd/Ctrl + /            — toggle the shortcuts cheat sheet.
 *
 * Suppressed while an editable field is focused — Cmd+Opt+↑/↓ is the
 * add-cursor binding and Cmd+/ the comment toggle in the CodeMirror script
 * editor, and we don't want to hijack form typing. Latest values are read
 * through a ref so the listener is attached just once. */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Project, Report, SiteTest } from "@/lib/types";
import {
  getTestWithLatestReport,
  sortTestsForSidebar,
  type ProjectWithReports,
} from "@/components/utility/utils/sidebar";

interface UseGlobalShortcutsArgs {
  /** Non-archived projects with their reports, in sidebar order. */
  data: ProjectWithReports[];
  /** Navigate to a test — same behavior as clicking it in the sidebar. */
  onNavigateTest: (test: SiteTest, project: Project, reports: Report[]) => void;
  openNewTestWizard: (projectId: string) => void;
  openNewProjectWizard: () => void;
  openTestSettings: (projectId: string, testId: string) => void;
  openProjectSettings: (projectId: string) => void;
  toggleSidebar: () => void;
  toggleShortcuts: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    !!el.closest?.(".cm-editor")
  );
}

export function useGlobalShortcuts({
  data,
  onNavigateTest,
  openNewTestWizard,
  openNewProjectWizard,
  openTestSettings,
  openProjectSettings,
  toggleSidebar,
  toggleShortcuts,
}: UseGlobalShortcutsArgs): void {
  const pathname = usePathname();

  // Flatten to the sidebar's order: projects in order, each project's
  // non-archived tests in sidebar sort order.
  const flatTests = data.flatMap(({ project, reports }) =>
    sortTestsForSidebar(
      (project.tests || [])
        .filter((t) => !t.archived)
        .map((t) => getTestWithLatestReport(t, reports)),
    ).map((twr) => ({ test: twr.test, project, reports })),
  );

  // Which test is open right now (by route), and the project in context.
  const currentIndex = flatTests.findIndex(
    ({ test, project, reports }) =>
      reports
        .filter((r) => r.siteTestId === test.id)
        .some((r) => pathname.startsWith(`/reports/${r.id}`)) ||
      pathname.startsWith(`/projects/${project.id}/tests/${test.id}`),
  );
  const activeProjectId =
    (currentIndex >= 0 ? flatTests[currentIndex].project.id : null) ??
    data.find(
      ({ project, reports }) =>
        pathname.startsWith(`/projects/${project.id}`) ||
        reports.some((r) => pathname.startsWith(`/reports/${r.id}`)),
    )?.project.id ??
    data[0]?.project.id ??
    null;

  // The test whose settings Cmd+, opens: the one currently open, else the
  // first test of the project in context.
  const targetTest =
    (currentIndex >= 0 ? flatTests[currentIndex] : null) ??
    flatTests.find((t) => t.project.id === activeProjectId) ??
    null;

  const latest = useRef({
    flatTests,
    currentIndex,
    activeProjectId,
    targetTest,
    onNavigateTest,
    openNewTestWizard,
    openNewProjectWizard,
    openTestSettings,
    openProjectSettings,
    toggleSidebar,
    toggleShortcuts,
  });
  useEffect(() => {
    latest.current = {
      flatTests,
      currentIndex,
      activeProjectId,
      targetTest,
      onNavigateTest,
      openNewTestWizard,
      openNewProjectWizard,
      openTestSettings,
      openProjectSettings,
      toggleSidebar,
      toggleShortcuts,
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isEditableTarget(e.target)) return;
      const {
        flatTests,
        currentIndex,
        activeProjectId,
        targetTest,
        onNavigateTest,
        openNewTestWizard,
        openNewProjectWizard,
        openTestSettings,
        openProjectSettings,
        toggleSidebar,
        toggleShortcuts,
      } = latest.current;

      // Cmd/Ctrl + / — toggle the shortcuts cheat sheet.
      if (!e.altKey && (e.code === "Slash" || e.key === "/" || e.key === "?")) {
        e.preventDefault();
        toggleShortcuts();
        return;
      }
      // Cmd/Ctrl + . — toggle the sidebar.
      if (!e.shiftKey && !e.altKey && (e.code === "Period" || e.key === ".")) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      // Cmd/Ctrl + Shift + , — current site's settings.
      if (e.shiftKey && !e.altKey && (e.code === "Comma" || e.key === "," || e.key === "<")) {
        if (!activeProjectId) return;
        e.preventDefault();
        openProjectSettings(activeProjectId);
        return;
      }
      // Cmd/Ctrl + , — current test's settings.
      if (!e.shiftKey && !e.altKey && (e.code === "Comma" || e.key === ",")) {
        if (!targetTest) return;
        e.preventDefault();
        openTestSettings(targetTest.project.id, targetTest.test.id);
        return;
      }
      // Cmd/Ctrl + Shift + N — new site.
      if (e.shiftKey && !e.altKey && e.code === "KeyN") {
        e.preventDefault();
        openNewProjectWizard();
        return;
      }
      // Cmd/Ctrl + N — new test in the current (or first) project.
      if (!e.shiftKey && !e.altKey && e.code === "KeyN") {
        if (!activeProjectId) return;
        e.preventDefault();
        openNewTestWizard(activeProjectId);
        return;
      }
      // Cmd/Ctrl + Opt + ↑ / ↓ — previous / next test across sites.
      if (e.altKey && !e.shiftKey && (e.code === "ArrowUp" || e.code === "ArrowDown")) {
        if (flatTests.length === 0) return;
        e.preventDefault();
        const dir = e.code === "ArrowUp" ? -1 : 1;
        let next: number;
        if (currentIndex < 0) {
          next = dir === 1 ? 0 : flatTests.length - 1;
        } else {
          next = currentIndex + dir;
          if (next < 0 || next >= flatTests.length) return; // clamp at the ends
        }
        const t = flatTests[next];
        onNavigateTest(t.test, t.project, t.reports);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
