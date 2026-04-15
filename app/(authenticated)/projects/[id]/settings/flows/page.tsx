"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSidebar } from "@/components/SidebarProvider";
import { FlowEditor, newStep } from "@/components/FlowEditor";
import SaveButton from "@/components/SaveButton";
import type { Project, FlowEntry } from "@/lib/types";

export default function ProjectFlowsSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setFlows(p.flows || []);
      });
  }, [params.id]);

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

  const handleSave = async () => {
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

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-[8px] text-[24px] font-bold text-foreground">Flows</h1>
      <p className="mb-[32px] text-[14px] text-text-muted">
        Scripted browser interactions for testing multi-step flows.
        Each flow runs against both prod and dev URLs, capturing screenshots at defined points.
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
        className="mb-[24px] rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-foreground/10"
      >
        + Add Flow
      </button>

      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </div>
  );
}
