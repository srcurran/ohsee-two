"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project } from "@/lib/types";

export default function ProjectPagesSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const lastSavedSnapshot = useRef<string>("");

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        const loaded = p.pages.map((pg) => pg.path);
        setPaths(loaded);
        lastSavedSnapshot.current = JSON.stringify(loaded);
      });
  }, [params.id]);

  // Autosave after 500ms debounce. Requires at least one path — empty lists
  // aren't a valid save.
  useEffect(() => {
    if (!project || paths.length === 0) return;
    const snapshot = JSON.stringify(paths);
    if (snapshot === lastSavedSnapshot.current) return;
    const timer = setTimeout(async () => {
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
        lastSavedSnapshot.current = snapshot;
        refreshProjects();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [paths, project, refreshProjects]);

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

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: "var(--space-2)", fontSize: "var(--font-size-3xl)", fontWeight: "var(--weight-bold)", color: "var(--foreground)" }}>Pages</h1>
      <p className="section-body" style={{ marginBottom: "var(--space-8)" }}>
        URL paths to capture during each scan.
      </p>

      <div className="row" style={{ gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddPath()}
          placeholder="/about"
          className="input input--compact"
          style={{ flex: 1 }}
        />
        <button onClick={handleAddPath} className="btn btn--secondary">
          Add
        </button>
      </div>

      <div style={{ marginBottom: "var(--space-6)" }}>
        {paths.map((p) => (
          <div key={p} className="path-row">
            <span>{p}</span>
            <button onClick={() => handleRemovePath(p)} className="flow-step__remove">
              Remove
            </button>
          </div>
        ))}
        {paths.length === 0 && (
          <p className="flow-editor__empty" style={{ paddingBlock: "var(--space-4)" }}>
            Add at least one page path.
          </p>
        )}
      </div>
    </div>
  );
}
