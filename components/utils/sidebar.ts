import type { Project, Report, SiteTest } from "@/lib/types";

export interface ProjectWithReports {
  project: Project;
  reports: Report[];
}

export interface TestWithLatestReport {
  test: SiteTest;
  latestReport: Report | null;
}

/** Extracts a host name (sans `www.`) from a URL string, falling back to the
 * raw input when it isn't a valid URL. */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Pairs a test with its most recent report (or null if it has never run). */
export function getTestWithLatestReport(
  test: SiteTest,
  reports: Report[],
): TestWithLatestReport {
  const testReports = reports
    .filter((r) => r.siteTestId === test.id)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return { test, latestReport: testReports[0] || null };
}

/** Sorts projects-with-reports by the saved order list, then falls back to
 * project creation time for projects the user hasn't reordered. */
export function sortByProjectOrder(
  items: ProjectWithReports[],
  projectOrder: string[],
): ProjectWithReports[] {
  return [...items].sort((a, b) => {
    const aIdx = projectOrder.indexOf(a.project.id);
    const bIdx = projectOrder.indexOf(b.project.id);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return (
      new Date(b.project.createdAt).getTime() -
      new Date(a.project.createdAt).getTime()
    );
  });
}
