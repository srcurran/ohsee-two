/** Owns the test-settings overlay's working state: loads the project, holds
 * locally-edited fields (name, steps, breakpoints, variants, credentials),
 * and persists changes via a debounced PUT to /api/projects/[id]. Exposes a
 * `persist` for immediate writes (archive) and `flushSave` for shutdown. */

import { useCallback, useEffect, useRef, useState } from "react";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { getTestSteps } from "@/lib/test-steps";
import type {
  Project,
  SiteTest,
  TestStep,
  TestCredentials,
} from "@/lib/types";

const SAVE_DEBOUNCE_MS = 600;

interface UseTestSettingsDataArgs {
  projectId: string;
  testId: string;
  /** Called after each successful PUT so the sidebar dots/names update. */
  refreshProjects: () => void;
  /** Invoked when the test can't be found on the loaded project. */
  onMissing: () => void;
}

export interface UseTestSettingsDataResult {
  project: Project | null;
  activeTest: SiteTest | undefined;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  steps: TestStep[];
  setSteps: React.Dispatch<React.SetStateAction<TestStep[]>>;
  /** Advanced single script (empty for simple tests). */
  script: string;
  setScript: React.Dispatch<React.SetStateAction<string>>;
  breakpoints: number[];
  setBreakpoints: React.Dispatch<React.SetStateAction<number[]>>;
  variantIds: string[];
  setVariantIds: React.Dispatch<React.SetStateAction<string[]>>;
  credentials: TestCredentials | undefined;
  setCredentials: React.Dispatch<
    React.SetStateAction<TestCredentials | undefined>
  >;
  /** Advanced: selected site-level sign-in profile id. */
  authProfileId: string | undefined;
  setAuthProfileId: React.Dispatch<React.SetStateAction<string | undefined>>;
  /** Immediate write of a partial test patch (used by archive). */
  persist: (testPatch: Partial<SiteTest>) => Promise<void>;
  /** Force a save of all current local state right now. */
  flushSave: () => void;
  /** Queue a debounced save (resets the timer). */
  scheduleSave: () => void;
  /** Clear the debounce timer + flush synchronously. Used on close. */
  cancelAndFlushIfPending: () => void;
}

export function useTestSettingsData({
  projectId,
  testId,
  refreshProjects,
  onMissing,
}: UseTestSettingsDataArgs): UseTestSettingsDataResult {
  const [project, setProject] = useState<Project | null>(null);

  // Local working state — editing happens against these and writes back to
  // the API via debounced PUT. The whole project is loaded so we can update
  // the test in-place while keeping siblings intact.
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [script, setScript] = useState("");
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<TestCredentials | undefined>(
    undefined,
  );
  const [authProfileId, setAuthProfileId] = useState<string | undefined>(undefined);

  const stateRef = useRef({ name, steps, script, breakpoints, variantIds, credentials, authProfileId });
  stateRef.current = { name, steps, script, breakpoints, variantIds, credentials, authProfileId };
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project + this test's state
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        const test = p.tests?.find((t) => t.id === testId);
        if (!test) {
          onMissing();
          return;
        }
        setProject(p);
        setName(test.name);
        setSteps(getTestSteps(test));
        setScript(test.script ?? "");
        setBreakpoints(test.breakpoints?.length ? test.breakpoints : [...BREAKPOINTS]);
        setVariantIds((test.variants || []).map((v) => v.id));
        setCredentials(test.credentials);
        setAuthProfileId(test.authProfileId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, testId]);

  const persist = useCallback(
    async (testPatch: Partial<SiteTest>) => {
      if (!project) return;
      const tests = (project.tests || []).map((t) =>
        t.id === testId ? { ...t, ...testPatch } : t,
      );
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tests }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        refreshProjects();
      }
    },
    [project, projectId, testId, refreshProjects],
  );

  const flushSave = useCallback(() => {
    const s = stateRef.current;
    persist({
      name: s.name.trim() || "Untitled test",
      steps: s.steps,
      script: s.script,
      breakpoints: s.breakpoints,
      variants: BUILT_IN_VARIANTS.filter((v) => s.variantIds.includes(v.id)),
      credentials: s.credentials,
      authProfileId: s.authProfileId,
    });
  }, [persist]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const cancelAndFlushIfPending = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      flushSave();
    }
  }, [flushSave]);

  // The active test object (always derived from project + testId so live
  // edits propagate without needing an extra useState).
  const activeTest: SiteTest | undefined = project?.tests?.find(
    (t) => t.id === testId,
  );

  return {
    project,
    activeTest,
    name,
    setName,
    steps,
    setSteps,
    script,
    setScript,
    breakpoints,
    setBreakpoints,
    variantIds,
    setVariantIds,
    credentials,
    setCredentials,
    authProfileId,
    setAuthProfileId,
    persist,
    flushSave,
    scheduleSave,
    cancelAndFlushIfPending,
  };
}
