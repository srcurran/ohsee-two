"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  const { refreshKey, refreshProjects } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  // Drag state for reordering sites
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // Load projects + reports (keep previous data visible during refresh)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [projRes, settingsRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/settings"),
      ]);
      if (!projRes.ok || cancelled) return;
      const projects: Project[] = await projRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const projectOrder: string[] = settings.projectOrder || [];

      const items = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`);
          const reports: Report[] = rRes.ok ? await rRes.json() : [];
          return { project, reports };
        })
      );
      if (cancelled) return;

      // Sort by saved order; unordered projects go to the end sorted by creation date
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

  const userInitial = user?.name?.charAt(0).toUpperCase() || "?";
  const visibleData = data.filter(({ project }) => !project.archived);

  return (
    <>
      <aside className="sticky top-0 z-20 flex h-screen w-[240px] shrink-0 flex-col justify-between bg-surface-tertiary px-[16px] py-[32px]">
        {/* Top section: sites + tests */}
        <nav className="flex flex-1 flex-col gap-[24px] overflow-y-auto p-[2px]">
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
                      size={24}
                      className=""
                    />
                    <span className="text-[20px] font-semibold truncate text-foreground">
                      {project.name || domain}
                    </span>
                  </button>

                  {/* Tests */}
                  {tests.length > 0 && (
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
                                ? "bg-white dark:bg-white/10"
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
                  )}
                </div>
                {/* Keyline between sites */}
                {index < visibleData.length - 1 && (
                  <div className="mt-[24px] h-px bg-black/[0.1]" />
                )}
              </div>
            );
          })}

          <div className="h-px bg-black/[0.1]" />

          {/* Add new site */}
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-[8px] px-[4px] cursor-pointer text-foreground/70 transition-colors hover:text-foreground"
          >
            <span className="flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-white text-[20px] text-foreground/70">
              +
            </span>
            <span className="text-[20px] text-foreground/70">Add new site</span>
          </button>
        </nav>

        {/* User avatar + name at bottom */}
        <Link
          href="/settings"
          className="flex items-center gap-[8px] px-[4px] pt-[16px] cursor-pointer transition-opacity hover:opacity-80"
        >
          <div className="flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-full">
            {user?.image ? (
              <img
                src={user.image}
                alt={user?.name || "User"}
                width={32}
                height={32}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-accent-yellow text-[14px] font-semibold text-foreground">
                {userInitial}
              </span>
            )}
          </div>
          <span className="text-[20px] text-foreground/70 truncate">
            {user?.name || "Settings"}
          </span>
        </Link>
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
