"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export default function NewProjectOverlay({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
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

  return (
    <div
      className="modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal__panel">
        <h2 className="modal__title">New Project</h2>

        <div className="stack stack--xl">
          <div className="field">
            <label className="field__label">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
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
              placeholder="https://www.example.com"
              className="input"
            />
          </div>

          <div className="field">
            <label className="field__label">Development URL</label>
            <input
              type="text"
              value={devUrl}
              onChange={(e) => setDevUrl(e.target.value)}
              placeholder="https://staging.example.com"
              className="input"
            />
          </div>
        </div>

        <div className="modal__actions">
          <button onClick={onClose} className="btn btn--text">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="btn btn--primary"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
