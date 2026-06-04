/** Drag-to-reorder for the test-settings step list. Tracks the dragged
 * index, commits the reorder on each dragenter (so the user sees a live
 * preview), and triggers one save on dragend. */

import { useRef, useState } from "react";
import type { TestStep } from "@/lib/types";

interface UseStepDragArgs {
  setSteps: React.Dispatch<React.SetStateAction<TestStep[]>>;
  scheduleSave: () => void;
}

export interface UseStepDragResult {
  dragIndex: number | null;
  onDragStart: (i: number) => void;
  onDragEnter: (i: number) => void;
  onDragEnd: () => void;
}

export function useStepDrag({
  setSteps,
  scheduleSave,
}: UseStepDragArgs): UseStepDragResult {
  // `dragIndex` (state) drives the row's dragging style. The ref mirrors it as
  // the source of truth for the reorder math: dragenter can fire several times
  // before React re-renders (notably while the list auto-scrolls under a held
  // drag), and reading a stale closure value there would splice the wrong row
  // out of the already-reordered array — swapping the dragged item with another.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const onDragStart = (i: number) => {
    dragIndexRef.current = i;
    setDragIndex(i);
  };

  const onDragEnter = (i: number) => {
    const from = dragIndexRef.current;
    if (from === null || i === from) return;
    // Advance the ref synchronously so a burst of dragenters stays consistent.
    dragIndexRef.current = i;
    setDragIndex(i);
    setSteps((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
  };

  const onDragEnd = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    scheduleSave();
  };

  return { dragIndex, onDragStart, onDragEnter, onDragEnd };
}
