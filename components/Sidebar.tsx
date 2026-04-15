"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "./SidebarProvider";
import NewProjectOverlay from "./NewProjectOverlay";
import ProjectFavicon from "./ProjectFavicon";
import { reportDotColor } from "@/lib/colors";
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

/** Group tests by recency of their last run */
function groupTestsByRecency(
  tests: SiteTest[],
  reports: Report[]
): { label: string; tests: { test: SiteTest; latestReport: Report | null }[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const groups: Record<string, { test: SiteTest; latestReport: Report | null }[]> = {
    Today: [],
    "This week": [],
    Older: [],
  };

  for (const test of tests) {
    const testReports = reports
      .filter((r) => r.siteTestId === test.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latestReport = testReports[0] || null;

    const lastDate = latestReport
      ? new Date(latestReport.createdAt)
      : test.lastRunAt
        ? new Date(test.lastRunAt)
        : null;

    if (lastDate && lastDate >= todayStart) {
      groups["Today"].push({ test, latestReport });
    } else if (lastDate && lastDate >= weekStart) {
      groups["This week"].push({ test, latestReport });
    } else {
      groups["Older"].push({ test, latestReport });
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, tests: items }));
}

function AnimatedCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(open ? undefined : 0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    if (open) {
      setHeight(el.scrollHeight);
      const onEnd = () => setHeight(undefined);
      el.addEventListener("transitionend", onEnd, { once: true });
      return () => el.removeEventListener("transitionend", onEnd);
    } else {
      // Force a layout read so the browser knows the starting height
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [open]);

  return (
    <div
      ref={contentRef}
      className="overflow-hidden transition-[height] duration-200 ease-in-out"
      style={{ height: height !== undefined ? height : "auto" }}
    >
      {children}
    </div>
  );
}

export default function Sidebar() {
  const { refreshKey, refreshProjects } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);

  // Load projects + reports (keep previous data visible during refresh)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/projects");
      if (!res.ok || cancelled) return;
      const projects: Project[] = await res.json();

      const items = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`);
          const reports: Report[] = rRes.ok ? await rRes.json() : [];
          return { project, reports };
        })
      );
      if (cancelled) return;

      items.sort((a, b) => {
        const aDate = a.reports[0]?.createdAt || a.project.createdAt;
        const bDate = b.reports[0]?.createdAt || b.project.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      setData(items);
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Track which projectId the current report belongs to (even if not yet in sidebar data)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  useEffect(() => {
    const match = pathname.match(/^\/reports\/([^/]+)/);
    if (match) {
      // Check if this report is already in our data
      const known = data.some(({ reports }) => reports.some((r) => r.id === match[1]));
      if (!known) {
        // Fetch the report to get its projectId
        fetch(`/api/reports/${match[1]}`).then((r) => r.ok ? r.json() : null).then((report) => {
          if (report?.projectId) setActiveProjectId(report.projectId);
        });
      } else {
        setActiveProjectId(null);
      }
    } else {
      setActiveProjectId(null);
    }
  }, [pathname, data]);

  const isProjectActive = (project: Project, reports: Report[]) =>
    pathname === `/projects/${project.id}` ||
    pathname.startsWith(`/projects/${project.id}/`) ||
    reports.some((r) => pathname.startsWith(`/reports/${r.id}`)) ||
    activeProjectId === project.id;

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

  const handleTestClick = (test: SiteTest, reports: Report[]) => {
    const testReports = reports
      .filter((r) => r.siteTestId === test.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (testReports.length > 0) {
      router.push(`/reports/${testReports[0].id}`);
    }
  };

  const userInitial = user?.name?.charAt(0).toUpperCase() || "?";

  return (
    <>
      <aside className="sticky top-0 z-20 flex h-screen w-[240px] shrink-0 flex-col justify-between bg-surface-primary px-[1rem] py-[2rem]">
        {/* Top section: sites + tests */}
        <nav className="flex flex-1 flex-col gap-[24px] overflow-y-auto p-[2px]">
          {data.filter(({ project }) => !project.archived).map(({ project, reports }, index, arr) => {
            const active = isProjectActive(project, reports);
            const domain = getDomain(project.prodUrl);
            const tests = project.tests || [];

            return (
              <div key={project.id}>
                <div className="flex flex-col gap-[12px] py-[12px]">
                  {/* Site header row */}
                  <button
                    onClick={() => handleProjectClick(project, reports)}
                    className="flex items-center gap-[8px] px-[4px] cursor-pointer transition-opacity hover:opacity-80"
                  >
                    <ProjectFavicon
                      url={project.prodUrl}
                      fallbackUrl={project.devUrl}
                      size={32}
                      className={active ? "ring-1 ring-foreground" : ""}
                    />
                    <span
                      className={`text-[20px] truncate ${
                        active ? "text-foreground" : "text-foreground/70"
                      }`}
                    >
                      {project.name || domain}
                    </span>
                  </button>

                  {/* Tests (animated expand/collapse) */}
                  {tests.length > 0 && (
                    <AnimatedCollapse open={active}>
                      <div className="flex flex-col gap-[4px]">
                        {groupTestsByRecency(tests, reports).map((group) => (
                          <div key={group.label} className="flex flex-col gap-[4px]">
                            {/* Time group label */}
                            <div className="px-[8px]">
                              <span className="text-[14px] text-foreground/40">
                                {group.label}
                              </span>
                            </div>

                            {/* Test rows */}
                            {group.tests.map(({ test, latestReport }) => {
                              const testActive = isTestActive(test, reports);
                              const dotColor = latestReport
                                ? reportDotColor(latestReport)
                                : "bg-foreground/20";

                              return (
                                <button
                                  key={test.id}
                                  onClick={() => handleTestClick(test, reports)}
                                  className={`flex items-center gap-[8px] px-[8px] py-[4px] rounded-[4px] cursor-pointer transition-colors text-left ${
                                    testActive
                                      ? "bg-surface-tertiary"
                                      : "hover:bg-foreground/5"
                                  }`}
                                >
                                  <span
                                    className={`shrink-0 w-[8px] h-[8px] rounded-full ${dotColor}`}
                                  />
                                  <span className="text-[16px] text-foreground truncate">
                                    {test.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}

                        {/* Add new test */}
                        <button
                          onClick={() => router.push(`/projects/${project.id}`)}
                          className="flex items-center justify-between px-[8px] py-[4px] cursor-pointer text-foreground transition-colors hover:bg-foreground/5 rounded-[4px]"
                        >
                          <span className="text-[16px]">Add new test</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-foreground/40">
                            <path
                              d="M12 5v14M5 12h14"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </AnimatedCollapse>
                  )}
                </div>
                {/* Keyline between sites */}
                {index < arr.length - 1 && (
                  <div className="h-px bg-black/[0.1]" />
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
            <span className="text-[20px]">+</span>
            <span className="text-[20px]">Add new site</span>
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
              <span className="flex h-full w-full items-center justify-center bg-accent-yellow text-[14px] font-bold text-foreground">
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
          onCreated={() => {
            setShowNewProject(false);
            refreshProjects();
          }}
        />
      )}
    </>
  );
}
