"use client";

/** Sticky header row for the report page: title + run-pill / progress bar /
 * cancel button, the date pill (which doubles as a sibling-reports dropdown
 * trigger), and the test/project-settings menu. Pure presentation — every
 * action and the `showReportNav` state is owned by the parent. */

import { useState } from "react";
import Link from "next/link";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import { reportDotModifier } from "@/lib/colors";
import type { Report } from "@/lib/types";
import { DotsVerticalIcon, PlayIcon } from "@/components/utility/icons";

interface ReportHeaderProps {
  report: Report;
  allReports: Report[];
  headerTitle: string;
  activeBp: number;
  onRun: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  settingsTitle: string;
}

export function ReportHeader({
  report,
  allReports,
  headerTitle,
  activeBp,
  onRun,
  onCancel,
  onOpenSettings,
  settingsTitle,
}: ReportHeaderProps) {
  const [showReportNav, setShowReportNav] = useState(false);
  const progressCompleted = report.progress?.completed || 0;
  const progressTotal = report.progress?.total || 1;

  return (
    <div className="report__title-row">
      <div className="report__title-group">
        <h1 className="report__title">{headerTitle}</h1>
        {report.status !== "running" ? (
          <button onClick={onRun} className="run-pill">
            Run now
            <PlayIcon className="run-pill__icon" />
          </button>
        ) : (
          <div className="progress">
            <div className="progress__bar">
              <div
                className="progress__fill"
                style={{
                  width: `${(progressCompleted / progressTotal) * 100}%`,
                }}
              />
            </div>
            <span className="progress__text">
              {progressCompleted}/{progressTotal}
            </span>
            <button onClick={onCancel} className="status-pill">
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="report__right">
        <div className="report__nav-anchor">
          <button
            onClick={() => setShowReportNav(!showReportNav)}
            className="report__date-btn"
          >
            <span
              className="report__date"
              title={formatFullDateTime(report.createdAt)}
            >
              {formatRelativeTime(report.createdAt)}
            </span>
            <span
              className={`status-dot status-dot--${reportDotModifier(report)}`}
            />
          </button>
          <button
            onClick={onOpenSettings}
            className="icon-btn"
            title={settingsTitle}
          >
            <DotsVerticalIcon />
          </button>
          {showReportNav && (
            <>
              <div
                className="dropdown-backdrop"
                onClick={() => setShowReportNav(false)}
              />
              <div
                className="dropdown-panel"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 40,
                  zIndex: 40,
                  minWidth: 320,
                }}
              >
                {allReports.map((r) => {
                  const isCurrent = r.id === report.id;
                  return (
                    <Link
                      key={r.id}
                      href={`/reports/${r.id}?bp=${activeBp}`}
                      onClick={() => setShowReportNav(false)}
                      title={formatFullDateTime(r.createdAt)}
                      className={`dropdown-item ${isCurrent ? "dropdown-item--active" : "dropdown-item--muted"}`}
                    >
                      <span className="dropdown-item__label">
                        {formatRelativeTime(r.createdAt)}
                      </span>
                      <span
                        className={`status-dot status-dot--${reportDotModifier(r)}`}
                      />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
