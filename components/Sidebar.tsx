"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSidebar } from "./SidebarProvider";
import NewProjectOverlay from "./NewProjectOverlay";
import ProjectFavicon from "./ProjectFavicon";
import { reportDotColor } from "@/lib/colors";
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
  const { refreshKey, refreshProjects, collapsed, ready, openSettings } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  // Drag state for reordering sites
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // Load projects + reports (keep previous data visible during refresh).
  // `cache: "no-store"` because the last edit/run may have happened moments
  // ago — we never want the browser handing us a stale copy.
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

  // Poll while any report is running so the dot flips and the "x ago" ticks
  // over without requiring the user to be on the report page.
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

  const isProjectActive = (project: Project, reports: Report[]) => {
    if (pathname.startsWith(`/projects/${project.id}`)) return true;
    return reports.some((r) => pathname.startsWith(`/reports/${r.id}`));
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

  // Persist project order to settings
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

  const widthClass = collapsed ? "w-0" : "w-[240px]";
  const paddingClass = collapsed ? "px-0" : "px-[16px]";
  // Only animate width/padding after the first post-hydration commit — prevents
  // the jarring 200ms "open → collapsed" swing on refresh for users whose last
  // state was collapsed.
  const transitionClass = ready ? "transition-[width,padding] duration-200" : "";

  return (
    <>
      <aside
        className={`sticky top-0 z-20 flex h-screen ${widthClass} shrink-0 flex-col overflow-hidden border-r border-black/[0.1] bg-[#fafafa] ${paddingClass} pt-[44px] pb-[20px] ${transitionClass}`}
      >
        {/* Top section: sites + tests. When collapsed the aside is w-0; we
            skip rendering entirely to avoid wasted work on hidden content. */}
        <nav className="flex flex-1 flex-col gap-[24px] overflow-y-auto p-[2px]">
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
                      className="flex flex-col gap-[16px]"
                      draggable
                      onDragStart={(e) => handleDragStart(index, e)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Site header row */}
                      <button
                        onClick={() => handleProjectClick(project, reports)}
                        className="flex items-center gap-[8px] px-[4px] cursor-pointer transition-opacity hover:opacity-80"
                      >
                        <ProjectFavicon
                          url={project.prodUrl}
                          fallbackUrl={project.devUrl}
                          size={32}
                          className=""
                        />
                        <span className="text-[20px] font-semibold truncate text-foreground">
                          {project.name || domain}
                        </span>
                      </button>

                      {/* Tests */}
                      <div className="flex flex-col gap-[4px]">
                        {visibleTests.map(({ test, latestReport }) => {
                          const testActive = isTestActive(test, reports);
                          const dotColor = latestReport
                            ? reportDotColor(latestReport)
                            : "bg-foreground/20";
                          const timeAgo = latestReport
                            ? formatRelativeTimeShort(latestReport.createdAt)
                            : test.lastRunAt
                              ? formatRelativeTimeShort(test.lastRunAt)
                              : null;

                          return (
                            <div
                              key={test.id}
                              onClick={() => handleTestClick(test, project, reports)}
                              className={`group/test flex items-center gap-[8px] rounded-[4px] cursor-pointer transition-colors px-[8px] py-[4px] ${
                                testActive
                                  ? "bg-surface-content"
                                  : "hover:bg-foreground/5"
                              }`}
                            >
                              <span
                                className={`shrink-0 w-[8px] h-[8px] rounded-full ${dotColor}`}
                              />
                              <span className="flex-1 text-[16px] text-foreground truncate min-w-0">
                                {test.name}
                              </span>
                              {timeAgo && (
                                <span className="shrink-0 text-[12px] text-foreground/40 whitespace-nowrap group-hover/test:hidden">
                                  {timeAgo}
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/projects/${project.id}/settings/tests`);
                                }}
                                className="shrink-0 hidden items-center justify-center w-[20px] h-[20px] rounded-[4px] group-hover/test:flex transition-opacity hover:bg-foreground/10"
                                title="Test settings"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-foreground/60">
                                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}

                        {/* See more / see less */}
                        {hasMore && (
                          <button
                            onClick={() => setExpandedTests((prev) => {
                              const next = new Set(prev);
                              if (next.has(project.id)) next.delete(project.id);
                              else next.add(project.id);
                              return next;
                            })}
                            className="px-[8px] py-[4px] text-[14px] text-foreground/40 text-left transition-colors hover:text-foreground/60"
                          >
                            {isExpanded
                              ? "See less"
                              : `See ${testsWithReports.length - MAX_VISIBLE_TESTS} more`}
                          </button>
                        )}

                        {/* Add new test */}
                        <button
                          onClick={() => router.push(`/projects/${project.id}/settings/tests`)}
                          className="flex items-center justify-between px-[8px] py-[4px] cursor-pointer text-[14px] text-foreground/40 transition-colors hover:text-foreground/60 rounded-[4px]"
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
                    {/* Keyline between projects (only when there's a next one) */}
                    {index < visibleData.length - 1 && (
                      <div className="mt-[24px] h-px bg-black/[0.1]" />
                    )}
                  </div>
                );
              })}

              {/* Separator before "Add new site" — only when there are projects */}
              {hasProjects && <div className="h-px bg-black/[0.1]" />}

              {/* Add new site */}
              <button
                onClick={() => setShowNewProject(true)}
                className="flex items-center gap-[8px] px-[4px] cursor-pointer text-foreground/70 transition-colors hover:text-foreground"
              >
                <span className="flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-surface-content text-[20px] text-foreground/70">
                  +
                </span>
                <span className="text-[20px] text-foreground/70">Add new site</span>
              </button>
            </>
          )}
        </nav>

        {/* Settings — minimal gear icon pinned to the bottom-right corner.
            Opens the app-wide settings overlay (mounted in the layout). */}
        <div className="flex justify-end">
          <button
            onClick={openSettings}
            aria-label="Settings"
            title="Settings"
            className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-subtle transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
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
