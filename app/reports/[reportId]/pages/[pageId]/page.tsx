"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import BreakpointTabs from "@/components/BreakpointTabs";
import ChangeBadge from "@/components/ChangeBadge";
import DiffViewer from "@/components/DiffViewer";
import SliderComparison from "@/components/SliderComparison";
import type { Report, Project } from "@/lib/types";

function PageDetailInner() {
  const params = useParams<{ reportId: string; pageId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const activeBp = Number(searchParams.get("bp")) || 1920;

  useEffect(() => {
    fetch(`/api/reports/${params.reportId}`)
      .then((r) => r.json())
      .then((r) => {
        setReport(r);
        fetch(`/api/projects/${r.projectId}`)
          .then((pr) => pr.json())
          .then(setProject);
      });
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

  const currentPage = report.pages.find((p) => p.pageId === params.pageId);
  if (!currentPage) {
    return (
      <div className="px-[140px] py-[56px]">
        <p className="text-black/50">Page not found in report.</p>
      </div>
    );
  }

  const bpResult = currentPage.breakpoints[String(activeBp)];
  const changeCount = bpResult?.changeCount || 0;

  // Navigation
  const pageIndex = report.pages.findIndex((p) => p.pageId === params.pageId);
  const prevPage = pageIndex > 0 ? report.pages[pageIndex - 1] : null;
  const nextPage =
    pageIndex < report.pages.length - 1 ? report.pages[pageIndex + 1] : null;

  const displayUrl = project
    ? project.prodUrl.replace(/^https?:\/\//, "")
    : "...";
  const dateSlug = report.createdAt
    .slice(0, 16)
    .replace("T", "--")
    .replace(":", "");

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
          <div className="flex items-center gap-[24px]">
            <h1 className="text-[32px] font-normal text-black">
              {currentPage.path === "/" ? "index" : currentPage.path.replace(/^\//, "")}
            </h1>
            <ChangeBadge count={changeCount} />
          </div>
        </div>
      </div>

      <BreakpointTabs active={activeBp} onChange={handleBpChange} />

      <div className="px-[140px] py-[56px]">
        {bpResult ? (
          <div className="flex gap-[40px]">
            <div className="flex-1">
              <DiffViewer
                src={`/api/screenshots/${bpResult.diffScreenshot}`}
                alt={`Diff for ${currentPage.path}`}
              />
            </div>
            <div className="flex-1">
              <SliderComparison
                prodSrc={`/api/screenshots/${bpResult.prodScreenshot}`}
                devSrc={`/api/screenshots/${bpResult.devScreenshot}`}
              />
            </div>
          </div>
        ) : (
          <p className="text-center text-[16px] text-black/50">
            No screenshot available for this breakpoint.
          </p>
        )}

        {/* Previous / Next navigation */}
        <div className="mt-[56px] flex items-center justify-between">
          {prevPage ? (
            <Link
              href={`/reports/${report.id}/pages/${prevPage.pageId}?bp=${activeBp}`}
              className="rounded-[12px] border border-border-primary px-[24px] py-[10px] text-[16px] text-black"
            >
              Previous: {prevPage.path}
            </Link>
          ) : (
            <div />
          )}
          {nextPage ? (
            <Link
              href={`/reports/${report.id}/pages/${nextPage.pageId}?bp=${activeBp}`}
              className="rounded-[12px] border border-border-primary px-[24px] py-[10px] text-[16px] text-black"
            >
              Next: {nextPage.path}
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PageDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="px-[140px] py-[56px]">
          <p className="text-black/50">Loading...</p>
        </div>
      }
    >
      <PageDetailInner />
    </Suspense>
  );
}
