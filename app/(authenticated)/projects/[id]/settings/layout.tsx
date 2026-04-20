"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Project } from "@/lib/types";
import { usePageTitle } from "@/components/SidebarProvider";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Tab {
  label: string;
  href: string;
}

export default function ProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => setProject(p));
  }, [params.id]);

  const baseHref = `/projects/${params.id}/settings`;
  const closeHref = `/projects/${params.id}`;
  const domain = project ? getDomain(project.prodUrl) : "";
  const displayName = project ? project.name || domain : "Project";
  const headerTitle = project ? `${displayName} / Settings` : "Settings";
  usePageTitle(project ? displayName : null);

  // Build tabs: General, Tests (always), Advanced.
  // Tests tab must be visible even when there are none — otherwise users
  // can't reach the create-test screen.
  const tabs: Tab[] = [
    { label: "General", href: baseHref },
    { label: "Tests", href: `${baseHref}/tests` },
    { label: "Advanced", href: `${baseHref}/advanced` },
  ];

  const isTabActive = (tab: Tab) => {
    if (tab.label === "Tests") {
      return pathname.includes("/settings/tests") ||
        ((pathname.endsWith("/pages") || pathname.endsWith("/flows")) && !!searchParams.get("testId"));
    }
    const tabUrl = new URL(tab.href, "http://x");
    return tabUrl.pathname === pathname;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — mirrors the report header: title on the left, close icon
          on the right in the same slot the report uses for its settings icon. */}
      <div className="sticky top-0 z-10 rounded-t-[12px] bg-surface-content animate-card-in">
        {/* Title row */}
        <div className="flex items-center justify-between px-[24px] py-[20px]">
          <p className="text-[24px] text-foreground whitespace-nowrap">{headerTitle}</p>
          <Link
            href={closeHref}
            title="Close settings"
            className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-subtle transition-all hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-border-secondary px-[24px]">
          <div className="flex items-center gap-[24px]">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative py-[12px] text-[14px] text-foreground whitespace-nowrap ${
                  isTabActive(tab) ? "font-semibold" : "font-normal"
                }`}
              >
                {tab.label}
                {isTabActive(tab) && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[4px] bg-foreground" />
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-[24px] py-[24px]">
        {children}
      </div>
    </div>
  );
}
