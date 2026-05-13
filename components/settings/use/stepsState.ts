/** Step-list CRUD for the test-settings overlay: updates, additions,
 * delete-with-undo (3 s grace), and the pending-delete row state. The
 * underlying `steps` array is owned by `useTestSettingsData`; this hook
 * augments the setter with the inline-undo behavior. */

import { useEffect, useRef, useState } from "react";
import type { TestStep } from "@/lib/types";

const UNDO_GRACE_MS = 3000;

interface UseStepsStateArgs {
  steps: TestStep[];
  setSteps: React.Dispatch<React.SetStateAction<TestStep[]>>;
  scheduleSave: () => void;
}

export interface UseStepsStateResult {
  pendingDelete: { index: number; step: TestStep } | null;
  updateStep: (id: string, patch: Partial<TestStep>) => void;
  removeStep: (id: string) => void;
  undoDelete: () => void;
  addUrlStep: (url: string) => void;
  addScriptStep: (name: string, script: string) => void;
}

export function useStepsState({
  steps,
  setSteps,
  scheduleSave,
}: UseStepsStateArgs): UseStepsStateResult {
  // Inline-undo for delete: when set, the step list renders a "Deleted: …
  // Undo" row at this index in place of the removed step. Saves are
  // deferred until the timer expires; if the user undoes within 3 s the
  // step is restored at its original position with no save churn.
  const [pendingDelete, setPendingDelete] = useState<{
    index: number;
    step: TestStep;
  } | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateStep = (id: string, patch: Partial<TestStep>) => {
    setSteps((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    scheduleSave();
  };

  const removeStep = (id: string) => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const step = steps[idx];

    // If a previous pending delete is still active, finalize it before
    // queuing the new one (don't lose its persistence).
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
      scheduleSave();
    }

    setSteps((cur) => cur.filter((s) => s.id !== id));
    setPendingDelete({ index: idx, step });

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      setPendingDelete(null);
      scheduleSave();
    }, UNDO_GRACE_MS);
  };

  const undoDelete = () => {
    // Read pendingDelete from state (not via the updater) so setSteps fires
    // exactly once. Calling setSteps inside a setPendingDelete updater
    // gets the splice run twice under React StrictMode and duplicates the
    // restored step.
    if (!pendingDelete) return;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const { index, step } = pendingDelete;
    setSteps((cur) => {
      const next = [...cur];
      next.splice(index, 0, step);
      return next;
    });
    setPendingDelete(null);
  };

  const addUrlStep = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setSteps((cur) => [
      ...cur,
      { id: crypto.randomUUID(), type: "url", url: trimmed, captureScreenshot: true },
    ]);
    scheduleSave();
  };

  const addScriptStep = (name: string, script: string) => {
    setSteps((cur) => [
      ...cur,
      {
        id: crypto.randomUUID(),
        type: "microtest",
        name: name.trim() || "Untitled step",
        script,
        captureScreenshot: true,
      },
    ]);
    scheduleSave();
  };

  // Persist any pending delete + drag save when the overlay unmounts.
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
        // The pending step has already been removed from local state;
        // flushSave on close will write it.
      }
    };
  }, []);

  return {
    pendingDelete,
    updateStep,
    removeStep,
    undoDelete,
    addUrlStep,
    addScriptStep,
  };
}
