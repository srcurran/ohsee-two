"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { FlowEditor } from "@/components/FlowEditor";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project, SiteTest, FlowEntry } from "@/lib/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Tab = "general" | "tests" | "advanced";

interface Props {
  projectId: string;
  onClose: () => void;
  initialTab?: Tab;
  initialTestId?: string;
}

export default function ProjectSettingsPanel({ projectId, onClose, initialTab = "general", initialTestId }: Props) {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [visible, setVisible] = useState(false);

  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");

  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);

  const [tests, setTests] = useState<SiteTest[]>([]);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);

  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [flows, setFlows] = useState<FlowEntry[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stateRef = useRef({ name, prodUrl, devUrl, selectedVariants, breakpoints, paths, flows, tests });
  stateRef.current = { name, prodUrl, devUrl, selectedVariants, breakpoints, paths, flows, tests };

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setName(p.name || "");
        setProdUrl(p.prodUrl);
        setDevUrl(p.devUrl);
        const loadedTests = p.tests || [];
        setTests(loadedTests);
        setPaths(p.pages.map((pg: { path: string }) => pg.path));
        setFlows(p.flows || []);
        if (initialTestId) {
          const target = loadedTests.find((t: SiteTest) => t.id === initialTestId);
          if (target) {
            setTab("tests");
            setEditingTestId(target.id);
            setPaths(target.pages.map((pg: { path: string }) => pg.path));
            setFlows(target.flows || []);
            setBreakpoints(target.breakpoints?.length ? target.breakpoints : [...BREAKPOINTS]);
            setSelectedVariants((target.variants || []).map((v: { id: string }) => v.id));
          }
        }
      });
  }, [projectId, initialTestId]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const saveRef = useRef<(overrides?: Partial<typeof stateRef.current>) => void>(undefined);

  const save = useCallback(async (overrides?: Partial<typeof stateRef.current>) => {
    if (!project) return;
    const s = { ...stateRef.current, ...overrides };
    if (!s.prodUrl || !s.devUrl) return;

    setSaveStatus("saving");

    const existingByPath = new Map(project.pages.map((p) => [p.path, p]));
    const updatedPages = s.paths.map((p) => {
      const existing = existingByPath.get(p);
      return existing || { id: crypto.randomUUID(), path: p };
    });

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: s.name.trim() || undefined,
        prodUrl: s.prodUrl.replace(/\/$/, ""),
        devUrl: s.devUrl.replace(/\/$/, ""),
        pages: updatedPages,
        flows: s.flows,
        tests: s.tests,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      refreshProjects();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } else {
      setSaveStatus("idle");
    }
  }, [project, refreshProjects]);

  saveRef.current = save;

  const debouncedSave = useCallback((overrides?: Partial<typeof stateRef.current>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveRef.current?.(overrides);
    }, 800);
  }, []);

  const addPath = () => {
    let p = newPath.trim();
    if (!p) return;
    try {
      const parsed = new URL(p);
      if (parsed.hostname) {
        p = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      // Not a full URL
    }
    if (!p.startsWith("/")) p = `/${p}`;
    if (!paths.includes(p)) {
      const next = [...paths, p];
      setPaths(next);
      setNewPath("");
      save({ paths: next });
    }
  };

  const removePath = (path: string) => {
    const next = paths.filter((x) => x !== path);
    setPaths(next);
    save({ paths: next });
  };

  const toggleVariant = (id: string, checked: boolean) => {
    if (!editingTestId) return;
    const next = checked
      ? [...selectedVariants, id]
      : selectedVariants.filter((v) => v !== id);
    setSelectedVariants(next);
    const updatedTests = tests.map((t) =>
      t.id === editingTestId
        ? { ...t, variants: BUILT_IN_VARIANTS.filter((v) => next.includes(v.id)) }
        : t
    );
    setTests(updatedTests);
    debouncedSave({ tests: updatedTests, selectedVariants: next });
  };

  const updateBreakpoints = (next: number[]) => {
    if (!editingTestId) return;
    setBreakpoints(next);
    const updatedTests = tests.map((t) =>
      t.id === editingTestId ? { ...t, breakpoints: next } : t
    );
    setTests(updatedTests);
    debouncedSave({ tests: updatedTests, breakpoints: next });
  };

  const updateFlow = (idx: number, updated: FlowEntry) => {
    const next = [...flows];
    next[idx] = updated;
    setFlows(next);
    save({ flows: next });
  };

  const removeFlow = (idx: number) => {
    const next = flows.filter((_, i) => i !== idx);
    setFlows(next);
    save({ flows: next });
  };

  const addFlow = () => {
    const next = [...flows, { id: crypto.randomUUID(), name: "", startPath: "/", steps: [] as FlowEntry["steps"] }];
    setFlows(next);
    save({ flows: next });
  };

  const openTestEditor = (test: SiteTest) => {
    setEditingTestId(test.id);
    setPaths(test.pages.map((p) => p.path));
    setFlows(test.flows || []);
    setBreakpoints(test.breakpoints?.length ? test.breakpoints : [...BREAKPOINTS]);
    setSelectedVariants((test.variants || []).map((v) => v.id));
  };

  const closeTestEditor = () => {
    setEditingTestId(null);
  };

  const saveTestEdits = () => {
    if (!editingTestId) return;
    const existingTest = tests.find((t) => t.id === editingTestId);
    if (!existingTest) return;

    const existingByPath = new Map(existingTest.pages.map((p) => [p.path, p]));
    const updatedPages = paths.map((p) => {
      const existing = existingByPath.get(p);
      return existing || { id: crypto.randomUUID(), path: p };
    });

    const updatedTests = tests.map((t) =>
      t.id === editingTestId ? {
        ...t,
        pages: updatedPages,
        flows,
        breakpoints,
        variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
      } : t
    );
    setTests(updatedTests);
    save({ tests: updatedTests });
  };

  const addTest = () => {
    const newTest: SiteTest = {
      id: crypto.randomUUID(),
      name: "New Test",
      pages: [{ id: crypto.randomUUID(), path: "/" }],
      flows: [],
      breakpoints: [...BREAKPOINTS],
      variants: [],
      createdAt: new Date().toISOString(),
      lastRunAt: null,
    };
    const next = [...tests, newTest];
    setTests(next);
    save({ tests: next });
    openTestEditor(newTest);
  };

  const removeTest = (testId: string) => {
    const next = tests.filter((t) => t.id !== testId);
    setTests(next);
    if (editingTestId === testId) setEditingTestId(null);
    save({ tests: next });
  };

  const renameTest = (testId: string, newName: string) => {
    const next = tests.map((t) => t.id === testId ? { ...t, name: newName } : t);
    setTests(next);
    save({ tests: next });
  };

  const handleBlur = () => save();

  const handleArchive = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      refreshProjects();
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) {
      refreshProjects();
      router.push("/");
    }
    setDeleting(false);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "tests", label: "Tests" },
    { id: "advanced", label: "Advanced" },
  ];

  return (
    <div
      className={`page-detail-scrim ${visible ? "page-detail-scrim--visible" : "page-detail-scrim--hidden"}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className={`project-settings-panel ${visible ? "project-settings-panel--visible" : "project-settings-panel--hidden"}`}
      >
        <div className="project-settings-panel__header">
          <div className="row row--md">
            <p className="project-settings-panel__title">Settings</p>
            {saveStatus === "saving" && (
              <span className="project-settings-panel__save-hint">Saving...</span>
            )}
            {saveStatus === "saved" && (
              <span className="project-settings-panel__save-hint project-settings-panel__save-hint--success">Saved</span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="icon-btn icon-btn--lg project-settings-panel__close"
            title="Close settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="project-settings-panel__tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowDeleteConfirm(false); }}
              className={`tab-pill ${tab === t.id ? "tab-pill--active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="divider" />

        <div className="project-settings-panel__body">
          {!project ? (
            <p style={{ color: "var(--text-muted)" }}>Loading...</p>
          ) : tab === "general" ? (
            <div className="project-settings-panel__section stack stack--xl">
              <div className="field">
                <label className="field__label">Project Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={handleBlur} placeholder={getDomain(prodUrl)} className="input" />
                <p className="field__hint">Leave blank to use the domain name.</p>
              </div>
              <div className="field">
                <label className="field__label">Production URL</label>
                <input type="text" value={prodUrl} onChange={(e) => setProdUrl(e.target.value)} onBlur={handleBlur} className="input" />
              </div>
              <div className="field">
                <label className="field__label">Development URL</label>
                <input type="text" value={devUrl} onChange={(e) => setDevUrl(e.target.value)} onBlur={handleBlur} className="input" />
              </div>
            </div>
          ) : tab === "tests" ? (
            <div className="project-settings-panel__section">
              {editingTestId ? (
                (() => {
                  const editingTest = tests.find((t) => t.id === editingTestId);
                  if (!editingTest) return null;
                  return (
                    <div>
                      <button onClick={closeTestEditor} className="btn btn--text" style={{ marginBottom: "var(--space-4)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Back to tests
                      </button>

                      <input
                        type="text"
                        value={editingTest.name}
                        onChange={(e) => renameTest(editingTestId, e.target.value)}
                        onBlur={() => saveTestEdits()}
                        className="input input--underline"
                        style={{ marginBottom: "var(--space-6)", fontSize: "var(--font-size-2xl)", fontWeight: "var(--weight-bold)" }}
                      />

                      <div className="section-block">
                        <h4 className="section-heading">Pages</h4>
                        <p className="section-body">URL paths to capture during each scan.</p>
                        <div className="row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                          <input
                            type="text"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { addPath(); setTimeout(saveTestEdits, 50); } }}
                            placeholder="/about"
                            className="input input--compact"
                            style={{ flex: 1 }}
                          />
                          <button onClick={() => { addPath(); setTimeout(saveTestEdits, 50); }} className="btn btn--secondary">
                            Add
                          </button>
                        </div>
                        <div>
                          {paths.map((p) => (
                            <div key={p} className="path-row">
                              <span>{p}</span>
                              <button onClick={() => { removePath(p); setTimeout(saveTestEdits, 50); }} className="flow-step__remove">
                                Remove
                              </button>
                            </div>
                          ))}
                          {paths.length === 0 && <p className="flow-editor__empty" style={{ paddingBlock: "var(--space-3)" }}>Add at least one page path.</p>}
                        </div>
                      </div>

                      <div>
                        <h4 className="section-heading">Flows</h4>
                        <p className="section-body">Scripted browser interactions for multi-step testing.</p>
                        <div className="stack stack--md" style={{ marginBottom: "var(--space-3)" }}>
                          {flows.map((flow, idx) => (
                            <FlowEditor
                              key={flow.id}
                              flow={flow}
                              onChange={(updated) => { updateFlow(idx, updated); setTimeout(saveTestEdits, 50); }}
                              onRemove={() => { removeFlow(idx); setTimeout(saveTestEdits, 50); }}
                              allowedDomainUrls={project ? [project.prodUrl, project.devUrl] : []}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => { addFlow(); setTimeout(saveTestEdits, 50); }}
                          className="btn btn--secondary"
                        >
                          + Add Flow
                        </button>
                      </div>

                      <div style={{ marginTop: "var(--space-8)" }}>
                        <BreakpointEditor breakpoints={breakpoints} onChange={updateBreakpoints} />
                      </div>

                      <div style={{ marginTop: "var(--space-6)" }}>
                        <p className="section-heading">Variants</p>
                        <div className="variant-list">
                          {BUILT_IN_VARIANTS.map((v) => (
                            <label key={v.id} className="variant-option">
                              <input
                                type="checkbox"
                                checked={selectedVariants.includes(v.id)}
                                onChange={(e) => toggleVariant(v.id, e.target.checked)}
                                className="checkbox"
                              />
                              {v.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div>
                  <p className="section-body" style={{ marginBottom: "var(--space-6)" }}>
                    Each test has its own set of pages and flows. Run them independently to get separate reports.
                  </p>
                  <div className="test-list">
                    {tests.map((test) => (
                      <div key={test.id} className="settings-row">
                        <button
                          onClick={() => openTestEditor(test)}
                          className="settings-row__info"
                        >
                          <span className="settings-row__name-base">{test.name}</span>
                          <span className="settings-row__meta">
                            {test.pages.length} page{test.pages.length !== 1 ? "s" : ""}
                            {test.flows.length > 0 && ` · ${test.flows.length} flow${test.flows.length !== 1 ? "s" : ""}`}
                          </span>
                        </button>
                        <div className="settings-row__actions">
                          <button
                            onClick={() => openTestEditor(test)}
                            className="flow-step__remove"
                          >
                            Edit
                          </button>
                          {tests.length > 1 && (
                            <button
                              onClick={() => removeTest(test.id)}
                              className="flow-step__remove"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addTest}
                    className="btn btn--secondary"
                    style={{ marginTop: "var(--space-4)" }}
                  >
                    + Add Test
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="project-settings-panel__section stack stack--xl">
              <div className="card card--bordered">
                <h3 className="card__title">
                  {project.archived ? "Unarchive Project" : "Archive Project"}
                </h3>
                <p className="card__body">
                  {project.archived ? "Restore this project to the sidebar." : "Hide this project from the sidebar. Reports are preserved."}
                </p>
                <button onClick={handleArchive} className="btn btn--outline">
                  {project.archived ? "Unarchive" : "Archive"}
                </button>
              </div>
              <div className="card card--danger">
                <h3 className="card__title">Delete Project</h3>
                <p className="card__body">Permanently remove this project and all its reports. This cannot be undone.</p>
                {!showDeleteConfirm ? (
                  <button onClick={() => setShowDeleteConfirm(true)} className="btn btn--danger-outline">
                    Delete Project
                  </button>
                ) : (
                  <div className="row row--sm">
                    <button onClick={handleDelete} disabled={deleting} className="btn btn--danger">
                      {deleting ? "Deleting..." : "Confirm Delete"}
                    </button>
                    <button onClick={() => setShowDeleteConfirm(false)} className="btn btn--text">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
