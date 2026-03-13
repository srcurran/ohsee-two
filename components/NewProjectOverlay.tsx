"use client";

import { useState } from "react";
import { BUILT_IN_VARIANTS } from "@/lib/constants";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NewProjectOverlay({ onClose, onCreated }: Props) {
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [paths, setPaths] = useState<string[]>(["/"]);
  const [newPath, setNewPath] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  const handleCrawl = async () => {
    if (!prodUrl) return;
    setCrawling(true);
    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prodUrl }),
      });
      if (res.ok) {
        const { paths: discovered } = await res.json();
        setPaths(discovered);
      }
    } catch {
      // ignore
    } finally {
      setCrawling(false);
    }
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

  const handleSubmit = async () => {
    if (!prodUrl || !devUrl) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prodUrl: prodUrl.replace(/\/$/, ""),
          devUrl: devUrl.replace(/\/$/, ""),
          requiresAuth,
          variants: BUILT_IN_VARIANTS.filter((v) => selectedVariants.includes(v.id)),
          pages: paths.map((p) => ({ path: p })),
        }),
      });
      if (res.ok) {
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[600px] rounded-[12px] bg-surface-content p-[32px]">
        <h2 className="mb-[24px] text-[24px] font-bold text-foreground">New Project</h2>

        <div className="mb-[16px]">
          <label className="mb-[4px] block text-[14px] text-foreground">Production URL</label>
          <input
            type="text"
            value={prodUrl}
            onChange={(e) => setProdUrl(e.target.value)}
            placeholder="https://www.example.com"
            className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
          />
        </div>

        <div className="mb-[24px]">
          <label className="mb-[4px] block text-[14px] text-foreground">Development URL</label>
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="https://staging.example.com"
            className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-foreground outline-none focus:border-foreground"
          />
        </div>

        {/* Options */}
        <div className="mb-[24px] flex flex-col gap-[12px]">
          <label className="flex items-center gap-[8px] text-[14px] text-foreground">
            <input
              type="checkbox"
              checked={requiresAuth}
              onChange={(e) => setRequiresAuth(e.target.checked)}
              className="h-[16px] w-[16px]"
            />
            Requires authentication (for localhost testing)
          </label>
          <div>
            <p className="mb-[6px] text-[13px] text-text-muted">Test variants</p>
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
        </div>

        <div className="mb-[24px]">
          <div className="mb-[8px] flex items-center justify-between">
            <label className="text-[14px] text-foreground">Pages</label>
            <button
              onClick={handleCrawl}
              disabled={!prodUrl || crawling}
              className="text-[12px] text-foreground underline disabled:opacity-50"
            >
              {crawling ? "Crawling..." : "Discover from sitemap"}
            </button>
          </div>

          <div className="mb-[8px] flex gap-[8px]">
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

          <div className="max-h-[200px] overflow-y-auto">
            {paths.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between border-b border-border-primary py-[6px] text-[14px] text-foreground"
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
          </div>
        </div>

        <div className="flex justify-end gap-[12px]">
          <button
            onClick={onClose}
            className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prodUrl || !devUrl || paths.length === 0 || submitting}
            className="rounded-[12px] bg-accent-primary px-[40px] py-[10px] text-[16px] font-bold text-foreground transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
