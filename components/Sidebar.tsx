"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "./SidebarProvider";
import NewProjectOverlay from "./NewProjectOverlay";
import ProjectFavicon from "./ProjectFavicon";
import { reportDotModifier } from "@/lib/colors";
import { formatRelativeTimeShort } from "@/lib/relative-time";
import type { Project, SiteTest, Report } from "@/lib/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface ProjectWithReports {
  project: Project;
  reports: Report[];
}

function getTestWithLatestReport(test: SiteTest, reports: Report[]) {
  const testReports = reports
    .filter((r) => r.siteTestId === test.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { test, latestReport: testReports[0] || null };
}

const MAX_VISIBLE_TESTS = 3;

export default function Sidebar() {
  const { refreshKey, refreshProjects, collapsed, ready, openSettings, openTestSettings } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [projRes, settingsRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      if (!projRes.ok || cancelled) return;
      const projects: Project[] = await projRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const projectOrder: string[] = settings.projectOrder || [];

      const items = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`, { cache: "no-store" });
          const reports: Report[] = rRes.ok ? await rRes.json() : [];
          return { project, reports };
        })
      );
      if (cancelled) return;

      items.sort((a, b) => {
        const aIdx = projectOrder.indexOf(a.project.id);
        const bIdx = projectOrder.indexOf(b.project.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return new Date(b.project.createdAt).getTime() - new Date(a.project.createdAt).getTime();
      });

      setData(items);
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const hasRunningReport = data.some(({ reports }) =>
    reports.some((r) => r.status === "running")
  );
  useEffect(() => {
    if (!hasRunningReport) return;
    const interval = setInterval(refreshProjects, 3000);
    return () => clearInterval(interval);
  }, [hasRunningReport, refreshProjects]);

  const isTestActive = (test: SiteTest, reports: Report[]) => {
    const testReports = reports.filter((r) => r.siteTestId === test.id);
    return testReports.some((r) => pathname.startsWith(`/reports/${r.id}`));
  };

  const handleProjectClick = (project: Project, reports: Report[]) => {
    if (reports.length > 0) {
      router.push(`/reports/${reports[0].id}`);
    } else {
      router.push(`/projects/${project.id}`);
    }
  };

  const handleTestClick = (test: SiteTest, project: Project, reports: Report[]) => {
    const testReports = reports
      .filter((r) => r.siteTestId === test.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (testReports.length > 0) {
      router.push(`/reports/${testReports[0].id}`);
    } else {
      router.push(`/projects/${project.id}/tests/${test.id}`);
    }
  };

  const saveProjectOrder = (items: ProjectWithReports[]) => {
    const order = items.filter(({ project }) => !project.archived).map(({ project }) => project.id);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectOrder: order }),
    });
  };

  const handleDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || index === dragIndex) return;
    setDragOverIndex(index);
    setData((prev) => {
      const next = [...prev];
      const item = next.splice(dragIndex, 1)[0];
      next.splice(index, 0, item);
      setDragIndex(index);
      return next;
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragNode.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
    saveProjectOrder(data);
  };

  const visibleData = data.filter(({ project }) => !project.archived);
  const hasProjects = visibleData.length > 0;

  const stateMod = collapsed ? "sidebar--collapsed" : "sidebar--expanded";
  const transitionMod = ready ? "sidebar--animated" : "";

  return (
    <>
      <aside className={`sidebar sidebar--flat ${stateMod} ${transitionMod}`}>
        <nav className="sidebar__nav">
          {!collapsed && (
            <>
              {visibleData.map(({ project, reports }, index) => {
                const domain = getDomain(project.prodUrl);
                const tests = project.tests || [];
                const isExpanded = expandedTests.has(project.id);
                const testsWithReports = tests.map((t) => getTestWithLatestReport(t, reports));
                const visibleTests = isExpanded ? testsWithReports : testsWithReports.slice(0, MAX_VISIBLE_TESTS);
                const hasMore = testsWithReports.length > MAX_VISIBLE_TESTS;

                return (
                  <div key={project.id}>
                    <div
                      className="sidebar__group"
                      draggable
                      onDragStart={(e) => handleDragStart(index, e)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                    >
                      <button
                        onClick={() => handleProjectClick(project, reports)}
                        className="sidebar__header"
                      >
                        <ProjectFavicon
                          url={project.prodUrl}
                          fallbackUrl={project.devUrl}
                          size={32}
                        />
                        <span className="sidebar__title">{project.name || domain}</span>
                      </button>

                      <div className="sidebar__tests">
                        {visibleTests.map(({ test, latestReport }) => {
                          const testActive = isTestActive(test, reports);
                          const dotMod = latestReport ? reportDotModifier(latestReport) : "inactive";
                          const timeAgo = latestReport
                            ? formatRelativeTimeShort(latestReport.createdAt)
                            : test.lastRunAt
                              ? formatRelativeTimeShort(test.lastRunAt)
                              : null;

                          return (
                            <div
                              key={test.id}
                              onClick={() => handleTestClick(test, project, reports)}
                              className={`sidebar__test ${testActive ? "sidebar__test--active" : ""}`}
                            >
                              <span className={`status-dot status-dot--${dotMod}`} />
                              <span className="sidebar__test-label">{test.name}</span>
                              {timeAgo && (
                                <span className="sidebar__test-time">{timeAgo}</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTestSettings(project.id, test.id);
                                }}
                                className="sidebar__test-action"
                                title="Test settings"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}

                        {hasMore && (
                          <button
                            onClick={() => setExpandedTests((prev) => {
                              const next = new Set(prev);
                              if (next.has(project.id)) next.delete(project.id);
                              else next.add(project.id);
                              return next;
                            })}
                            className="sidebar__show-more"
                          >
                            {isExpanded
                              ? "See less"
                              : `See ${testsWithReports.length - MAX_VISIBLE_TESTS} more`}
                          </button>
                        )}

                        <button
                          onClick={async () => {
                            // Create a new empty test, then open its
                            // settings overlay so the user can name it +
                            // add steps inline.
                            const res = await fetch(`/api/projects/${project.id}/tests`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ name: "New test" }),
                            });
                            if (res.ok) {
                              const test = await res.json();
                              refreshProjects();
                              openTestSettings(project.id, test.id);
                            } else {
                              router.push(`/projects/${project.id}/settings/tests`);
                            }
                          }}
                          className="sidebar__add-test"
                        >
                          <span>Add new test</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 5v14M5 12h14"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {index < visibleData.length - 1 && (
                      <div className="sidebar__divider sidebar__divider--top" />
                    )}
                  </div>
                );
              })}

              {hasProjects && <div className="sidebar__divider" />}

              <button
                onClick={() => setShowNewProject(true)}
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
            <GearIcon />
          </button>
        </div>
      </aside>

      {showNewProject && (
        <NewProjectOverlay
          onClose={() => setShowNewProject(false)}
          onCreated={(projectId) => {
            setShowNewProject(false);
            refreshProjects();
            router.push(`/projects/${projectId}`);
          }}
        />
      )}
    </>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
