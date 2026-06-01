"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/components/utility/SidebarProvider";
import { SidebarGroup } from "@/components/utility/SidebarGroup";
import { Icon } from "@/components/utility/Icon";
import { useSidebarData } from "@/components/utility/use/sidebarData";
import { useProjectDrag } from "@/components/utility/use/projectDrag";
import type { Project, Report, SiteTest } from "@/lib/types";

/** Top-level sidebar shell. Composes data + drag hooks with the project-
 * group component and adds the bottom-bar settings affordance. Almost no
 * logic lives here — see `./sidebar/*` for the hooks and child views. */
export default function Sidebar() {
  const {
    refreshKey,
    refreshProjects,
    collapsed,
    ready,
    openSettings,
    openProjectSettings,
    openTestSettings,
    openNewProjectWizard,
    openNewTestWizard,
    setHasProjects,
  } = useSidebar();
  const router = useRouter();

  const { data, setData, loading } = useSidebarData({ refreshKey, refreshProjects });
  const drag = useProjectDrag({ data, setData });

  // useCallback so SidebarGroup (once memo'd) doesn't rerender on every
  // parent render. Only depends on the stable router instance.
  const handleProjectClick = useCallback(
    (project: Project, reports: Report[]) => {
      if (reports.length > 0) {
        router.push(`/reports/${reports[0].id}`);
      } else {
        router.push(`/projects/${project.id}`);
      }
    },
    [router],
  );

  const handleTestClick = useCallback(
    (test: SiteTest, project: Project, reports: Report[]) => {
      const testReports = reports
        .filter((r) => r.siteTestId === test.id)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      if (testReports.length > 0) {
        router.push(`/reports/${testReports[0].id}`);
      } else {
        router.push(`/projects/${project.id}/tests/${test.id}`);
      }
    },
    [router],
  );

  const visibleData = useMemo(
    () => data.filter(({ project }) => !project.archived),
    [data],
  );

  useEffect(() => {
    if (!loading) setHasProjects(visibleData.length > 0);
  }, [loading, visibleData.length, setHasProjects]);

  if (!loading && visibleData.length === 0) return null;

  const stateMod = collapsed ? "sidebar--collapsed" : "sidebar--expanded";
  const transitionMod = ready ? "sidebar--animated" : "";

  return (
    <aside className={`sidebar  ${stateMod} ${transitionMod}`}>
      <nav className="sidebar__nav">
        {/* Skip the inner content while collapsed OR while the initial
         * fetch is in flight — otherwise the rail flashes a misleading
         * lone "+ Add new site" CTA before the project list arrives. */}
        {!collapsed && !loading && (
          <>
            {visibleData.map(({ project, reports }, index) => (
              <SidebarGroup
                key={project.id}
                project={project}
                reports={reports}
                index={index}
                onProjectClick={handleProjectClick}
                onTestClick={handleTestClick}
                onAddTest={openNewTestWizard}
                onOpenProjectSettings={openProjectSettings}
                onOpenTestSettings={openTestSettings}
                onDragStart={drag.onDragStart}
                onDragEnter={drag.onDragEnter}
                onDragOver={drag.onDragOver}
                onDragEnd={drag.onDragEnd}
              />
            ))}

            <button
              onClick={openNewProjectWizard}
              className="sidebar__add-site"
            >
              <span className="sidebar__plus">+</span>
              <span className="sidebar__add-label">Add new site</span>
            </button>
          </>
        )}
      </nav>

      <div className="sidebar__footer-row">
        <button
          onClick={openSettings}
          aria-label="Settings"
          title="Settings"
          className="icon-btn"
        >
          <Icon name="settings" size={16} />
        </button>
      </div>
    </aside>
  );
}
