"use client";

import { memo, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import ProjectFavicon from "@/components/utility/ProjectFavicon";
import { reportDotModifier } from "@/lib/colors";
import { formatRelativeTimeShort } from "@/lib/relative-time";
import { useAcceptedChanges } from "@/lib/accepted-changes";
import { useViewedReports } from "@/lib/viewed-reports";
import type { Project, Report, SiteTest } from "@/lib/types";
import { Icon } from "@/components/utility/Icon";
import {
  getDomain,
  getTestWithLatestReport,
  sortTestsForSidebar,
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
  onOpenProjectSettings: (projectId: string) => void;
  onOpenTestSettings: (projectId: string, testId: string) => void;
  onDragStart: (index: number, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter: (index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/** One project's group in the sidebar: header, visible tests (with optional
 * see-more), add-test button. Owns only its expanded-tests toggle — every
 * other state and handler is supplied by the parent shell.
 *
 * React.memo'd: re-renders only when props change. The parent passes
 * useCallback'd handlers so unrelated state changes upstream (overlay
 * toggles, pathname changes) don't reconcile every project row. */
function SidebarGroupComponent({
  project,
  reports,
  index,
  onProjectClick,
  onTestClick,
  onAddTest,
  onOpenProjectSettings,
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
  const testsWithReports = useMemo(
    () =>
      sortTestsForSidebar(
        (project.tests || [])
          .filter((t) => !t.archived)
          .map((t) => getTestWithLatestReport(t, reports)),
      ),
    [project.tests, reports],
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
        <div className="sidebar__header-row">
          <button
            onClick={() => onProjectClick(project, reports)}
            className="sidebar__header"
          >
            <ProjectFavicon url={project.prodUrl} fallbackUrl={project.devUrl} />
            <span className="sidebar__title">{project.name || domain}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenProjectSettings(project.id);
            }}
            className="sidebar__group-action"
            title="Project settings"
          >
            <Icon name="project-menu" size={14} />
          </button>
        </div>

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
            <Icon name="plus" size={14} />
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

/** Staleness opacity: 100 % within the first hour, linearly fading to
 * 10 % at one week old. Returns 1 for unknown timestamps. */
function dotOpacity(isoDate: string | undefined | null): number {
  if (!isoDate) return 1;
  const hoursAgo = (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
  if (hoursAgo <= 1) return 1;
  const TWO_WEEKS_HOURS = 336;
  const t = Math.min((hoursAgo - 1) / (TWO_WEEKS_HOURS - 1), 1);
  return 1 - t * 0.8; // 1.0 → 0.20
}

function SidebarTestRow({
  twr: { test, latestReport },
  active,
  onClick,
  onOpenSettings,
}: SidebarTestRowProps) {
  const { accepted } = useAcceptedChanges();
  const dotMod = latestReport ? reportDotModifier(latestReport, accepted) : "inactive";
  const lastRanAt = latestReport?.createdAt ?? test.lastRunAt;
  const timeAgo = latestReport
    ? formatRelativeTimeShort(latestReport.createdAt)
    : test.lastRunAt
      ? formatRelativeTimeShort(test.lastRunAt)
      : null;
  const opacity = dotOpacity(lastRanAt);
  // Solid dot until the user opens the latest report — once they do,
  // switch to a 2-pixel outline. A new run creates a new report id, so
  // the indicator naturally resets to solid for fresh results. A
  // running report never reads as viewed: there's nothing final to have
  // seen yet, so the dot stays solid until the run completes.
  const viewedReports = useViewedReports();
  const viewed =
    !!latestReport &&
    dotMod !== "running" &&
    viewedReports.has(latestReport.id);

  return (
    <div
      onClick={onClick}
      className={`sidebar__test ${active ? "sidebar__test--active" : ""}`}
    >
      <span
        className={`status-dot status-dot--${dotMod}${viewed ? " status-dot--viewed" : ""}`}
        style={opacity < 1 ? { opacity } : undefined}
      />
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
        <Icon name="project-menu" size={14} />
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

export const SidebarGroup = memo(SidebarGroupComponent);
SidebarGroup.displayName = "SidebarGroup";
