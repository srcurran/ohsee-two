"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { FlowEditor, newStep } from "@/components/FlowEditor";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project, FlowEntry } from "@/lib/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Tab = "general" | "pages" | "flows" | "advanced";

interface Props {
  projectId: string;
  onClose: () => void;
}

export default function ProjectSettingsPanel({ projectId, onClose }: Props) {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [visible, setVisible] = useState(false);

  // General fields
  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);

  // Pages fields
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");

  // Flows fields
  const [flows, setFlows] = useState<FlowEntry[]>([]);

  // Advanced
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setName(p.name || "");
        setProdUrl(p.prodUrl);
        setDevUrl(p.devUrl);
        setRequiresAuth(p.requiresAuth || false);
        setSelectedVariants((p.variants || []).map((v) => v.id));
        setBreakpoints(p.breakpoints?.length ? p.breakpoints : [...BREAKPOINTS]);
        setPaths(p.pages.map((pg) => pg.path));
        setFlows(p.flows || []);
      });
  }, [projectId]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSaveGeneral = async () => {
    if (!project || !prodUrl || !devUrl) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || undefined,
        prodUrl: prodUrl.replace(/\/$/, ""),
        devUrl: devUrl.replace(/\/$/, ""),
        requiresAuth,
        variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
        breakpoints,
      }),
    });
    if (res.ok) {
      refreshProjects();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleAddPath = () => {
    const p = newPath.trim();
    if (p && !paths.includes(p)) {
      setPaths([...paths, p.startsWith("/") ? p : `/${p}`]);
      setNewPath("");
    }
  };

  const handleSavePages = async () => {
    if (!project || paths.length === 0) return;
    setSaving(true);
    setSaved(false);
    const existingByPath = new Map(project.pages.map((p) => [p.path, p]));
    const updatedPages = paths.map((path) => {
      const existing = existingByPath.get(path);
      return existing || { id: crypto.randomUUID(), path };
    });
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages: updatedPages }),
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

  const handleSaveFlows = async () => {
    if (!project) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flows }),
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
    { id: "pages", label: "Pages" },
    { id: "flows", label: "Flows" },
    { id: "advanced", label: "Advanced" },
  ];

  const inputClass =
    "w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground";

  return (
    <div
      className={`absolute inset-0 z-20 transition-all duration-300 ease-out ${
        visible ? "bg-black/30" : "bg-transparent pointer-events-none"
      }`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
    <div
      className={`absolute inset-[16px] flex flex-col rounded-[12px] bg-surface-content shadow-elevation-lg transition-transform duration-300 ease-out ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* Header — click anywhere to close */}
      <div
        onClick={handleClose}
        className="flex cursor-pointer items-center justify-between px-[24px] py-[20px]"
      >
        <p className="text-[48px] text-foreground">
          {project ? (project.name || getDomain(project.prodUrl)) : "..."}
        </p>
        <div
          className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-text-subtle transition-all hover:bg-foreground/[0.05] hover:text-foreground"
          title="Close settings"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-[4px] px-[24px] pb-[16px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSaved(false); setShowDeleteConfirm(false); }}
            className={`rounded-[8px] px-[14px] py-[6px] text-[14px] transition-colors ${
              tab === t.id
                ? "bg-surface-tertiary font-bold text-foreground"
                : "text-text-muted hover:bg-foreground/[0.04] hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-border-primary" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-[24px] py-[24px]">
        {!project ? (
          <p className="text-text-muted">Loading...</p>
        ) : tab === "general" ? (
          <div className="flex max-w-[560px] flex-col gap-[24px]">
            <div>
              <label className="mb-[4px] block text-[14px] text-foreground">Project Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={getDomain(prodUrl)} className={inputClass} />
              <p className="mt-[4px] text-[12px] text-text-muted">Leave blank to use the domain name.</p>
            </div>
            <div>
              <label className="mb-[4px] block text-[14px] text-foreground">Production URL</label>
              <input type="text" value={prodUrl} onChange={(e) => setProdUrl(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-[4px] block text-[14px] text-foreground">Development URL</label>
              <input type="text" value={devUrl} onChange={(e) => setDevUrl(e.target.value)} className={inputClass} />
            </div>
            <BreakpointEditor breakpoints={breakpoints} onChange={setBreakpoints} />
            <div>
              <p className="mb-[8px] text-[14px] text-foreground">Variants</p>
              <div className="flex gap-[16px]">
                {BUILT_IN_VARIANTS.map((v) => (
                  <label key={v.id} className="flex items-center gap-[8px] text-[14px] text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedVariants.includes(v.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedVariants([...selectedVariants, v.id]);
                        else setSelectedVariants(selectedVariants.filter((id) => id !== v.id));
                      }}
                      className="h-[16px] w-[16px]"
                    />
                    {v.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-[8px] text-[14px] text-foreground">
              <input type="checkbox" checked={requiresAuth} onChange={(e) => setRequiresAuth(e.target.checked)} className="h-[16px] w-[16px]" />
              Requires authentication (for localhost testing)
            </label>
            <div className="flex items-center gap-[12px]">
              <button onClick={handleSaveGeneral} disabled={!prodUrl || !devUrl || saving} className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black">
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && <span className="text-[14px] text-accent-green">Saved</span>}
            </div>
          </div>
        ) : tab === "pages" ? (
          <div className="max-w-[560px]">
            <p className="mb-[24px] text-[14px] text-text-muted">URL paths to capture during each scan.</p>
            <div className="mb-[16px] flex gap-[8px]">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                placeholder="/about"
                className="flex-1 rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
              />
              <button onClick={handleAddPath} className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10">
                Add
              </button>
            </div>
            <div className="mb-[24px]">
              {paths.map((p) => (
                <div key={p} className="flex items-center justify-between border-b border-border-primary py-[8px] text-[14px] text-foreground">
                  <span>{p}</span>
                  <button onClick={() => setPaths(paths.filter((x) => x !== p))} className="text-[12px] text-text-muted transition-colors hover:text-foreground">
                    Remove
                  </button>
                </div>
              ))}
              {paths.length === 0 && <p className="py-[16px] text-center text-[13px] text-text-muted">Add at least one page path.</p>}
            </div>
            <div className="flex items-center gap-[12px]">
              <button onClick={handleSavePages} disabled={paths.length === 0 || saving} className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black">
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && <span className="text-[14px] text-accent-green">Saved</span>}
            </div>
          </div>
        ) : tab === "flows" ? (
          <div className="max-w-[560px]">
            <p className="mb-[24px] text-[14px] text-text-muted">
              Scripted browser interactions for multi-step visual regression testing.
            </p>
            <div className="mb-[16px] space-y-[12px]">
              {flows.map((flow, idx) => (
                <FlowEditor
                  key={flow.id}
                  flow={flow}
                  onChange={(updated) => { const next = [...flows]; next[idx] = updated; setFlows(next); }}
                  onRemove={() => setFlows(flows.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
            <button
              onClick={() => setFlows([...flows, { id: crypto.randomUUID(), name: "", startPath: "/", steps: [] }])}
              className="mb-[24px] rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
            >
              + Add Flow
            </button>
            <div className="flex items-center gap-[12px]">
              <button onClick={handleSaveFlows} disabled={saving} className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black">
                {saving ? "Saving..." : "Save"}
              </button>
              {saved && <span className="text-[14px] text-accent-green">Saved</span>}
            </div>
          </div>
        ) : (
          <div className="flex max-w-[560px] flex-col gap-[20px]">
            <div className="rounded-[12px] border border-border-primary p-[20px]">
              <h3 className="mb-[4px] text-[14px] font-bold text-foreground">
                {project.archived ? "Unarchive Project" : "Archive Project"}
              </h3>
              <p className="mb-[12px] text-[13px] text-text-muted">
                {project.archived ? "Restore this project to the sidebar." : "Hide this project from the sidebar. Reports are preserved."}
              </p>
              <button onClick={handleArchive} className="rounded-[8px] border border-border-strong px-[16px] py-[6px] text-[13px] text-foreground transition-colors hover:bg-surface-tertiary">
                {project.archived ? "Unarchive" : "Archive"}
              </button>
            </div>
            <div className="rounded-[12px] border border-status-error-border p-[20px]">
              <h3 className="mb-[4px] text-[14px] font-bold text-foreground">Delete Project</h3>
              <p className="mb-[12px] text-[13px] text-text-muted">Permanently remove this project and all its reports. This cannot be undone.</p>
              {!showDeleteConfirm ? (
                <button onClick={() => setShowDeleteConfirm(true)} className="rounded-[8px] border border-status-error-border px-[16px] py-[6px] text-[13px] text-status-error transition-colors hover:bg-status-error-muted">
                  Delete Project
                </button>
              ) : (
                <div className="flex items-center gap-[8px]">
                  <button onClick={handleDelete} disabled={deleting} className="rounded-[8px] bg-status-error px-[16px] py-[6px] text-[13px] font-bold text-white disabled:opacity-50">
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="text-[13px] text-text-muted hover:text-foreground">Cancel</button>
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
