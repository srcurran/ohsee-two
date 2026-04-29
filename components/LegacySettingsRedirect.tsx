"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";

/**
 * Catches direct visits to the retired `/projects/[id]/settings/*` routes
 * (general, tests, advanced, pages, flows) and redirects them to the
 * project home with the equivalent overlay opened. Bookmarks and stale
 * tabs that previously rendered the legacy settings UI keep working.
 *
 * - `?testId=<id>` (any of the routes) opens the test settings overlay
 *   for that test.
 * - Otherwise the project settings overlay opens.
 *
 * Renders nothing visible — the replace + overlay open happen on mount.
 * Suspense wrapper is here so each callsite can be a one-liner; Next 15+
 * requires it around `useSearchParams`.
 */
export default function LegacySettingsRedirect() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}

function RedirectInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { openProjectSettings, openTestSettings } = useSidebar();

  useEffect(() => {
    const projectId = params.id;
    if (!projectId) return;
    const testId = search.get("testId");
    router.replace(`/projects/${projectId}`);
    if (testId) {
      openTestSettings(projectId, testId);
    } else {
      openProjectSettings(projectId);
    }
  }, [params.id, search, router, openProjectSettings, openTestSettings]);

  return null;
}
