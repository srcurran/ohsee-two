"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SaveButton from "@/components/SaveButton";
import { useSidebar } from "@/components/SidebarProvider";
import type { Project } from "@/lib/types";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ProjectGeneralSettings() {
  const params = useParams<{ id: string }>();
  const { refreshProjects } = useSidebar();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setName(p.name || "");
        setProdUrl(p.prodUrl);
        setDevUrl(p.devUrl);
      });
  }, [params.id]);

  const handleSave = async () => {
    if (!project || !prodUrl || !devUrl) return;
    setSaving(true);
    setSaved(false);

    const body = {
      name: name.trim() || undefined,
      prodUrl: prodUrl.replace(/\/$/, ""),
      devUrl: devUrl.replace(/\/$/, ""),
    };

    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
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
    <div className="max-w-[560px]">
      <p className="mb-[24px] text-[14px] text-text-muted">Project configuration and defaults.</p>

      <div className="flex flex-col gap-[24px]">
        {/* Project Name */}
        <div>
          <label className="mb-[4px] block text-[14px] text-foreground">
            Project Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={getDomain(prodUrl)}
            className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
          />
          <p className="mt-[4px] text-[12px] text-text-muted">
            Leave blank to use the domain name.
          </p>
        </div>

        {/* Production URL */}
        <div>
          <label className="mb-[4px] block text-[14px] text-foreground">
            Production URL
          </label>
          <input
            type="text"
            value={prodUrl}
            onChange={(e) => setProdUrl(e.target.value)}
            className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors focus:border-foreground"
          />
        </div>

        {/* Development URL */}
        <div>
          <label className="mb-[4px] block text-[14px] text-foreground">
            Development URL
          </label>
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors focus:border-foreground"
          />
        </div>

        {/* Save */}
        <SaveButton onClick={handleSave} saving={saving} saved={saved} disabled={!prodUrl || !devUrl} />
      </div>
    </div>
  );
}
