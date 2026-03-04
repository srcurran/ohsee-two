"use client";

import { useState } from "react";

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
      <div className="w-full max-w-[600px] rounded-[12px] bg-white p-[32px]">
        <h2 className="mb-[24px] text-[24px] font-bold text-black">New Project</h2>

        <div className="mb-[16px]">
          <label className="mb-[4px] block text-[14px] text-black">Production URL</label>
          <input
            type="text"
            value={prodUrl}
            onChange={(e) => setProdUrl(e.target.value)}
            placeholder="https://www.example.com"
            className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-black outline-none focus:border-black"
          />
        </div>

        <div className="mb-[24px]">
          <label className="mb-[4px] block text-[14px] text-black">Development URL</label>
          <input
            type="text"
            value={devUrl}
            onChange={(e) => setDevUrl(e.target.value)}
            placeholder="https://staging.example.com"
            className="w-full rounded-[8px] border border-border-primary px-[12px] py-[10px] text-[14px] text-black outline-none focus:border-black"
          />
        </div>

        <div className="mb-[24px]">
          <div className="mb-[8px] flex items-center justify-between">
            <label className="text-[14px] text-black">Pages</label>
            <button
              onClick={handleCrawl}
              disabled={!prodUrl || crawling}
              className="text-[12px] text-black underline disabled:opacity-50"
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
              className="flex-1 rounded-[8px] border border-border-primary px-[12px] py-[8px] text-[14px] text-black outline-none focus:border-black"
            />
            <button
              onClick={handleAddPath}
              className="rounded-[8px] bg-surface-tertiary px-[16px] py-[8px] text-[14px] text-black"
            >
              Add
            </button>
          </div>

          <div className="max-h-[200px] overflow-y-auto">
            {paths.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between border-b border-border-primary py-[6px] text-[14px] text-black"
              >
                <span>{p}</span>
                <button
                  onClick={() => handleRemovePath(p)}
                  className="text-[12px] text-black/50 hover:text-black"
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
            className="rounded-[12px] px-[24px] py-[10px] text-[16px] text-black"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prodUrl || !devUrl || paths.length === 0 || submitting}
            className="rounded-[12px] bg-accent-green px-[40px] py-[10px] text-[16px] font-bold text-black disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
