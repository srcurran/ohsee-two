"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import ProjectFavicon from "@/components/utility/ProjectFavicon";
import { reportDotModifier } from "@/lib/colors";
import { formatRelativeTimeShort } from "@/lib/relative-time";
import type { Project, Report, SiteTest } from "@/lib/types";
import { DotsIcon, PlusIcon } from "@/components/utility/icons";
import {
  getDomain,
  getTestWithLatestReport,
  type TestWithLatestReport,
} from "@/components/utility/utils/sidebar";

const MAX_VISIBLE_TESTS = 3;

interface SidebarGroupProps {
  project: Project;
  reports: Report[];
  index: number;
  onProjectClick: (project: Project, reports: Report[]) => void;
  onTestClick: (test: SiteTest, project: Project, reports: Report[]) => void;
  onAddTest: (projectId: string) => void;
  onOpenTestSettings: (projectId: string, testId: string) => void;
  onDragStart: (index: number, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter: (index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/** One project's group in the sidebar: header, visible tests (with optional
 * see-more), add-test button. Owns only its expanded-tests toggle — every
 * other state and handler is supplied by the parent shell. */
export function SidebarGroup({
  project,
  reports,
  index,
  onProjectClick,
  onTestClick,
  onAddTest,
  onOpenTestSettings,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
}: SidebarGroupProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  const domain = getDomain(project.prodUrl);
  // Archived tests live on the project but are hidden here — they're
  // restored from the project Danger Zone.
  const tests = (project.tests || []).filter((t) => !t.archived);
  const testsWithReports = tests.map((t) =>
    getTestWithLatestReport(t, reports),
  );
  const visibleTests = expanded
    ? testsWithReports
    : testsWithReports.slice(0, MAX_VISIBLE_TESTS);
  const hasMore = testsWithReports.length > MAX_VISIBLE_TESTS;
  const projectActive = isProjectActive(pathname, project, reports);

  return (
    <div>
      <div
        className={`sidebar__group${projectActive ? " sidebar__group--active" : ""}`}
        draggable
        onDragStart={(e) => onDragStart(index, e)}
        onDragEnter={() => onDragEnter(index)}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <button
          onClick={() => onProjectClick(project, reports)}
          className="sidebar__header"
        >
          <ProjectFavicon url={project.prodUrl} fallbackUrl={project.devUrl} />
          <span className="sidebar__title">{project.name || domain}</span>
        </button>

        <div className="sidebar__tests">
          {visibleTests.map((twr) => (
            <SidebarTestRow
              key={twr.test.id}
              twr={twr}
              active={isTestActive(pathname, twr.test, reports)}
              onClick={() => onTestClick(twr.test, project, reports)}
              onOpenSettings={() => onOpenTestSettings(project.id, twr.test.id)}
            />
          ))}

          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="sidebar__show-more"
            >
              {expanded
                ? "See less"
                : `See ${testsWithReports.length - MAX_VISIBLE_TESTS} more`}
            </button>
          )}

          <button
            onClick={() => onAddTest(project.id)}
            className="sidebar__add-test"
          >
            <PlusIcon />
            <span>Add new test</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface SidebarTestRowProps {
  twr: TestWithLatestReport;
  active: boolean;
  onClick: () => void;
  onOpenSettings: () => void;
}

function SidebarTestRow({
  twr: { test, latestReport },
  active,
  onClick,
  onOpenSettings,
}: SidebarTestRowProps) {
  const dotMod = latestReport ? reportDotModifier(latestReport) : "inactive";
  const timeAgo = latestReport
    ? formatRelativeTimeShort(latestReport.createdAt)
    : test.lastRunAt
      ? formatRelativeTimeShort(test.lastRunAt)
      : null;

  return (
    <div
      onClick={onClick}
      className={`sidebar__test ${active ? "sidebar__test--active" : ""}`}
    >
      <span className={`status-dot status-dot--${dotMod}`} />
      <span className="sidebar__test-label">{test.name}</span>
      {timeAgo && <span className="sidebar__test-time">{timeAgo}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenSettings();
        }}
        className="sidebar__test-action"
        title="Test settings"
      >
        <DotsIcon />
      </button>
    </div>
  );
}

/** Active-route helpers — pure pathname checks. Live alongside the group
 * since they're only used here; promote to a hook if other surfaces need
 * the same predicate. */
function isTestActive(pathname: string, test: SiteTest, reports: Report[]) {
  return reports
    .filter((r) => r.siteTestId === test.id)
    .some((r) => pathname.startsWith(`/reports/${r.id}`));
}

function isProjectActive(
  pathname: string,
  project: Project,
  reports: Report[],
) {
  if (pathname.startsWith(`/projects/${project.id}`)) return true;
  return reports.some((r) => pathname.startsWith(`/reports/${r.id}`));
}
