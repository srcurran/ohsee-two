"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BreakpointEditor from "@/components/settings/BreakpointEditor";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
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
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
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
        setRequiresAuth(p.requiresAuth || false);
        setSelectedVariants((p.variants || []).map((v) => v.id));
        setBreakpoints(p.breakpoints?.length ? p.breakpoints : [...BREAKPOINTS]);
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
      requiresAuth,
      variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
      breakpoints,
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

        {/* Breakpoints */}
        <BreakpointEditor
          breakpoints={breakpoints}
          onChange={setBreakpoints}
        />

        {/* Variants */}
        <div>
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
        </div>

        {/* Auth */}
        <label className="flex items-center gap-[8px] text-[14px] text-foreground">
          <input
            type="checkbox"
            checked={requiresAuth}
            onChange={(e) => setRequiresAuth(e.target.checked)}
            className="h-[16px] w-[16px]"
          />
          Requires authentication (for localhost testing)
        </label>

        {/* Save */}
        <div className="flex items-center gap-[12px]">
          <button
            onClick={handleSave}
            disabled={!prodUrl || !devUrl || saving}
            className="rounded-[12px] bg-black px-[32px] py-[10px] text-[16px] font-bold text-white transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <span className="text-[14px] text-accent-green">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
