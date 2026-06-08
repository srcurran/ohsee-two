/** Keyboard shortcuts for the report view (Electron / browser):
 *
 *   Cmd/Ctrl + 1…8  — switch "mode", indexing left-to-right across the report
 *                      bar: the breakpoints (screen sizes) first, then the
 *                      capture variants (e.g. Light / Dark). For a report with
 *                      breakpoints [375, 720, 1280] and variants [light, dark]:
 *                        1→375  2→720  3→1280  4→Light  5→Dark
 *                      Numbers past the available modes are ignored.
 *   Cmd/Ctrl + 9     — show All pages
 *   Cmd/Ctrl + 0     — show Changes only
 *
 * The handlers all write to the URL, which drives both the grid and an open
 * page-detail panel, so the shortcuts work in either view. Latest props are
 * read through a ref so the window listener is registered just once. */

import { useEffect, useRef } from "react";
import { getOhsee } from "@/lib/electron";
import type { ReportFilterMode } from "@/components/index/use/reportUrlState";

interface UseReportModeShortcutsArgs {
  breakpoints: number[];
  variants: string[];
  onBpChange: (bp: number) => void;
  onVariantChange: (variantId: string | null) => void;
  onFilterChange: (mode: ReportFilterMode) => void;
}

export function useReportModeShortcuts(args: UseReportModeShortcutsArgs): void {
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });

  useEffect(() => {
    // Route a 0–9 digit to a view action. Shared by the browser keydown path
    // and the Electron IPC path.
    const handleDigit = (n: number) => {
      const { breakpoints, variants, onBpChange, onVariantChange, onFilterChange } =
        latest.current;
      if (n === 9) return onFilterChange("all");
      if (n === 0) return onFilterChange("changes");
      // 1…8 index into [breakpoints…, variants…].
      const idx = n - 1;
      if (idx < breakpoints.length) return onBpChange(breakpoints[idx]);
      const vIdx = idx - breakpoints.length;
      if (vIdx < variants.length) onVariantChange(variants[vIdx]);
    };

    // Browser / web build: catch the key directly. In Electron these presses
    // are preventDefaulted in the main process (so Cmd+0 isn't eaten by Reset
    // Zoom), so this listener never fires there — the IPC path below does.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const m = /^Digit([0-9])$/.exec(e.code);
      if (!m) return;
      e.preventDefault();
      handleDigit(Number(m[1]));
    };
    window.addEventListener("keydown", onKey);

    // Electron: main intercepts Cmd/Ctrl+digit and forwards the digit here.
    const off = getOhsee()?.onModeShortcut?.(handleDigit);

    return () => {
      window.removeEventListener("keydown", onKey);
      off?.();
    };
  }, []);
}
