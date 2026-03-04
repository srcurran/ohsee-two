"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import BreakpointTabs from "@/components/BreakpointTabs";
import ChangeBadge from "@/components/ChangeBadge";
import type { Report, Project } from "@/lib/types";

function ReportPageInner() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const activeBp = Number(searchParams.get("bp")) || 1920;

  const loadReport = async () => {
    const res = await fetch(`/api/reports/${params.reportId}`);
    if (res.ok) {
      const r = await res.json();
      setReport(r);
      // Load project
      const pRes = await fetch(`/api/projects/${r.projectId}`);
      if (pRes.ok) setProject(await pRes.json());
    }
  };

  useEffect(() => {
    loadReport();
    // Poll while running
    const interval = setInterval(async () => {
      const res = await fetch(`/api/reports/${params.reportId}`);
      if (res.ok) {
        const r = await res.json();
        setReport(r);
        if (r.status !== "running") clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [params.reportId]);

  const handleBpChange = (bp: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("bp", String(bp));
    router.push(`?${p.toString()}`, { scroll: false });
  };

  if (!report) {
    return (
      <div className="px-[140px] py-[56px]">
        <p className="text-black/50">Loading...</p>
      </div>
    );
  }

  const displayUrl = project
    ? project.prodUrl.replace(/^https?:\/\//, "")
    : "...";
  const dateStr = new Date(report.createdAt).toLocaleString();
  const dateSlug = report.createdAt.slice(0, 16).replace("T", "--").replace(":", "");

  return (
    <div>
      <div className="bg-surface-primary px-[140px] py-[56px]">
        <div className="flex flex-col gap-[12px]">
          <Breadcrumb
            items={[
              { label: "Projects", href: "/" },
              {
                label: displayUrl,
                href: project ? `/projects/${project.id}` : undefined,
              },
              { label: dateSlug },
            ]}
          />
          <h1 className="text-[32px] font-normal text-black">{dateStr}</h1>
          {report.status === "running" && (
            <p className="text-[14px] text-black/50">
              Report is running... ({report.pages.length} pages processed so far)
            </p>
          )}
        </div>
      </div>

      <BreakpointTabs active={activeBp} onChange={handleBpChange} />

      <div className="px-[140px] py-[56px]">
        <div className="grid grid-cols-3 gap-[40px]">
          {report.pages.map((page) => {
            const bpResult = page.breakpoints[String(activeBp)];
            const changeCount = bpResult?.changeCount || 0;
            const diffSrc = bpResult?.diffScreenshot
              ? `/api/screenshots/${bpResult.diffScreenshot}`
              : null;

            return (
              <Link
                key={page.id}
                href={`/reports/${report.id}/pages/${page.pageId}?bp=${activeBp}`}
                className="flex flex-col gap-[8px] rounded bg-surface-primary p-[8px]"
              >
                <div className="relative aspect-[2880/1760] w-full overflow-hidden border border-border-primary">
                  {diffSrc ? (
                    <img
                      src={diffSrc}
                      alt={page.path}
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-tertiary text-[12px] text-black/30">
                      No screenshot
                    </div>
                  )}
                </div>
                <div className="flex items-start justify-between">
                  <span className="truncate text-[14px] text-black">
                    {page.path}
                  </span>
                  <ChangeBadge count={changeCount} />
                </div>
              </Link>
            );
          })}
        </div>

        {report.pages.length === 0 && (
          <p className="text-center text-[16px] text-black/50">
            {report.status === "running"
              ? "Capturing screenshots..."
              : "No pages in this report."}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="px-[140px] py-[56px]">
          <p className="text-black/50">Loading...</p>
        </div>
      }
    >
      <ReportPageInner />
    </Suspense>
  );
}
