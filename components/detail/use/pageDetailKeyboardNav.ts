/** Keyboard navigation for the PageDetailPanel: Escape closes, ArrowLeft /
 * ArrowRight step through sibling pages. Inputs and textareas are excluded
 * so typing in a field doesn't hijack the keys. */

import { useEffect } from "react";
import type { ReportPage } from "@/lib/types";

interface UsePageDetailKeyboardNavArgs {
  prevPage: ReportPage | null;
  nextPage: ReportPage | null;
  onNavigate: (pageId: string) => void;
  onClose: () => void;
}

export function usePageDetailKeyboardNav({
  prevPage,
  nextPage,
  onNavigate,
  onClose,
}: UsePageDetailKeyboardNavArgs) {
  // Effect intentionally re-binds every render so prev/next/handlers stay
  // fresh — matches original behavior (the source had no dep array).
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && prevPage) {
        e.preventDefault();
        onNavigate(prevPage.pageId);
      } else if (e.key === "ArrowRight" && nextPage) {
        e.preventDefault();
        onNavigate(nextPage.pageId);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });
}
