/** Header row for the PageDetailPanel: page title menu, change-count badge,
 * report timestamp, page-jump dropdown, prev/next/close controls. Owns
 * nothing beyond its child menus' open state. */

"use client";

import { useState } from "react";
import { Icon } from "@/components/utility/Icon";
import { formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { reportDotModifier } from "@/lib/colors";
import type { Report, ReportPage } from "@/lib/types";

interface PageDetailHeaderProps {
  report: Report;
  pageId: string;
  pageName: string;
  prodUrl: string;
  devUrl: string;
  badgeMod: string;
  badgeContent: number | "—";
  activeBp: number;
  prevPage: ReportPage | null;
  nextPage: ReportPage | null;
  getPageLabel: (page: ReportPage) => string;
  onNavigate: (pageId: string) => void;
  onClose: () => void;
}

export function PageDetailHeader({
  report,
  pageId,
  pageName,
  prodUrl,
  devUrl,
  badgeMod,
  badgeContent,
  activeBp,
  prevPage,
  nextPage,
  getPageLabel,
  onNavigate,
  onClose,
}: PageDetailHeaderProps) {
  return (
    <div
      className="page-detail-panel__header animate-card-in"
      style={{ animationDelay: "0ms" }}
    >
      <div className="page-detail-panel__title-group">
        <PageTitleMenu label={pageName} prodUrl={prodUrl} devUrl={devUrl} />
        <span className={`badge badge--lg ${badgeMod}`}>{badgeContent}</span>
      </div>

      <div className="page-detail-panel__nav">
        <div className="page-detail-panel__date-group">
          <span
            className="page-detail-panel__date"
            title={formatFullDateTime(report.createdAt)}
          >
            {formatRelativeTime(report.createdAt)}
          </span>
          <span
            className={`status-dot status-dot--${reportDotModifier(report)}`}
          />
        </div>

        <PageNavDropdown
          pages={report.pages}
          currentPageId={pageId}
          activeBp={activeBp}
          getLabel={getPageLabel}
          onSelect={onNavigate}
        />

        <button
          onClick={() => prevPage && onNavigate(prevPage.pageId)}
          disabled={!prevPage}
          className="icon-btn"
          title="Previous page"
        >
          <Icon name="chevron-left" size={18} />
        </button>

        <button
          onClick={() => nextPage && onNavigate(nextPage.pageId)}
          disabled={!nextPage}
          className="icon-btn"
          title="Next page"
        >
          <Icon name="chevron-right" size={18} />
        </button>

        <button onClick={onClose} className="icon-btn" title="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}

/** Page title that doubles as a dropdown of prod/dev URLs. */
function PageTitleMenu({
  label,
  prodUrl,
  devUrl,
}: {
  label: string;
  prodUrl: string;
  devUrl: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="page-title-menu">
      <button
        onClick={() => setOpen(!open)}
        className="page-title-menu__trigger"
      >
        {label}
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="page-title-menu__panel">
            {prodUrl && (
              <a
                href={prodUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="page-title-menu__item"
              >
                <span className="page-title-menu__kind">Prod</span>
                <span className="page-title-menu__url">{prodUrl}</span>
              </a>
            )}
            {devUrl && (
              <a
                href={devUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="page-title-menu__item"
              >
                <span className="page-title-menu__kind">Dev</span>
                <span className="page-title-menu__url">{devUrl}</span>
              </a>
            )}
            {!prodUrl && !devUrl && (
              <span className="page-title-menu__url">
                URL unavailable for this step.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PageNavDropdown({
  pages,
  currentPageId,
  activeBp,
  getLabel,
  onSelect,
}: {
  pages: ReportPage[];
  currentPageId: string;
  activeBp: number;
  getLabel: (page: ReportPage) => string;
  onSelect: (pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        className="icon-btn"
        title="Jump to page"
      >
        <Icon name="chevron-down" size={18} />
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div
            className="dropdown-panel"
            style={{ position: "absolute", right: 0, top: 40, zIndex: 40 }}
          >
            {pages.map((page) => {
              const label = getLabel(page);
              const isCurrent = page.pageId === currentPageId;
              const pageBpResult = page.breakpoints[String(activeBp)];
              const pageChanges = pageBpResult?.changeCount ?? 0;
              const hasScreenshot = !!pageBpResult?.prodScreenshot;
              const dotMod = !hasScreenshot
                ? "disabled"
                : pageChanges > 0
                  ? "warning"
                  : "success";
              return (
                <button
                  key={page.pageId}
                  onClick={() => {
                    onSelect(page.pageId);
                    setOpen(false);
                  }}
                  className={`dropdown-item ${isCurrent ? "dropdown-item--active" : ""}`}
                >
                  <span className="dropdown-item__label">{label}</span>
                  <span className={`status-dot status-dot--${dotMod}`} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
