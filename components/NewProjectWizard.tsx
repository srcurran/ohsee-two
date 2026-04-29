"use client";

import { useState } from "react";
import MaterialField from "@/components/MaterialField";
import Wizard from "@/components/Wizard";
import { checkUrl } from "@/lib/url-validation";

interface Props {
  onClose: () => void;
  /** Fires after POST /api/projects succeeds. The host hands off to
   *  NewTestWizard so the user lands directly in test creation. */
  onCreated: (projectId: string) => void;
}

/**
 * Two-step new-project flow per Figma 187:1092:
 *   1. Name (single text field)
 *   2. Prod + Dev URL (two MaterialFields, format-validated)
 *
 * On submit, POSTs /api/projects with the collected data and emits the
 * created project id. The host (SidebarProvider) immediately opens the
 * NewTestWizard for the same project so the two flows feel continuous.
 */
export default function NewProjectWizard({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [prodUrl, setProdUrl] = useState("");
  const [devUrl, setDevUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const prodCheck = prodUrl ? checkUrl(prodUrl) : null;
  const devCheck = devUrl ? checkUrl(devUrl) : null;
  const urlsValid = prodCheck?.ok === true && devCheck?.ok === true;

  const handleSubmit = async () => {
    if (!urlsValid) return;
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

  if (step === 1) {
    return (
      <Wizard
        title="New project"
        step={1}
        totalSteps={2}
        nextLabel="Next"
        nextDisabled={!name.trim()}
        onNext={() => setStep(2)}
        onClose={onClose}
      >
        <MaterialField
          label="What is the project's name?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Foyer (Dev v Prod)"
          autoFocus
        />
      </Wizard>
    );
  }

  return (
    <Wizard
      title="New project"
      step={2}
      totalSteps={2}
      nextLabel="Create Project"
      nextDisabled={!urlsValid}
      busy={submitting}
      onPrev={() => setStep(1)}
      onNext={handleSubmit}
      onClose={onClose}
    >
      <div className="wizard__fields">
        <MaterialField
          label="Prod URL"
          value={prodUrl}
          onChange={(e) => setProdUrl(e.target.value)}
          placeholder="https://www.example.com"
          status={!prodUrl ? "idle" : prodCheck?.ok ? "valid" : "invalid"}
          error={prodCheck && !prodCheck.ok ? prodCheck.reason : null}
          spellCheck={false}
          autoFocus
        />
        <MaterialField
          label="Dev URL"
          value={devUrl}
          onChange={(e) => setDevUrl(e.target.value)}
          placeholder="https://staging.example.com"
          status={!devUrl ? "idle" : devCheck?.ok ? "valid" : "invalid"}
          error={devCheck && !devCheck.ok ? devCheck.reason : null}
          spellCheck={false}
        />
      </div>
    </Wizard>
  );
}
