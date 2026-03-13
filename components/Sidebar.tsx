"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useSidebar } from "./SidebarProvider";
import NewProjectOverlay from "./NewProjectOverlay";
import type { Project, Report } from "@/lib/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Hash a string to a consistent hue for fallback colors */
function domainHue(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash % 360);
}

function ProjectFavicon({ url, size = 56 }: { url: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = getDomain(url);
  const hostname = getHostname(url);
  const initial = domain.charAt(0).toUpperCase();
  const hue = domainHue(domain);

  if (failed || !url) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[14px] text-[24px] font-bold text-white"
        style={{
          width: size,
          height: size,
          backgroundColor: `hsl(${hue}, 50%, 65%)`,
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`/api/favicon?domain=${hostname}`}
      alt={domain}
      width={size}
      height={size}
      className="shrink-0 rounded-[14px] object-cover"
      onError={() => setFailed(true)}
    />
  );
}

interface ProjectWithReports {
  project: Project;
  reports: Report[];
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
        <div className="pt-[32px] pb-[12px]" />

        {/* Project icons */}
        <nav className="flex flex-1 flex-col items-center gap-[8px] overflow-y-auto px-[4px] pt-[8px]">
          {data.filter(({ project }) => !project.archived).map(({ project, reports }) => {
            const active = isProjectActive(project, reports);
            const domain = getDomain(project.prodUrl);

            return (
              <button
                key={project.id}
                onClick={() => handleProjectClick(project, reports)}
                onMouseEnter={(e) => showTooltip(e, domain)}
                onMouseLeave={hideTooltip}
                className={`relative flex h-[64px] w-[64px] shrink-0 cursor-pointer items-center justify-center rounded-[18px] transition-all active:scale-[0.97] ${
                  active ? "bg-black/50" : "hover:bg-foreground/5 hover:shadow-elevation-sm"
                }`}
              >
                <div
                  className={`relative overflow-hidden rounded-[14px] ${
                    active ? "ring-2 ring-surface-content" : ""
                  }`}
                >
                  <ProjectFavicon url={project.prodUrl} size={56} />
                </div>
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

        {/* User avatar + sign out */}
        <div className="pb-[24px] pt-[16px]">
          <UserAvatar showTooltip={showTooltip} hideTooltip={hideTooltip} />
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
          onCreated={() => {
            setShowNewProject(false);
            refreshProjects();
          }}
        />
      )}
    </>
  );
}

function UserAvatar({
  showTooltip,
  hideTooltip,
}: {
  showTooltip: (e: React.MouseEvent, text: string) => void;
  hideTooltip: () => void;
}) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const user = session?.user;
  const initial = user?.name?.charAt(0).toUpperCase() || "?";

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        onMouseEnter={(e) => showTooltip(e, user?.name || "Account")}
        onMouseLeave={hideTooltip}
        className="flex h-[56px] w-[56px] cursor-pointer items-center justify-center overflow-hidden rounded-full"
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
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div className="absolute bottom-[64px] left-0 z-40 flex min-w-[200px] flex-col gap-[4px] rounded-[12px] bg-surface-content p-[12px] shadow-elevation-lg">
            {user?.email && (
              <p className="truncate px-[12px] py-[4px] text-[12px] text-text-subtle">
                {user.email}
              </p>
            )}
            {mounted && (
              <div className="px-[12px] py-[8px]">
                <p className="mb-[6px] text-[11px] uppercase tracking-wider text-text-subtle">Theme</p>
                <div className="flex rounded-[8px] bg-surface-tertiary p-[3px]">
                  {(["light", "dark", "system"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setTheme(opt)}
                      className={`flex-1 rounded-[6px] px-[8px] py-[4px] text-[12px] capitalize transition-colors ${
                        theme === opt
                          ? "bg-surface-content font-bold shadow-sm"
                          : "text-text-muted hover:text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setShowMenu(false);
                router.push("/settings");
              }}
              className="rounded-[8px] px-[12px] py-[8px] text-left text-[14px] text-foreground hover:bg-surface-tertiary"
            >
              Settings
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/sign-in" })}
              className="rounded-[8px] px-[12px] py-[8px] text-left text-[14px] text-foreground hover:bg-surface-tertiary"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
