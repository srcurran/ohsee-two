"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "./SidebarProvider";
import NewProjectOverlay from "./NewProjectOverlay";
import ProjectFavicon from "./ProjectFavicon";
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

function UserAvatarLink({
  showTooltip,
  hideTooltip,
}: {
  showTooltip: (e: React.MouseEvent, text: string) => void;
  hideTooltip: () => void;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const initial = user?.name?.charAt(0).toUpperCase() || "?";

  return (
    <Link
      href="/settings"
      onMouseEnter={(e) => showTooltip(e, user?.name || "Settings")}
      onMouseLeave={hideTooltip}
      className="flex h-[56px] w-[56px] cursor-pointer items-center justify-center overflow-hidden rounded-full transition-opacity hover:opacity-80"
    >
      {user?.image ? (
        <img
          src={user.image}
          alt={user.name || "User"}
          width={56}
          height={56}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-accent-yellow text-[20px] font-bold text-foreground">
          {initial}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const { refreshKey, refreshProjects } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<ProjectWithReports[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [tooltip, setTooltip] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);

  // Load projects + reports
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const projects: Project[] = await res.json();

      const items = await Promise.all(
        projects.map(async (project) => {
          const rRes = await fetch(`/api/projects/${project.id}/reports`);
          const reports: Report[] = rRes.ok ? await rRes.json() : [];
          return { project, reports };
        })
      );

      items.sort((a, b) => {
        const aDate = a.reports[0]?.createdAt || a.project.createdAt;
        const bDate = b.reports[0]?.createdAt || b.project.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      setData(items);
    }
    load();
  }, [refreshKey]);

  const isProjectActive = (project: Project, reports: Report[]) =>
    pathname === `/projects/${project.id}` ||
    reports.some((r) => pathname.startsWith(`/reports/${r.id}`));

  const handleProjectClick = (project: Project, reports: Report[]) => {
    if (reports.length > 0) {
      router.push(`/reports/${reports[0].id}`);
    } else {
      router.push(`/projects/${project.id}`);
    }
  };

  const showTooltip = (e: React.MouseEvent, text: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      text,
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      <aside className="sticky top-0 z-20 flex h-screen w-[96px] shrink-0 flex-col items-center">
        <div className="pt-[24px] pb-[12px]" />

        {/* Project icons */}
        <nav className="flex flex-1 flex-col items-center gap-[8px] overflow-y-auto px-[4px]">
          {data.filter(({ project }) => !project.archived).map(({ project, reports }) => {
            const active = isProjectActive(project, reports);
            const domain = getDomain(project.prodUrl);

            return (
              <button
                key={project.id}
                onClick={() => handleProjectClick(project, reports)}
                onMouseEnter={(e) => showTooltip(e, project.name || domain)}
                onMouseLeave={hideTooltip}
                className={`relative flex h-[64px] w-[64px] shrink-0 cursor-pointer items-center justify-center rounded-[18px] transition-all active:scale-[0.97] ${
                  active ? "" : "hover:bg-foreground/5 hover:shadow-elevation-sm"
                }`}
              >
                <ProjectFavicon
                  url={project.prodUrl}
                  fallbackUrl={project.devUrl}
                  size={56}
                  className={active ? "ring-2 ring-foreground" : ""}
                />
                {/* Arrow indicator on hover */}
                <div className="pointer-events-none absolute right-[-2px] top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                </div>
              </button>
            );
          })}

          {/* Add project button */}
          <button
            onClick={() => setShowNewProject(true)}
            onMouseEnter={(e) => showTooltip(e, "New Project")}
            onMouseLeave={hideTooltip}
            className="flex h-[56px] w-[56px] shrink-0 cursor-pointer items-center justify-center rounded-[14px] text-text-subtle transition-all active:scale-[0.97] hover:bg-foreground/5 hover:text-text-muted hover:shadow-elevation-sm"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </nav>

        {/* User avatar → links to settings */}
        <div className="pb-[24px] pt-[16px]">
          <UserAvatarLink showTooltip={showTooltip} hideTooltip={hideTooltip} />
        </div>
      </aside>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-[8px] bg-black/90 px-[12px] py-[6px] text-[13px] font-medium text-white shadow-lg whitespace-nowrap"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.text}
        </div>
      )}

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
