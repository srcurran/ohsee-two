"use client";

import Link from "next/link";
import { describeUrlIssues, type UrlReachabilityIssue } from "@/lib/url-reachability";
import type { ErrorModalDetails } from "@/components/ErrorModal";

/** Shape the report-run POST endpoints return on a 4xx/5xx. */
interface RunErrorApiBody {
  error?: string;
  issues?: UrlReachabilityIssue[];
}

/**
 * Translate a failed POST /reports response into the structured payload
 * the ErrorModal renders. Each caller passes its own projectId so the
 * "settings" link in the hint resolves to the right project.
 *
 * Keeping this in one place means the eyebrow/title/body wording for run
 * failures is consistent across the project page, the test page, and the
 * report page — adjust here once instead of in three call sites.
 */
export function buildRunErrorDetails(
  body: RunErrorApiBody | null | undefined,
  projectId: string,
): ErrorModalDetails {
  const settingsLink = (
    <Link href={`/projects/${projectId}/settings`}>settings</Link>
  );

  if (body?.issues && body.issues.length > 0) {
    return {
      ...describeUrlIssues(body.issues),
      hint: <>Confirm the URL is correct in {settingsLink}.</>,
    };
  }

  // Anything that isn't a structured URL-reachability failure (a 500, an
  // unknown 4xx, etc.) — fall back to a generic title/body so the modal
  // still renders cleanly with the same hierarchy.
  return {
    eyebrow: "Test was not able to run",
    title: "Couldn't start the run",
    body: body?.error ?? "An unknown error occurred.",
    hint: <>Try again, or check your {settingsLink}.</>,
  };
}
