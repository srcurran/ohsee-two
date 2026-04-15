"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import { FlowEditor } from "@/components/FlowEditor";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import type { Project, SiteTest, FlowEntry } from "@/lib/types";

function normalizePath(input: string): string {
  let p = input.trim();
  if (!p) return "";
  try {
    const parsed = new URL(p);
    if (parsed.hostname) {
      p = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Not a full URL — treat as a path
  }
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

export default function ProjectTestsSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  // Test name
  const [testName, setTestName] = useState("");

  // Pages state
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNode = useRef<HTMLDivElement | null>(null);

  // Flows state
  const [flows, setFlows] = useState<FlowEntry[]>([]);

  // Breakpoints + variants
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        const tests = p.tests || [];
        if (tests.length > 0 && !selectedTestId) {
          setSelectedTestId(tests[0].id);
        }
      });
  }, [params.id]);

  // Sync all fields when selected test changes
  useEffect(() => {
    if (!project || !selectedTestId) return;
    const test = project.tests?.find((t) => t.id === selectedTestId);
    if (test) {
      setTestName(test.name);
      setPaths(test.pages.map((pg) => pg.path));
      setFlows(test.flows || []);
      setBreakpoints(
        test.breakpoints?.length
          ? test.breakpoints
          : project.breakpoints?.length
            ? project.breakpoints
            : [...BREAKPOINTS]
      );
      setSelectedVariants(
        test.variants?.length
          ? test.variants.map((v) => v.id)
          : (project.variants || []).map((v) => v.id)
      );
    }
  }, [project, selectedTestId]);

  const tests = project?.tests || [];
  const selectedTest = tests.find((t) => t.id === selectedTestId);

  // Pages handlers
  const handleAddPath = () => {
    const p = normalizePath(newPath);
    if (p && !paths.includes(p)) {
      setPaths([...paths, p]);
      setNewPath("");
    }
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

  // Flows handlers
  const addFlow = () => {
    setFlows([
      ...flows,
      { id: crypto.randomUUID(), name: "", startPath: "/", steps: [] },
    ]);
  };

  const updateFlow = (idx: number, updated: FlowEntry) => {
    const next = [...flows];
    next[idx] = updated;
    setFlows(next);
  };

  const removeFlow = (idx: number) => {
    setFlows(flows.filter((_, i) => i !== idx));
  };

  // Save all fields for the selected test
  const handleSave = async () => {
    if (!project || !selectedTestId || !selectedTest) return;
    setSaving(true);
    setSaved(false);

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
            breakpoints,
            variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
          }
        : t
    );

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tests: updatedTests }),
    });

    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      refreshProjects();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <p className="text-[14px] text-text-muted">No tests yet. Run a test from the report view to get started.</p>
    );
  }

  return (
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
        </div>
      </div>

      {/* Right: settings for selected test */}
      <div className="flex-1 pl-[24px] max-w-[560px]">
        {selectedTest && (
          <>
            {/* Test name */}
            <section className="mb-[32px]">
              <label className="mb-[4px] block text-[14px] text-foreground">
                Test Name
              </label>
              <input
                type="text"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
              />
            </section>

            {/* Pages section */}
            <section className="mb-[32px]">
              <h2 className="mb-[8px] text-[14px] text-foreground">Pages</h2>
              <p className="mb-[16px] text-[14px] text-text-muted">
                URL paths to capture during each scan.
              </p>

              <div className="mb-[16px] flex gap-[8px]">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                  placeholder="/about"
                  className="flex-1 rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
                />
                <button
                  onClick={handleAddPath}
                  className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
                >
                  Add
                </button>
              </div>

              <div>
                {paths.map((p, i) => (
                  <div
                    key={p}
                    draggable
                    onDragStart={(e) => handleDragStart(i, e)}
                    onDragEnter={() => handleDragEnter(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center justify-between border-b border-border-primary py-[8px] text-[14px] text-foreground transition-colors ${
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
                {paths.length === 0 && (
                  <p className="py-[16px] text-center text-[13px] text-text-muted">
                    Add at least one page path.
                  </p>
                )}
              </div>
            </section>

            {/* Breakpoints */}
            <section className="mb-[32px]">
              <BreakpointEditor
                breakpoints={breakpoints}
                onChange={setBreakpoints}
              />
            </section>

            {/* Variants */}
            <section className="mb-[32px]">
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
            </section>

            {/* Flows section */}
            <section className="mb-[32px]">
              <h2 className="mb-[8px] text-[14px] text-foreground">Flows</h2>
              <p className="mb-[16px] text-[14px] text-text-muted">
                Scripted browser interactions for multi-step flows.
              </p>

              <div className="mb-[16px] space-y-[12px]">
                {flows.map((flow, idx) => (
                  <FlowEditor
                    key={flow.id}
                    flow={flow}
                    onChange={(updated) => updateFlow(idx, updated)}
                    onRemove={() => removeFlow(idx)}
                  />
                ))}
              </div>

              <button
                onClick={addFlow}
                className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
              >
                + Add Flow
              </button>
            </section>

            {/* Save */}
            <div className="flex items-center gap-[12px]">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-semibold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && (
                <span className="text-[14px] text-accent-green">Saved</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
