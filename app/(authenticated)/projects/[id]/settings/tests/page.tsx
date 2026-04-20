"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import { FlowEditor } from "@/components/FlowEditor";
import { splitIntoSteps } from "@/components/MicroTestImportModal";
import MicroTestEditor from "@/components/MicroTestEditor";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import CodegenRecorder from "@/components/CodegenRecorder";
import AccordionSection from "@/components/AccordionSection";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { Project, SiteTest, FlowEntry, MicroTest, TestComposition, TestCompositionStep } from "@/lib/types";
import { resolveProjectPath } from "@/lib/url-utils";

type AccordionKey = "pages" | "flow" | "settings";

export default function ProjectTestsSettings() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  // Test name
  const [testName, setTestName] = useState("");

  // Pages state
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);
  const pathInputRef = useRef<HTMLInputElement | null>(null);

  // Accordion state — one section open at a time. Defaults to "pages".
  const [openSection, setOpenSection] = useState<AccordionKey | null>("pages");

  // Name inline-edit state. Click the heading to enter edit mode.
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Flows state (legacy)
  const [flows, setFlows] = useState<FlowEntry[]>([]);

  // Single composition per test + micro-tests
  const [composition, setComposition] = useState<TestComposition | null>(null);
  const [microTests, setMicroTests] = useState<MicroTest[]>([]);

  // Import state (inline, not modal)
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Step detail popup
  const [editingStepMicroTestId, setEditingStepMicroTestId] = useState<string | null>(null);
  const [addingNewStep, setAddingNewStep] = useState(false);

  // Breakpoints + variants
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setMicroTests(p.microTests ?? []);
        const tests = p.tests || [];
        if (tests.length > 0 && !selectedTestId) {
          const queryTestId = searchParams.get("testId");
          const target = queryTestId && tests.find((t: SiteTest) => t.id === queryTestId);
          setSelectedTestId(target ? target.id : tests[0].id);
        }
      });
  }, [params.id]);

  // Snapshot of last-saved field values. Used by the autosave effect to skip
  // firing when incoming state matches what the server already has (e.g.
  // right after loading a test).
  const lastSavedSnapshotRef = useRef<string>("");
  // Which testId has already been hydrated into local state. Guards the load
  // effect from clobbering in-progress user edits after a save-triggered
  // setProject() replaces the project reference.
  const loadedTestIdRef = useRef<string | null>(null);

  // Sync all fields when selected test changes
  useEffect(() => {
    if (!project || !selectedTestId) return;
    if (loadedTestIdRef.current === selectedTestId) return;
    const test = project.tests?.find((t) => t.id === selectedTestId);
    if (test) {
      loadedTestIdRef.current = selectedTestId;
      const pagesFromTest = test.pages.map((pg) => pg.path);
      const bps = test.breakpoints?.length
        ? test.breakpoints
        : project.breakpoints?.length
          ? project.breakpoints
          : [...BREAKPOINTS];
      const variantsFromTest = test.variants?.length
        ? test.variants.map((v) => v.id)
        : (project.variants || []).map((v) => v.id);
      const compositionFromTest = test.compositions?.[0] ?? null;
      const flowsFromTest = test.flows || [];

      setTestName(test.name);
      setPaths(pagesFromTest);
      setFlows(flowsFromTest);
      setComposition(compositionFromTest);
      setBreakpoints(bps);
      setSelectedVariants(variantsFromTest);
      // Reset import/editing state
      setImportCode("");
      setImportError(null);
      setEditingStepMicroTestId(null);
      setAddingNewStep(false);

      // Seed the snapshot so the autosave effect doesn't fire on load.
      lastSavedSnapshotRef.current = JSON.stringify({
        testName: test.name,
        paths: pagesFromTest,
        flows: flowsFromTest,
        composition: compositionFromTest,
        breakpoints: bps,
        selectedVariants: variantsFromTest,
      });
    }
  }, [project, selectedTestId]);

  const tests = project?.tests || [];
  const selectedTest = tests.find((t) => t.id === selectedTestId);

  // Autosave — debounce 500ms after the last edit. Skips when the snapshot
  // matches what we last wrote (e.g. immediately after loading a test).
  // handleSaveRef is assigned below so this effect can call the current
  // version without forcing the effect to depend on handleSave's identity.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveRef = useRef<() => Promise<void>>(undefined as any);
  useEffect(() => {
    if (!selectedTestId) return;
    const snapshot = JSON.stringify({
      testName,
      paths,
      flows,
      composition,
      breakpoints,
      selectedVariants,
    });
    if (snapshot === lastSavedSnapshotRef.current) return;
    const timer = setTimeout(async () => {
      await handleSaveRef.current?.();
      lastSavedSnapshotRef.current = snapshot;
    }, 500);
    return () => clearTimeout(timer);
  }, [testName, paths, flows, composition, breakpoints, selectedVariants, selectedTestId]);

  const addTest = async () => {
    if (!project) return;
    const newTest: SiteTest = {
      id: crypto.randomUUID(),
      name: "New Test",
      pages: [{ id: crypto.randomUUID(), path: "/" }],
      flows: [],
      compositions: [],
      breakpoints: [...BREAKPOINTS],
      variants: [],
      createdAt: new Date().toISOString(),
      lastRunAt: null,
    };
    const updatedTests = [...(project.tests || []), newTest];
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tests: updatedTests }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      setSelectedTestId(newTest.id);
      refreshProjects();
    }
  };

  // Pages handlers
  const handleAddPath = () => {
    const allowed = project ? [project.prodUrl, project.devUrl] : [];
    const result = resolveProjectPath(newPath, allowed);
    if (!result.ok) {
      setPathError(result.error);
      return;
    }
    if (paths.includes(result.path)) {
      setPathError(`"${result.path}" is already in this test.`);
      return;
    }
    setPaths([...paths, result.path]);
    setNewPath("");
    setPathError(null);
  };

  const handleRemovePath = (path: string) => {
    setPaths(paths.filter((p) => p !== path));
  };

  const handleDragStart = (index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  };

  const handleDragEnter = (index: number) => {
    if (dragIndex === null || index === dragIndex) return;
    setDragOverIndex(index);
    setPaths((prev) => {
      const next = [...prev];
      const item = next.splice(dragIndex, 1)[0];
      next.splice(index, 0, item);
      setDragIndex(index);
      return next;
    });
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragNode.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Legacy flows handlers
  const updateFlow = (idx: number, updated: FlowEntry) => {
    const next = [...flows];
    next[idx] = updated;
    setFlows(next);
  };

  const removeFlow = (idx: number) => {
    setFlows(flows.filter((_, i) => i !== idx));
  };

  // Import handler — creates micro-tests + sets the single composition
  const handleImport = async () => {
    const steps = importCode.trim() ? splitIntoSteps(importCode) : null;
    if (!steps) return;
    setImporting(true);
    setImportError(null);

    const created: MicroTest[] = [];
    for (const step of steps) {
      const res = await fetch(`/api/projects/${params.id}/micro-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: step.name,
          displayName: step.displayName,
          script: step.lines.filter((l) => !l.trim().startsWith("//")).join("\n"),
        }),
      });

      if (res.ok) {
        const mt: MicroTest = await res.json();
        created.push(mt);
      } else {
        const data = await res.json().catch(() => null);
        setImportError(data?.error ?? `Failed to create step "${step.displayName}"`);
        setImporting(false);
        return;
      }
    }

    setMicroTests([...microTests, ...created]);
    const comp: TestComposition = {
      id: crypto.randomUUID(),
      name: testName || "Flow",
      startPath: "/",
      steps: created.map((mt) => ({
        id: crypto.randomUUID(),
        microTestId: mt.id,
        captureScreenshot: true,
      })),
    };
    setComposition(comp);
    setImportCode("");
    setImporting(false);
  };

  // Step management
  const getMicroTestName = useCallback((microTestId: string): string => {
    const mt = microTests.find((m) => m.id === microTestId);
    return mt?.displayName ?? "Unknown step";
  }, [microTests]);

  const updateStep = (stepId: string, updates: Partial<TestCompositionStep>) => {
    if (!composition) return;
    setComposition({
      ...composition,
      steps: composition.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    });
  };

  const removeStep = (stepId: string) => {
    if (!composition) return;
    setComposition({
      ...composition,
      steps: composition.steps.filter((s) => s.id !== stepId),
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    if (!composition) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= composition.steps.length) return;
    const steps = [...composition.steps];
    [steps[index], steps[newIndex]] = [steps[newIndex], steps[index]];
    setComposition({ ...composition, steps });
  };

  const handleAddNewStep = async () => {
    const res = await fetch(`/api/projects/${params.id}/micro-tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `step${(composition?.steps.length ?? 0) + 1}`,
        displayName: `Step ${(composition?.steps.length ?? 0) + 1}`,
        script: '// Your Playwright script here\nawait page.waitForTimeout(1000);',
      }),
    });

    if (res.ok) {
      const mt: MicroTest = await res.json();
      setMicroTests([...microTests, mt]);
      const newStep: TestCompositionStep = {
        id: crypto.randomUUID(),
        microTestId: mt.id,
        captureScreenshot: true,
      };
      if (composition) {
        setComposition({ ...composition, steps: [...composition.steps, newStep] });
      } else {
        setComposition({
          id: crypto.randomUUID(),
          name: testName || "Flow",
          startPath: "/",
          steps: [newStep],
        });
      }
      setEditingStepMicroTestId(mt.id);
      setAddingNewStep(false);
    }
  };

  // Remove the entire flow
  const handleRemoveFlow = () => {
    setComposition(null);
  };

  // Save all fields for the selected test. Called directly by autosave;
  // no UI spinner needed since saves are invisible to the user.
  const handleSave = async () => {
    if (!project || !selectedTestId || !selectedTest) return;

    const existingByPath = new Map(selectedTest.pages.map((p) => [p.path, p]));
    const updatedPages = paths.map((path) => {
      const existing = existingByPath.get(path);
      return existing || { id: crypto.randomUUID(), path };
    });

    const updatedTests = project.tests!.map((t) =>
      t.id === selectedTestId
        ? {
            ...t,
            name: testName.trim() || t.name,
            pages: updatedPages,
            flows,
            compositions: composition ? [composition] : [],
            breakpoints,
            variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
          }
        : t
    );

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tests: updatedTests, microTests }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      setMicroTests(updated.microTests ?? []);
      refreshProjects();
    }
  };

  // Keep the ref pointing at the current handleSave closure so the autosave
  // effect always invokes the latest version.
  handleSaveRef.current = handleSave;

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="flex flex-col items-start gap-[16px]">
        <div>
          <h2 className="mb-[4px] text-[18px] font-bold text-foreground">Create your first test</h2>
          <p className="text-[14px] text-text-muted">
            Tests define which pages and flows to compare between production and dev. You can add pages and flows after creation.
          </p>
        </div>
        <button
          onClick={addTest}
          className="rounded-[8px] bg-foreground px-[20px] py-[10px] text-[14px] font-bold text-surface-content transition-all hover:-translate-y-[1px] hover:shadow-elevation-md"
        >
          + New Test
        </button>
      </div>
    );
  }

  const editingMicroTest = editingStepMicroTestId
    ? microTests.find((mt) => mt.id === editingStepMicroTestId)
    : null;

  const parsedImportSteps = importCode.trim() ? splitIntoSteps(importCode) : null;

  return (
    <>
    {/* Step detail popup */}
    {editingMicroTest && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) setEditingStepMicroTestId(null); }}
      >
        <div className="w-full max-w-[640px] max-h-[80vh] overflow-auto rounded-[12px] bg-surface-content p-[24px]">
          <MicroTestEditor
            projectId={params.id}
            microTest={editingMicroTest}
            onSave={(updated) => {
              setMicroTests(microTests.map((mt) => (mt.id === updated.id ? updated : mt)));
            }}
            onClose={() => setEditingStepMicroTestId(null)}
          />
        </div>
      </div>
    )}

    <div className="flex gap-[1px]">
      {/* Left: test list */}
      <div className="w-[180px] shrink-0 pr-[24px] border-r border-border-secondary">
        <div className="flex flex-col gap-[4px]">
          {tests.map((test) => (
            <button
              key={test.id}
              onClick={() => setSelectedTestId(test.id)}
              className={`text-left rounded-[4px] px-[8px] py-[6px] text-[16px] transition-colors ${
                selectedTestId === test.id
                  ? "font-semibold text-foreground"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              {test.name}
            </button>
          ))}
          <button
            onClick={addTest}
            className="flex items-center gap-[4px] px-[8px] py-[6px] text-[14px] text-text-muted transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add test
          </button>
        </div>
      </div>

      {/* Right: settings for selected test */}
      <div className="flex-1 pl-[24px] max-w-[560px]">
        {selectedTest && (
          <>
            {/* Test name — heading with inline edit on click. Autosave
                persists the rename; Enter/Escape/blur simply exit edit mode. */}
            <div className="mb-[16px]">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === "New Test") e.target.select();
                  }}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      setEditingName(false);
                    }
                  }}
                  autoFocus
                  className="w-full border-b border-border-primary bg-transparent pb-[4px] text-[28px] font-bold text-foreground outline-none transition-colors focus:border-foreground"
                />
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  className="group flex items-center gap-[8px] text-left"
                >
                  <h1 className="text-[28px] font-bold text-foreground">
                    {testName || "Untitled Test"}
                  </h1>
                  <span className="opacity-0 transition-opacity group-hover:opacity-60">
                    <PencilIcon />
                  </span>
                </button>
              )}
            </div>

            {/* Pages accordion */}
            <AccordionSection
              label="Pages"
              count={paths.length}
              open={openSection === "pages"}
              onToggle={() => {
                const willOpen = openSection !== "pages";
                setOpenSection(willOpen ? "pages" : null);
                if (willOpen) {
                  // Deferred to next frame so the input exists in the DOM.
                  requestAnimationFrame(() => pathInputRef.current?.focus());
                }
              }}
            >
              <p className="mb-[16px] text-[14px] text-text-muted">
                URL paths to capture during each scan.
              </p>

              <div className="mb-[4px] flex gap-[8px]">
                <input
                  ref={pathInputRef}
                  type="text"
                  value={newPath}
                  onChange={(e) => {
                    setNewPath(e.target.value);
                    if (pathError) setPathError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                  placeholder="Enter page url"
                  className={`flex-1 rounded-[8px] border bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted ${
                    pathError
                      ? "border-status-error focus:border-status-error"
                      : "border-border-primary focus:border-foreground"
                  }`}
                />
                <button
                  onClick={handleAddPath}
                  className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
                >
                  Add
                </button>
              </div>
              {pathError && (
                <p className="mb-[12px] text-[13px] text-status-error">{pathError}</p>
              )}
              {!pathError && <div className="mb-[16px]" />}

              <div>
                {paths.map((p, i) => (
                  <div
                    key={p}
                    draggable
                    onDragStart={(e) => handleDragStart(i, e)}
                    onDragEnter={() => handleDragEnter(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between rounded-[6px] py-[8px] text-[14px] text-foreground transition-colors ${
                      dragOverIndex === i ? "bg-foreground/[0.03]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-[8px]">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="shrink-0 cursor-grab text-text-muted active:cursor-grabbing"
                      >
                        <path d="M8 6h2v2H8zm6 0h2v2h-2zM8 11h2v2H8zm6 0h2v2h-2zM8 16h2v2H8zm6 0h2v2h-2z" fill="currentColor" />
                      </svg>
                      <span>{p}</span>
                    </div>
                    <button
                      onClick={() => handleRemovePath(p)}
                      className="text-[12px] text-text-muted transition-colors hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </AccordionSection>

            {/* Flow accordion */}
            <AccordionSection
              label="Flow"
              count={composition?.steps.length ?? 0}
              open={openSection === "flow"}
              onToggle={() => setOpenSection(openSection === "flow" ? null : "flow")}
            >
              {composition && composition.steps.length > 0 ? (
                <>
                  {/* Steps list */}
                  <div className="mb-[12px] space-y-[4px]">
                    {composition.steps.map((step, idx) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-[8px] rounded-[4px] bg-surface-tertiary/50 px-[12px] py-[8px]"
                      >
                        <span className="shrink-0 text-[12px] text-text-muted w-[20px]">
                          {idx + 1}.
                        </span>

                        <button
                          onClick={() => setEditingStepMicroTestId(step.microTestId)}
                          className="flex-1 text-left text-[14px] text-foreground hover:text-accent-blue transition-colors truncate"
                          title="Click to edit script"
                        >
                          {getMicroTestName(step.microTestId)}
                        </button>

                        {/* Screenshot toggle */}
                        <button
                          onClick={() => updateStep(step.id, { captureScreenshot: !step.captureScreenshot })}
                          className={`shrink-0 transition-colors ${
                            step.captureScreenshot ? "text-foreground" : "text-text-muted/40"
                          }`}
                          title={step.captureScreenshot ? "Screenshot enabled" : "Screenshot disabled"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                          </svg>
                        </button>

                        {/* Reorder */}
                        <div className="flex shrink-0 gap-[2px]">
                          <button
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="text-text-muted transition-colors hover:text-foreground disabled:opacity-30"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === composition.steps.length - 1}
                            className="text-text-muted transition-colors hover:text-foreground disabled:opacity-30"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => removeStep(step.id)}
                          className="shrink-0 text-text-muted transition-colors hover:text-status-error"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-[8px]">
                    <button
                      onClick={handleAddNewStep}
                      className="text-[13px] text-text-muted transition-colors hover:text-foreground"
                    >
                      + Add Step
                    </button>
                    <span className="text-text-muted/30">|</span>
                    <button
                      onClick={handleRemoveFlow}
                      className="text-[13px] text-text-muted transition-colors hover:text-status-error"
                    >
                      Remove Flow
                    </button>
                  </div>
                </>
              ) : (
                /* No flow yet — show inline import */
                <div>
                  <p className="mb-[12px] text-[14px] text-text-muted">
                    Paste output from{" "}
                    <code className="rounded bg-surface-tertiary px-[4px] py-[1px] font-mono text-[12px]">npx playwright codegen</code>{" "}
                    and we&apos;ll split it into steps with screenshots at each navigation.
                  </p>

                  {/* Tips */}
                  <div className="mb-[12px] rounded-[8px] border border-border-primary bg-surface-tertiary/30 p-[12px]">
                    <p className="mb-[6px] text-[12px] font-bold text-text-muted">Tips for better results</p>
                    <ul className="space-y-[4px] text-[12px] text-text-muted">
                      <li>
                        Add <code className="rounded bg-surface-tertiary px-[3px] py-[1px] font-mono text-[11px]">{"// Step 1: Page Name"}</code> comments to name each step
                      </li>
                      <li>Use AI (Claude, ChatGPT) to clean up the codegen output — replace fragile selectors, add waits</li>
                      <li>Replace hardcoded values with dynamic ones (e.g. random email for signup)</li>
                    </ul>
                    <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
                      <CodegenRecorder
                        defaultUrl={project?.prodUrl ?? ""}
                        onScriptCaptured={(script) => {
                          setImportCode(script);
                          setImportError(null);
                        }}
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(`npx playwright codegen ${project?.prodUrl ?? "https://your-site.com"}`)}
                        className="rounded-[6px] bg-surface-tertiary px-[8px] py-[3px] text-[11px] font-mono text-foreground transition-colors hover:bg-foreground/10"
                      >
                        npx playwright codegen {project?.prodUrl ?? "https://your-site.com"}
                        <span className="ml-[4px] text-text-muted">📋</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={importCode}
                    onChange={(e) => { setImportCode(e.target.value); setImportError(null); }}
                    placeholder={`// Step 1: Landing\nawait page.goto('https://example.com');\n\n// Step 2: Login\nawait page.getByRole('textbox', { name: 'Email' }).fill('user@test.com');\nawait page.getByRole('button', { name: 'Submit' }).click();`}
                    className="mb-[12px] h-[200px] w-full resize-none rounded-[8px] border border-border-primary bg-surface-tertiary p-[12px] font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
                  />

                  {/* Steps preview */}
                  {parsedImportSteps && (
                    <div className="mb-[12px] rounded-[8px] border border-accent-green/30 bg-accent-green/[0.05] p-[12px]">
                      <p className="mb-[8px] text-[13px] font-bold text-foreground">
                        {parsedImportSteps.length} step{parsedImportSteps.length !== 1 ? "s" : ""} detected
                      </p>
                      <div className="flex flex-col gap-[4px]">
                        {parsedImportSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-[8px] text-[13px]">
                            <span className="shrink-0 w-[20px] text-text-muted text-right">{i + 1}.</span>
                            <span className="text-foreground">{step.displayName}</span>
                            <span className="text-text-muted">({step.lines.length} line{step.lines.length !== 1 ? "s" : ""})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importCode.trim() && !parsedImportSteps && (
                    <p className="mb-[12px] text-[13px] text-status-error">
                      Could not parse the pasted code. Paste Playwright code containing <code>page.</code> or <code>expect()</code> calls.
                    </p>
                  )}

                  {importError && (
                    <p className="mb-[12px] text-[13px] text-status-error">{importError}</p>
                  )}

                  {parsedImportSteps && (
                    <button
                      onClick={handleImport}
                      disabled={importing}
                      className="rounded-[8px] bg-foreground px-[20px] py-[8px] text-[14px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
                    >
                      {importing ? `Importing ${parsedImportSteps.length} steps...` : `Import ${parsedImportSteps.length} step${parsedImportSteps.length !== 1 ? "s" : ""}`}
                    </button>
                  )}

                  {!importCode.trim() && (
                    <button
                      onClick={handleAddNewStep}
                      className="text-[13px] text-text-muted transition-colors hover:text-foreground"
                    >
                      or start with a blank step
                    </button>
                  )}
                </div>
              )}
            </AccordionSection>

            {/* Settings accordion (Breakpoints + Variants) */}
            <AccordionSection
              label="Settings"
              open={openSection === "settings"}
              onToggle={() => setOpenSection(openSection === "settings" ? null : "settings")}
            >
              <div className="mb-[24px]">
                <BreakpointEditor
                  breakpoints={breakpoints}
                  onChange={setBreakpoints}
                />
              </div>
              <div>
                <p className="mb-[8px] text-[14px] text-foreground">Variants</p>
              <div className="flex gap-[16px]">
                {BUILT_IN_VARIANTS.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-[8px] text-[14px] text-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVariants.includes(v.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVariants([...selectedVariants, v.id]);
                        } else {
                          setSelectedVariants(selectedVariants.filter((id) => id !== v.id));
                        }
                      }}
                      className="h-[16px] w-[16px]"
                    />
                    {v.label}
                  </label>
                ))}
              </div>
              </div>
            </AccordionSection>

            {/* Legacy flows section */}
            {flows.length > 0 && (
              <section className="mb-[32px]">
                <h2 className="mb-[8px] text-[14px] text-foreground">Flows (Legacy)</h2>
                <p className="mb-[16px] text-[14px] text-text-muted">
                  WYSIWYG browser interactions. Use the flow section above for new tests.
                </p>

                <div className="mb-[16px] space-y-[12px]">
                  {flows.map((flow, idx) => (
                    <FlowEditor
                      key={flow.id}
                      flow={flow}
                      onChange={(updated) => updateFlow(idx, updated)}
                      onRemove={() => removeFlow(idx)}
                      allowedDomainUrls={project ? [project.prodUrl, project.devUrl] : []}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Autosave — no manual Save button. Edits persist 500ms after
                the last change via the effect above. */}
          </>
        )}
      </div>
    </div>
    </>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
