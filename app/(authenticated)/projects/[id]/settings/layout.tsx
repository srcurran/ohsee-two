"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Project, Report, SiteTest } from "@/lib/types";

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
  const [latestReportId, setLatestReportId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        fetch(`/api/projects/${params.id}/reports`)
          .then((r) => r.json())
          .then((reports: Report[]) => {
            if (reports.length > 0) {
              const sorted = [...reports].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              setLatestReportId(sorted[0].id);
            }
          });
      });
  }, [params.id]);

  const tests: SiteTest[] = project?.tests || [];
  const baseHref = `/projects/${params.id}/settings`;
  const backHref = latestReportId ? `/reports/${latestReportId}` : "/";
  const domain = project ? getDomain(project.prodUrl) : "";
  const displayName = project ? project.name || domain : "Project";

  // Build tabs: General, Tests (if any exist), Advanced
  const tabs: Tab[] = [
    { label: "General", href: baseHref },
  ];

  if (tests.length > 0) {
    tabs.push({ label: "Tests", href: `${baseHref}/tests` });
  }

  tabs.push({ label: "Advanced", href: `${baseHref}/advanced` });

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
      {/* Header */}
      <div className="flex flex-col gap-[16px] px-[24px] py-[20px] animate-card-in">
        <div className="flex items-center gap-[12px]">
          <Link
            href={backHref}
            className="flex items-center justify-center text-text-muted transition-colors hover:text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
          <div>
            {domain && domain !== displayName && (
              <p className="text-[14px] text-text-muted">{domain}</p>
            )}
            <h1 className="text-[32px] text-foreground">{displayName}</h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border-secondary">
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
