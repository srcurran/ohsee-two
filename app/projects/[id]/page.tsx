"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import type { Project, Report } from "@/lib/types";

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then(setProject);
    fetch(`/api/projects/${params.id}/reports`)
      .then((r) => r.json())
      .then(setReports);
  }, [params.id]);

  const handleRun = async () => {
    setRunning(true);
    const res = await fetch(`/api/projects/${params.id}/reports`, {
      method: "POST",
    });
    if (res.ok) {
      const { reportId } = await res.json();
      router.push(`/reports/${reportId}`);
    }
    setRunning(false);
  };

  if (!project) {
    return (
      <div className="px-[140px] py-[56px]">
        <p className="text-black/50">Loading...</p>
      </div>
    );
  }

  const displayUrl = project.prodUrl.replace(/^https?:\/\//, "");

  return (
    <div>
      <div className="bg-surface-primary px-[140px] py-[56px]">
        <div className="flex flex-col gap-[12px]">
          <Breadcrumb
            items={[
              { label: "Projects", href: "/" },
              { label: displayUrl },
            ]}
          />
          <div className="flex items-center justify-between">
            <h1 className="text-[32px] font-normal text-black">
              Reports for {displayUrl}
            </h1>
            <button
              onClick={handleRun}
              disabled={running}
              className="rounded-[12px] bg-black px-[40px] py-[10px] text-[20px] font-bold text-white disabled:opacity-50"
            >
              {running ? "Running..." : "Run now"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-[140px] py-[56px]">
        <div className="flex flex-col gap-[24px]">
          {reports.map((report) => {
            const totalChanges = report.pages.reduce((sum, page) => {
              const firstBp = Object.values(page.breakpoints)[0];
              return sum + (firstBp?.changeCount || 0);
            }, 0);

            return (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="flex items-center justify-between rounded-[4px] bg-surface-primary p-[16px] shadow-[0px_0px_1px_0px_rgba(0,0,0,0.05),0px_1px_1px_0px_rgba(0,0,0,0.04),0px_3px_2px_0px_rgba(0,0,0,0.03),0px_5px_2px_0px_rgba(0,0,0,0.01),0px_8px_2px_0px_rgba(0,0,0,0)]"
              >
                <div className="flex items-center gap-[40px] text-black">
                  <div className="flex w-[240px] flex-col">
                    <span className="text-[14px]">Last Diff</span>
                    <span className="text-[20px] font-bold">
                      {new Date(report.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex w-[240px] flex-col">
                    <span className="text-[14px]">Pages</span>
                    <span className="text-[20px]">{report.pages.length}</span>
                  </div>
                  <div className="flex w-[240px] flex-col">
                    <span className="text-[14px]">Status</span>
                    <span className="text-[20px] capitalize">{report.status}</span>
                  </div>
                </div>
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            );
          })}

          {reports.length === 0 && (
            <p className="text-center text-[16px] text-black/50">
              No reports yet. Click &quot;Run now&quot; to generate one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
