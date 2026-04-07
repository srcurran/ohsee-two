"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project } from "@/lib/types";

export default function ProjectPagesSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setPaths(p.pages.map((pg) => pg.path));
      });
  }, [params.id]);

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
    if (!project || paths.length === 0) return;
    setSaving(true);
    setSaved(false);

    // Preserve existing page IDs where paths match
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

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-[8px] text-[24px] font-bold text-foreground">Pages</h1>
      <p className="mb-[32px] text-[14px] text-text-muted">
        URL paths to capture during each scan.
      </p>

      {/* Add path input */}
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

      {/* Path list */}
      <div className="mb-[24px]">
        {paths.map((p) => (
          <div
            key={p}
            className="flex items-center justify-between border-b border-border-primary py-[8px] text-[14px] text-foreground"
          >
            <span>{p}</span>
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

      {/* Save */}
      <div className="flex items-center gap-[12px]">
        <button
          onClick={handleSave}
          disabled={paths.length === 0 || saving}
          className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-[14px] text-accent-green">Saved</span>
        )}
      </div>
    </div>
  );
}
