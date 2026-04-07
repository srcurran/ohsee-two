"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SettingsSideNav from "@/components/settings/SettingsSideNav";
import type { Project, Report } from "@/lib/types";

export default function ProjectSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        // Fetch latest report for back link
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

  const sections = [
    { label: "General", href: `/projects/${params.id}/settings` },
    { label: "Pages", href: `/projects/${params.id}/settings/pages` },
    { label: "Flows", href: `/projects/${params.id}/settings/flows` },
    { label: "Advanced", href: `/projects/${params.id}/settings/advanced` },
  ];

  const backHref = latestReportId
    ? `/reports/${latestReportId}`
    : "/";

  const displayName = project
    ? project.name || getDomain(project.prodUrl)
    : "Project";

  return (
    <SettingsSideNav
      title={displayName}
      sections={sections}
      backHref={backHref}
      backLabel="Back to report"
    >
      {children}
    </SettingsSideNav>
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
