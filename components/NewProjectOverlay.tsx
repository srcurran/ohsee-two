"use client";

import { useState } from "react";
import { BREAKPOINTS, BUILT_IN_VARIANTS } from "@/lib/constants";
import BreakpointEditor from "@/components/settings/BreakpointEditor";

interface Props {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export default function NewProjectOverlay({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([...BREAKPOINTS]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = prodUrl.trim() !== "" && devUrl.trim() !== "";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
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
        const project = await res.json();
        onCreated(project.id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[10px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[520px] rounded-[12px] bg-surface-content p-[32px]">
        <h2 className="mb-[24px] text-[24px] font-bold text-foreground">New Project</h2>

        <div className="flex flex-col gap-[20px]">
          {/* Project Name */}
          <div>
            <label className="mb-[4px] block text-[14px] text-foreground">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className={inputClass}
            />
            <p className="mt-[4px] text-[12px] text-text-muted">
              Leave blank to use the domain name.
            </p>
          </div>

          {/* Production URL */}
          <div>
            <label className="mb-[4px] block text-[14px] text-foreground">Production URL</label>
            <input
              type="text"
              value={prodUrl}
              onChange={(e) => setProdUrl(e.target.value)}
              placeholder="https://www.example.com"
              className={inputClass}
            />
          </div>

          {/* Development URL */}
          <div>
            <label className="mb-[4px] block text-[14px] text-foreground">Development URL</label>
            <input
              type="text"
              value={devUrl}
              onChange={(e) => setDevUrl(e.target.value)}
              placeholder="https://staging.example.com"
              className={inputClass}
            />
          </div>

          {/* Breakpoints */}
          <BreakpointEditor breakpoints={breakpoints} onChange={setBreakpoints} />

          {/* Options */}
          <div className="flex flex-col gap-[12px]">
            <div>
              <p className="mb-[6px] text-[14px] text-foreground">Variants</p>
              <div className="flex gap-[16px]">
                {BUILT_IN_VARIANTS.map((v) => (
                  <label key={v.id} className="flex items-center gap-[6px] text-[14px] text-foreground">
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

            <label className="flex items-center gap-[8px] text-[14px] text-foreground">
              <input
                type="checkbox"
                checked={requiresAuth}
                onChange={(e) => setRequiresAuth(e.target.checked)}
                className="h-[16px] w-[16px]"
              />
              Requires authentication
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-[28px] flex justify-end gap-[12px]">
          <button
            onClick={onClose}
            className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-[12px] bg-foreground px-[32px] py-[10px] text-[16px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
