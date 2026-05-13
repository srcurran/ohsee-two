"use client";

import { useEffect, useRef, useState } from "react";
import ChangeList from "@/components/detail/ChangeList";
import type { SemanticChange } from "@/lib/types";

interface PageRouteIssuesProps {
  changes: SemanticChange[];
  summary?: Record<string, number>;
  onIssueClick: (id: string) => void;
}

/** Collapsible wrapper around `ChangeList` for a single page-detail view.
 * Caps the list at 40vh and reveals a "Show all N issues" affordance only when
 * the content actually overflows; resizes are watched so a window resize can
 * toggle the affordance live. */
export default function PageRouteIssues({
  changes,
  summary,
  onIssueClick,
}: PageRouteIssuesProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => {
      const maxH = window.innerHeight * 0.4;
      setIsOverflowing(el.scrollHeight > maxH);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [changes]);

  const collapsed = isOverflowing && !expanded;

  return (
    <div>
      <div className="report-page__collapsible">
        <div
          ref={contentRef}
          className="report-page__collapsible-inner"
          style={{ maxHeight: collapsed ? "40vh" : "none" }}
        >
          <ChangeList
            changes={changes}
            summary={summary}
            onChangeClick={onIssueClick}
          />
        </div>
        {collapsed && (
          <div className="report-page__fade">
            <button
              onClick={() => setExpanded(true)}
              className="report-page__show-all"
            >
              Show all {changes.length} issues
            </button>
          </div>
        )}
      </div>
      {expanded && isOverflowing && (
        <button
          onClick={() => setExpanded(false)}
          className="report-page__collapse"
        >
          Collapse
        </button>
      )}
    </div>
  );
}
