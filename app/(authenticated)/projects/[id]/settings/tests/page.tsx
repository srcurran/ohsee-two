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

  const [testName, setTestName] = useState("");

  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);
  const pathInputRef = useRef<HTMLInputElement | null>(null);

  const [openSection, setOpenSection] = useState<AccordionKey | null>("pages");

  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [flows, setFlows] = useState<FlowEntry[]>([]);

  const [composition, setComposition] = useState<TestComposition | null>(null);
  const [microTests, setMicroTests] = useState<MicroTest[]>([]);

  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [editingStepMicroTestId, setEditingStepMicroTestId] = useState<string | null>(null);
  const [, setAddingNewStep] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const lastSavedSnapshotRef = useRef<string>("");
  const loadedTestIdRef = useRef<string | null>(null);

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
      setImportCode("");
      setImportError(null);
      setEditingStepMicroTestId(null);
      setAddingNewStep(false);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSaveRef = useRef<() => Promise<void>>(undefined as any);
  useEffect(() => {
    if (!selectedTestId) return;
    const snapshot = JSON.stringify({ testName, paths, flows, composition, breakpoints, selectedVariants });
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

  const updateFlow = (idx: number, updated: FlowEntry) => {
    const next = [...flows];
    next[idx] = updated;
    setFlows(next);
  };

  const removeFlow = (idx: number) => {
    setFlows(flows.filter((_, i) => i !== idx));
  };

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

  const handleRemoveFlow = () => {
    setComposition(null);
  };

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

  handleSaveRef.current = handleSave;

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="stack stack--lg" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 className="section-heading" style={{ fontSize: "var(--font-size-xl)" }}>Create your first test</h2>
          <p className="section-body">
            Tests define which pages and flows to compare between production and dev. You can add pages and flows after creation.
          </p>
        </div>
        <button onClick={addTest} className="btn btn--primary-sm">
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
      {editingMicroTest && (
        <div
          className="modal"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingStepMicroTestId(null); }}
        >
          <div className="modal__panel modal__panel--xl">
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

      <div className="test-settings-pane">
        <div className="test-list-sidebar">
          <div className="test-list-sidebar__list">
            {tests.map((test) => (
              <button
                key={test.id}
                onClick={() => setSelectedTestId(test.id)}
                className={`test-list-sidebar__item ${selectedTestId === test.id ? "test-list-sidebar__item--active" : ""}`}
              >
                {test.name}
              </button>
            ))}
            <button onClick={addTest} className="sidebar__add-test">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Add test
            </button>
          </div>
        </div>

        <div className="test-settings-pane__content">
          {selectedTest && (
            <>
              <div className="test-name-edit">
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
                    className="test-name-edit__input"
                  />
                ) : (
                  <button onClick={() => setEditingName(true)} className="test-name-edit__display">
                    <h1 className="test-name-edit__title">
                      {testName || "Untitled Test"}
                    </h1>
                    <span className="test-name-edit__pencil">
                      <PencilIcon />
                    </span>
                  </button>
                )}
              </div>

              <AccordionSection
                label="Pages"
                count={paths.length}
                open={openSection === "pages"}
                onToggle={() => {
                  const willOpen = openSection !== "pages";
                  setOpenSection(willOpen ? "pages" : null);
                  if (willOpen) {
                    requestAnimationFrame(() => pathInputRef.current?.focus());
                  }
                }}
              >
                <p className="section-body">URL paths to capture during each scan.</p>

                <div className="row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
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
                    className={`input input--compact ${pathError ? "input--error" : ""}`}
                    style={{ flex: 1 }}
                  />
                  <button onClick={handleAddPath} className="btn btn--secondary">
                    Add
                  </button>
                </div>
                {pathError && (
                  <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>{pathError}</p>
                )}
                {!pathError && <div style={{ marginBottom: "var(--space-4)" }} />}

                <div>
                  {paths.map((p, i) => (
                    <div
                      key={p}
                      draggable
                      onDragStart={(e) => handleDragStart(i, e)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                      className={`path-row path-row--compact ${dragOverIndex === i ? "path-row--drag-over" : ""}`}
                    >
                      <div className="path-row__left">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="path-row__grab"
                        >
                          <path d="M8 6h2v2H8zm6 0h2v2h-2zM8 11h2v2H8zm6 0h2v2h-2zM8 16h2v2H8zm6 0h2v2h-2z" fill="currentColor" />
                        </svg>
                        <span>{p}</span>
                      </div>
                      <button onClick={() => handleRemovePath(p)} className="flow-step__remove">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection
                label="Flow"
                count={composition?.steps.length ?? 0}
                open={openSection === "flow"}
                onToggle={() => setOpenSection(openSection === "flow" ? null : "flow")}
              >
                {composition && composition.steps.length > 0 ? (
                  <>
                    <div className="stack stack--xs" style={{ marginBottom: "var(--space-3)" }}>
                      {composition.steps.map((step, idx) => (
                        <div key={step.id} className="comp-step">
                          <span className="comp-step__index">{idx + 1}.</span>

                          <button
                            onClick={() => setEditingStepMicroTestId(step.microTestId)}
                            className="comp-step__name"
                            title="Click to edit script"
                          >
                            {getMicroTestName(step.microTestId)}
                          </button>

                          <button
                            onClick={() => updateStep(step.id, { captureScreenshot: !step.captureScreenshot })}
                            className={`comp-step__camera ${step.captureScreenshot ? "" : "comp-step__camera--disabled"}`}
                            title={step.captureScreenshot ? "Screenshot enabled" : "Screenshot disabled"}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
                              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          </button>

                          <div className="comp-step__reorder">
                            <button
                              onClick={() => moveStep(idx, -1)}
                              disabled={idx === 0}
                              className="comp-step__reorder-btn"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button
                              onClick={() => moveStep(idx, 1)}
                              disabled={idx === composition.steps.length - 1}
                              className="comp-step__reorder-btn"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>

                          <button onClick={() => removeStep(step.id)} className="comp-step__remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="row row--sm">
                      <button onClick={handleAddNewStep} className="composition-editor__add-btn">
                        + Add Step
                      </button>
                      <span style={{ color: "color-mix(in srgb, var(--text-muted) 30%, transparent)" }}>|</span>
                      <button onClick={handleRemoveFlow} className="composition-editor__remove" style={{ textDecoration: "none" }}>
                        Remove Flow
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="section-body">
                      Paste output from{" "}
                      <code className="code-inline">npx playwright codegen</code>{" "}
                      and we&apos;ll split it into steps with screenshots at each navigation.
                    </p>

                    <div className="info-box" style={{ marginBottom: "var(--space-3)" }}>
                      <p className="info-box__title">Tips for better results</p>
                      <ul className="info-box__list">
                        <li>
                          Add <code className="code-inline code-inline--xs">{"// Step 1: Page Name"}</code> comments to name each step
                        </li>
                        <li>Use AI (Claude, ChatGPT) to clean up the codegen output — replace fragile selectors, add waits</li>
                        <li>Replace hardcoded values with dynamic ones (e.g. random email for signup)</li>
                      </ul>
                      <div className="row row--sm" style={{ marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                        <CodegenRecorder
                          defaultUrl={project?.prodUrl ?? ""}
                          onScriptCaptured={(script) => {
                            setImportCode(script);
                            setImportError(null);
                          }}
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`npx playwright codegen ${project?.prodUrl ?? "https://your-site.com"}`)}
                          className="flow-chip mono"
                        >
                          npx playwright codegen {project?.prodUrl ?? "https://your-site.com"}
                          <span style={{ marginLeft: "var(--space-1)", color: "var(--text-muted)" }}>📋</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={importCode}
                      onChange={(e) => { setImportCode(e.target.value); setImportError(null); }}
                      placeholder={`// Step 1: Landing\nawait page.goto('https://example.com');\n\n// Step 2: Login\nawait page.getByRole('textbox', { name: 'Email' }).fill('user@test.com');\nawait page.getByRole('button', { name: 'Submit' }).click();`}
                      className="textarea textarea--mono textarea--tinted textarea--no-resize"
                      style={{ height: 200, marginBottom: "var(--space-3)" }}
                    />

                    {parsedImportSteps && (
                      <div className="step-preview" style={{ marginBottom: "var(--space-3)" }}>
                        <p className="step-preview__title">
                          {parsedImportSteps.length} step{parsedImportSteps.length !== 1 ? "s" : ""} detected
                        </p>
                        <div className="step-preview__list">
                          {parsedImportSteps.map((step, i) => (
                            <div key={i} className="step-preview__item">
                              <span className="step-preview__index">{i + 1}.</span>
                              <span className="step-preview__label">{step.displayName}</span>
                              <span className="step-preview__meta">({step.lines.length} line{step.lines.length !== 1 ? "s" : ""})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {importCode.trim() && !parsedImportSteps && (
                      <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>
                        Could not parse the pasted code. Paste Playwright code containing <code>page.</code> or <code>expect()</code> calls.
                      </p>
                    )}

                    {importError && (
                      <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>{importError}</p>
                    )}

                    {parsedImportSteps && (
                      <button
                        onClick={handleImport}
                        disabled={importing}
                        className="btn btn--primary-sm"
                      >
                        {importing ? `Importing ${parsedImportSteps.length} steps...` : `Import ${parsedImportSteps.length} step${parsedImportSteps.length !== 1 ? "s" : ""}`}
                      </button>
                    )}

                    {!importCode.trim() && (
                      <button onClick={handleAddNewStep} className="composition-editor__add-btn">
                        or start with a blank step
                      </button>
                    )}
                  </div>
                )}
              </AccordionSection>

              <AccordionSection
                label="Settings"
                open={openSection === "settings"}
                onToggle={() => setOpenSection(openSection === "settings" ? null : "settings")}
              >
                <div style={{ marginBottom: "var(--space-6)" }}>
                  <BreakpointEditor breakpoints={breakpoints} onChange={setBreakpoints} />
                </div>
                <div>
                  <p className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>Variants</p>
                  <div className="variant-list">
                    {BUILT_IN_VARIANTS.map((v) => (
                      <label key={v.id} className="variant-option">
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
                          className="checkbox"
                        />
                        {v.label}
                      </label>
                    ))}
                  </div>
                </div>
              </AccordionSection>

              {flows.length > 0 && (
                <section className="section-block">
                  <h2 className="section-heading" style={{ fontWeight: "var(--weight-regular)" }}>Flows (Legacy)</h2>
                  <p className="section-body">
                    WYSIWYG browser interactions. Use the flow section above for new tests.
                  </p>

                  <div className="stack stack--md" style={{ marginBottom: "var(--space-4)" }}>
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
