"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import { useSidebar } from "./SidebarProvider";
import type { Project } from "@/lib/types";

const ALL_BREAKPOINTS = [...BREAKPOINTS];

interface Props {
  project: Project;
  onClose: () => void;
  onUpdated: (project: Project) => void;
}

export default function ProjectSettingsOverlay({ project, onClose, onUpdated }: Props) {
  const router = useRouter();
  const { refreshProjects } = useSidebar();
  const [prodUrl, setProdUrl] = useState(project.prodUrl);
  const [devUrl, setDevUrl] = useState(project.devUrl);
  const [requiresAuth, setRequiresAuth] = useState(project.requiresAuth || false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>(
    (project.variants || []).map((v) => v.id)
  );
  const [breakpoints, setBreakpoints] = useState<number[]>(
    project.breakpoints?.length ? project.breakpoints : [...ALL_BREAKPOINTS]
  );
  const [paths, setPaths] = useState<string[]>(project.pages.map((p) => p.path));
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tab, setTab] = useState<"general" | "pages" | "advanced">("general");

  const toggleBreakpoint = (bp: number) => {
    const next = breakpoints.includes(bp)
      ? breakpoints.filter((b) => b !== bp)
      : [...breakpoints, bp].sort((a, b) => b - a);
    if (next.length === 0) return;
    setBreakpoints(next);
  };

  const handleAddPath = () => {
    const p = newPath.trim();
    if (p && !paths.includes(p)) {
      setPaths([...paths, p.startsWith("/") ? p : `/${p}`]);
      setNewPath("");
    }
  };

  const handleRemovePath = (path: string) => {
    setPaths(paths.filter((p) => p !== path));
  };

  const handleSave = async () => {
    if (!prodUrl || !devUrl || paths.length === 0) return;
    setSaving(true);

    // Build updated pages — preserve existing IDs where paths match
    const existingByPath = new Map(project.pages.map((p) => [p.path, p]));
    const updatedPages = paths.map((path) => {
      const existing = existingByPath.get(path);
      return existing || { id: crypto.randomUUID(), path };
    });

    const body = {
      prodUrl: prodUrl.replace(/\/$/, ""),
      devUrl: devUrl.replace(/\/$/, ""),
      requiresAuth,
      variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
      breakpoints: breakpoints.length === ALL_BREAKPOINTS.length ? undefined : breakpoints,
      pages: updatedPages,
    };

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
      refreshProjects();
      onClose();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      refreshProjects();
      router.push("/");
    }
    setDeleting(false);
  };

  const handleArchive = async () => {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
      refreshProjects();
      onClose();
    }
  };

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "pages" as const, label: "Pages" },
    { id: "advanced" as const, label: "Advanced" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col rounded-[12px] bg-surface-content">
        {/* Header */}
        <div className="flex items-center justify-between px-[32px] pt-[28px] pb-[16px]">
          <h2 className="text-[24px] font-bold text-foreground">Project Settings</h2>
          <button
            onClick={onClose}
            className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] text-text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-[4px] px-[32px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-[8px] px-[16px] py-[8px] text-[14px] transition-colors ${
                tab === t.id
                  ? "bg-foreground/5 font-bold text-foreground"
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-[32px] py-[20px]">
          {tab === "general" && (
            <div className="flex flex-col gap-[20px]">
              {/* URLs */}
              <div>
                <label className="mb-[4px] block text-[14px] text-foreground">
                  Production URL
                </label>
                <input
                  type="text"
                  value={prodUrl}
                  onChange={(e) => setProdUrl(e.target.value)}
                  className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
                />
              </div>
              <div>
                <label className="mb-[4px] block text-[14px] text-foreground">
                  Development URL
                </label>
                <input
                  type="text"
                  value={devUrl}
                  onChange={(e) => setDevUrl(e.target.value)}
                  className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
                />
              </div>

              {/* Breakpoints */}
              <div>
                <label className="mb-[8px] block text-[14px] text-foreground">
                  Breakpoints
                </label>
                <div className="flex flex-wrap gap-[8px]">
                  {ALL_BREAKPOINTS.map((bp) => {
                    const active = breakpoints.includes(bp);
                    return (
                      <button
                        key={bp}
                        onClick={() => toggleBreakpoint(bp)}
                        className={`rounded-[8px] border px-[14px] py-[6px] text-[13px] transition-colors ${
                          active
                            ? "border-foreground bg-foreground/5 font-bold text-foreground"
                            : "border-border-primary text-text-muted hover:border-border-strong hover:text-foreground"
                        }`}
                      >
                        {bp}px
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Variants */}
              <div>
                <label className="mb-[8px] block text-[14px] text-foreground">
                  Test Variants
                </label>
                <div className="flex gap-[16px]">
                  {BUILT_IN_VARIANTS.map((v) => (
                    <label key={v.id} className="flex items-center gap-[8px] text-[14px] text-foreground">
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

              {/* Auth toggle */}
              <label className="flex items-center gap-[8px] text-[14px] text-foreground">
                <input
                  type="checkbox"
                  checked={requiresAuth}
                  onChange={(e) => setRequiresAuth(e.target.checked)}
                  className="h-[16px] w-[16px]"
                />
                Requires authentication (for localhost testing)
              </label>
            </div>
          )}

          {tab === "pages" && (
            <div className="flex flex-col gap-[16px]">
              <div className="flex gap-[8px]">
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
                  placeholder="/about"
                  className="flex-1 rounded-[8px] border border-border-primary px-[12px] py-[8px] text-[14px] text-foreground outline-none focus:border-foreground"
                />
                <button
                  onClick={handleAddPath}
                  className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-all hover:shadow-elevation-sm"
                >
                  Add
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {paths.map((p) => (
                  <div
                    key={p}
                    className="flex items-center justify-between border-b border-border-primary py-[8px] text-[14px] text-foreground"
                  >
                    <span>{p}</span>
                    <button
                      onClick={() => handleRemovePath(p)}
                      className="text-[12px] text-text-muted hover:text-foreground"
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
            </div>
          )}

          {tab === "advanced" && (
            <div className="flex flex-col gap-[20px]">
              {/* Archive */}
              <div className="rounded-[12px] border border-border-primary p-[20px]">
                <h3 className="mb-[4px] text-[14px] font-bold text-foreground">
                  {project.archived ? "Unarchive Project" : "Archive Project"}
                </h3>
                <p className="mb-[12px] text-[13px] text-text-muted">
                  {project.archived
                    ? "Restore this project to the sidebar."
                    : "Hide this project from the sidebar. Reports are preserved."}
                </p>
                <button
                  onClick={handleArchive}
                  className="rounded-[8px] border border-border-strong px-[16px] py-[6px] text-[13px] text-foreground transition-colors hover:bg-surface-tertiary"
                >
                  {project.archived ? "Unarchive" : "Archive"}
                </button>
              </div>

              {/* Delete */}
              <div className="rounded-[12px] border border-status-error-border p-[20px]">
                <h3 className="mb-[4px] text-[14px] font-bold text-foreground">
                  Delete Project
                </h3>
                <p className="mb-[12px] text-[13px] text-text-muted">
                  Permanently remove this project and all its reports. This cannot be undone.
                </p>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-[8px] border border-status-error-border px-[16px] py-[6px] text-[13px] text-status-error transition-colors hover:bg-status-error-muted"
                  >
                    Delete Project
                  </button>
                ) : (
                  <div className="flex items-center gap-[8px]">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-[8px] bg-status-error px-[16px] py-[6px] text-[13px] font-bold text-white disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Confirm Delete"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="text-[13px] text-text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-[12px] px-[32px] pb-[28px] pt-[12px]">
          <button
            onClick={onClose}
            className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!prodUrl || !devUrl || paths.length === 0 || saving}
            className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
