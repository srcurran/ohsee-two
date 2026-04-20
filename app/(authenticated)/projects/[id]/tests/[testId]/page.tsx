"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Project, SiteTest } from "@/lib/types";
import { trackReportCompletion } from "@/lib/electron";

export default function TestPage() {
  const params = useParams<{ id: string; testId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [test, setTest] = useState<SiteTest | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        const t = p.tests?.find((t) => t.id === params.testId);
        setTest(t ?? null);
      });
  }, [params.id, params.testId]);

  const handleRun = async () => {
    setRunning(true);
    const res = await fetch(
      `/api/projects/${params.id}/tests/${params.testId}/reports`,
      { method: "POST" }
    );
    if (res.ok) {
      const { reportId } = await res.json();
      const label = project && test
        ? `${project.name || project.prodUrl} / ${test.name}`
        : "Audit";
      trackReportCompletion(reportId, label);
      router.push(`/reports/${reportId}`);
    } else {
      setRunning(false);
    }
  };

  if (!project || !test) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  const hasPages = test.pages.length > 0;
  const hasCompositions = (test.compositions?.length ?? 0) > 0;
  const hasFlows = (test.flows?.length ?? 0) > 0;
  const canRun = hasPages || hasCompositions || hasFlows;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[24px]">
      <h1 className="text-[24px] font-bold text-foreground">{test.name}</h1>

      {canRun ? (
        <>
          <p className="max-w-[400px] text-center text-[14px] text-text-muted">
            No reports yet. Run this test to capture your first set of screenshots.
          </p>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-[16px] rounded-[8px] border border-border-strong pl-[24px] pr-[20px] py-[8px] text-[16px] text-foreground transition-all hover:bg-surface-tertiary hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
          >
            {running ? "Starting..." : "Run now"}
            <svg width="16" height="16" viewBox="0 0 28 28" fill="none" className="text-text-subtle">
              <path d="M8 5v18l16-9L8 5z" fill="currentColor" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <p className="max-w-[400px] text-center text-[14px] text-text-muted">
            This test has no pages, compositions, or flows configured yet.
            Add some in settings before running.
          </p>
        </>
      )}

      <Link
        href={`/projects/${params.id}/settings/tests?testId=${params.testId}`}
        className="text-[14px] text-text-muted transition-colors hover:text-foreground"
      >
        Configure test settings
      </Link>
    </div>
  );
}
