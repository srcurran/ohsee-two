"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
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
  const lastSavedSnapshot = useRef<string>("");

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p);
        setName(p.name || "");
        setProdUrl(p.prodUrl);
        setDevUrl(p.devUrl);
        lastSavedSnapshot.current = JSON.stringify({
          name: p.name || "",
          prodUrl: p.prodUrl,
          devUrl: p.devUrl,
        });
      });
  }, [params.id]);

  // Autosave 500ms after the last edit. Skips the initial hydration and any
  // state where required fields are missing.
  useEffect(() => {
    if (!project || !prodUrl || !devUrl) return;
    const snapshot = JSON.stringify({ name, prodUrl, devUrl });
    if (snapshot === lastSavedSnapshot.current) return;
    const timer = setTimeout(async () => {
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
        lastSavedSnapshot.current = snapshot;
        refreshProjects();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name, prodUrl, devUrl, project, refreshProjects]);

  if (!project) {
    return (
      <div className="center" style={{ height: "100%" }}>
        <p className="loader-text">Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p className="section-body" style={{ marginBottom: "var(--space-6)" }}>Project configuration and defaults.</p>

      <div className="stack stack--xl">
        <div className="field">
          <label className="field__label">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={getDomain(prodUrl)}
            className="input"
          />
          <p className="field__hint">Leave blank to use the domain name.</p>
        </div>

        <div className="field">
          <label className="field__label">Production URL</label>
          <input
            type="text"
            value={prodUrl}
            onChange={(e) => setProdUrl(e.target.value)}
            className="input"
          />
        </div>

        <div className="field">
          <label className="field__label">Development URL</label>
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            className="input"
          />
        </div>

      </div>
    </div>
  );
}
