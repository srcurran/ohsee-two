/** Drag-to-reorder for the test-settings step list. Tracks the dragged
 * index, commits the reorder on each dragenter (so the user sees a live
 * preview), and triggers one save on dragend. */

import { useState } from "react";
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const onDragStart = (i: number) => setDragIndex(i);

  const onDragEnter = (i: number) => {
    if (dragIndex === null || i === dragIndex) return;
    setSteps((cur) => {
      const next = [...cur];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(i);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    scheduleSave();
  };

  return { dragIndex, onDragStart, onDragEnter, onDragEnd };
}
