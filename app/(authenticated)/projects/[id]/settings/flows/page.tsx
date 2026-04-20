"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import { FlowEditor } from "@/components/FlowEditor";
import type { Project, FlowEntry } from "@/lib/types";

export default function ProjectFlowsSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const lastSavedSnapshot = useRef<string>("");

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setFlows(p.flows || []);
        lastSavedSnapshot.current = JSON.stringify(p.flows || []);
      });
  }, [params.id]);

  // Autosave after a 500ms debounce on any flow edit.
  useEffect(() => {
    if (!project) return;
    const snapshot = JSON.stringify(flows);
    if (snapshot === lastSavedSnapshot.current) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flows }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        lastSavedSnapshot.current = snapshot;
        refreshProjects();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [flows, project, refreshProjects]);

  const addFlow = () => {
    setFlows([
      ...flows,
      {
        id: crypto.randomUUID(),
        name: "",
        startPath: "/",
        steps: [],
      },
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

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-header__title" style={{ fontSize: "var(--font-size-3xl)", fontWeight: "var(--weight-bold)", marginBottom: "var(--space-2)" }}>Flows</h1>
      <p className="section-body" style={{ marginBottom: "var(--space-8)" }}>
        Scripted browser interactions for testing multi-step flows.
        Each flow runs against both prod and dev URLs, capturing screenshots at defined points.
      </p>

      <div className="stack stack--md" style={{ marginBottom: "var(--space-4)" }}>
        {flows.map((flow, idx) => (
          <FlowEditor
            key={flow.id}
            flow={flow}
            onChange={(updated) => updateFlow(idx, updated)}
            onRemove={() => removeFlow(idx)}
            allowedDomainUrls={[project.prodUrl, project.devUrl]}
          />
        ))}
      </div>

      <button onClick={addFlow} className="btn btn--secondary" style={{ marginBottom: "var(--space-6)" }}>
        + Add Flow
      </button>
    </div>
  );
}
