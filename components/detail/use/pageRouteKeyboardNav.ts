import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Report } from "@/lib/types";

/** Wires left/right arrow keys to navigate between pages of the report, while
 * preserving the current breakpoint in the URL. Input focus suppresses the
 * shortcut so typing in fields stays unaffected. */
export function usePageRouteKeyboardNav(
  report: Report | null,
  pageId: string,
  activeBp: number,
): void {
  const router = useRouter();

  useEffect(() => {
    if (!report) return;
    const idx = report.pages.findIndex((p) => p.pageId === pageId);
    if (idx < 0) return;

    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        router.push(
          `/reports/${report.id}/pages/${report.pages[idx - 1].pageId}?bp=${activeBp}`,
        );
      } else if (e.key === "ArrowRight" && idx < report.pages.length - 1) {
        e.preventDefault();
        router.push(
          `/reports/${report.id}/pages/${report.pages[idx + 1].pageId}?bp=${activeBp}`,
        );
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [report, pageId, activeBp, router]);
}
