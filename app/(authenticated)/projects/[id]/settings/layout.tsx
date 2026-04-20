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
    <div className="page-shell">
      <div className="settings-header animate-card-in">
        <div className="settings-header__top">
          <p className="settings-header__title">{headerTitle}</p>
          <Link href={closeHref} title="Close settings" className="icon-btn icon-btn--lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Link>
        </div>

        <div className="tab-bar tab-bar--inset">
          <div className="tab-bar__list tab-bar__list--start">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`tab ${isTabActive(tab) ? "tab--semi-active" : ""}`}
              >
                {tab.label}
                {isTabActive(tab) && <span className="tab__indicator" />}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="page-shell__body">{children}</div>
    </div>
  );
}
