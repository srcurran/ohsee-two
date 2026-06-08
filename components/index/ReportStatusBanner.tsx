/** Inline cancelled / failed banners under the report header. Renders
 * nothing for any other status, so callers can drop this in unconditionally. */

import type { Report } from "@/lib/types";

export function ReportStatusBanner({ report }: { report: Report }) {
  if (report.status === "cancelled") {
    return (
      <div className="report__status-banner">
        <p className="report__status-banner-title">
          This report was cancelled by the user.
        </p>
      </div>
    );
  }
  if (report.status === "failed") {
    return (
      <div className="report__status-banner report__status-banner--error">
        <p className="report__status-banner-title report__status-banner-title--error">
          Report failed
        </p>
        {report.error && (
          <pre className="report__status-banner-detail">{report.error}</pre>
        )}
      </div>
    );
  }
  // Non-fatal: the script stopped before capturing all its snapshots. The run
  // still completed with whatever it got, so this is a warning, not a failure.
  if (report.scriptError) {
    return (
      <div className="report__status-banner report__status-banner--error">
        <p className="report__status-banner-title report__status-banner-title--error">
          Script stopped before finishing
        </p>
        <pre className="report__status-banner-detail">{report.scriptError}</pre>
      </div>
    );
  }
  return null;
}
