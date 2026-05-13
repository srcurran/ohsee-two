"use client";

import { useState } from "react";
import Link from "next/link";
import type { Report, ReportPage } from "@/lib/types";
import { formatRelativeTime, formatFullDateTime } from "@/lib/relative-time";
import { reportDotModifier } from "@/lib/colors";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { formatPageName } from "./utils/pageRoute";

interface PageRouteHeaderProps {
  report: Report;
  allReports: Report[];
  currentPage: ReportPage;
  pageId: string;
  prevPage: ReportPage | null;
  nextPage: ReportPage | null;
  displayUrl: string;
  totalUniqueChanges: number;
  activeBp: number;
}

/** Sticky title row for the page-detail route: breadcrumb with page-picker
 * dropdown on the left, change badge, and on the right a report-picker
 * dropdown plus prev/next/close nav. Owns only its two dropdown-open flags;
 * everything else is derived from props. */
export default function PageRouteHeader({
  report,
  allReports,
  currentPage,
  pageId,
  prevPage,
  nextPage,
  displayUrl,
  totalUniqueChanges,
  activeBp,
}: PageRouteHeaderProps) {
  const [showPageNav, setShowPageNav] = useState(false);
  const [showReportNav, setShowReportNav] = useState(false);

  const dateStr = formatRelativeTime(report.createdAt);
  const pageName = formatPageName(currentPage);
  const badgeMod =
    totalUniqueChanges > 0 ? "badge--warning-tint" : "badge--success-tint";

  return (
    <div className="report-page__header">
      <div className="report-page__title-row">
        <div className="report-page__title-group">
          <div className="report-page__title-inner">
            <Link
              href={`/reports/${report.id}?bp=${activeBp}`}
              className="report-page__domain"
            >
              {displayUrl}
            </Link>
            <span className="report-page__slash">/</span>

            <div className="report-page__page-name-wrap">
              <button
                onClick={() => {
                  setShowPageNav(!showPageNav);
                  setShowReportNav(false);
                }}
                className="report-page__page-btn"
                title={pageName}
              >
                <span className="report-page__page-name">{pageName}</span>
              </button>
              {showPageNav && (
                <>
                  <div
                    className="dropdown-backdrop"
                    onClick={() => setShowPageNav(false)}
                  />
                  <div
                    className="dropdown-panel"
                    style={{ position: "absolute", left: 0, top: 56, zIndex: 40 }}
                  >
                    {report.pages.map((page) => {
                      const label = formatPageName(page);
                      const isCurrent = page.pageId === pageId;
                      const pageBpResult = page.breakpoints[String(activeBp)];
                      const pageChanges = pageBpResult?.changeCount ?? 0;
                      const dotMod = pageChanges > 0 ? "warning" : "success";
                      return (
                        <Link
                          key={page.pageId}
                          href={`/reports/${report.id}/pages/${page.pageId}?bp=${activeBp}`}
                          onClick={() => setShowPageNav(false)}
                          className={`dropdown-item ${isCurrent ? "dropdown-item--active" : ""}`}
                        >
                          <span className="dropdown-item__truncate">{label}</span>
                          <span className={`status-dot status-dot--${dotMod}`} />
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <span className={`badge badge--xl ${badgeMod}`}>
            {totalUniqueChanges}
          </span>
        </div>

        <div className="report-page__nav">
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowReportNav(!showReportNav);
                setShowPageNav(false);
              }}
              className="report-page__date-btn"
              title={formatFullDateTime(report.createdAt)}
            >
              {dateStr}
              <span className={`status-dot status-dot--${reportDotModifier(report)}`} />
            </button>
            {showReportNav && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setShowReportNav(false)}
                />
                <div className="dropdown-panel" style={{ position: "absolute", right: 0, top: 32, zIndex: 40 }}>
                  {allReports.map((r) => {
                    const isCurrent = r.id === report.id;
                    return (
                      <Link
                        key={r.id}
                        href={`/reports/${r.id}/pages/${pageId}?bp=${activeBp}`}
                        onClick={() => setShowReportNav(false)}
                        title={formatFullDateTime(r.createdAt)}
                        className={`dropdown-item ${isCurrent ? "dropdown-item--active" : "dropdown-item--muted"}`}
                      >
                        <span className="dropdown-item__label">{formatRelativeTime(r.createdAt)}</span>
                        <span className={`status-dot status-dot--${reportDotModifier(r)}`} />
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {prevPage ? (
            <Link
              href={`/reports/${report.id}/pages/${prevPage.pageId}?bp=${activeBp}`}
              className="report-page__arrow"
              title={prevPage.path === "/" ? "index" : prevPage.path.replace(/^\//, "")}
            >
              <ChevronLeftIcon />
            </Link>
          ) : (
            <span className="report-page__arrow report-page__arrow--disabled">
              <ChevronLeftIcon />
            </span>
          )}

          {nextPage ? (
            <Link
              href={`/reports/${report.id}/pages/${nextPage.pageId}?bp=${activeBp}`}
              className="report-page__arrow"
              title={nextPage.path === "/" ? "index" : nextPage.path.replace(/^\//, "")}
            >
              <ChevronRightIcon />
            </Link>
          ) : (
            <span className="report-page__arrow report-page__arrow--disabled">
              <ChevronRightIcon />
            </span>
          )}

          <Link
            href={`/reports/${report.id}?bp=${activeBp}`}
            className="report-page__arrow"
            title="Back to report"
          >
            <CloseIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}
