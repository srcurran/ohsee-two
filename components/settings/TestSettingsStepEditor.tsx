/** Sub-view that replaces the overlay body while a step is being added or
 * edited. A simple test only adds path steps, so creating one goes straight to
 * the path form; the script form is still reached when editing a legacy
 * Playwright step. Path resolution validates that the user-entered URL belongs
 * to one of the project's domains. */

"use client";

import { useState } from "react";
import Field from "@/components/utility/Field";
import ScriptStepEditor from "@/components/settings/ScriptStepEditor";
import { resolveProjectPath } from "@/lib/url-utils";
import type { TestStep } from "@/lib/types";

interface AddEditStepViewProps {
  editing: TestStep | null;
  /** Pre-pick the path or script editor when creating a new step (skipping
   *  the fork). Set when the user clicks the empty-state "Add path" or
   *  "Record with Playwright" buttons. */
  initialType?: "url" | "microtest";
  /** Project's prod + dev URLs — used to validate that the user-entered
   *  path/URL belongs to one of our domains. */
  projectUrls: string[];
  onUpdate: (id: string, patch: Partial<TestStep>) => void;
  onAddUrl: (url: string) => void;
  onAddScript: (name: string, script: string) => void;
  onCancel: () => void;
}

export function AddEditStepView({
  editing,
  initialType,
  projectUrls,
  onUpdate,
  onAddUrl,
  onAddScript,
  onCancel,
}: AddEditStepViewProps) {
  // A new step is always a path step (the only kind a simple test takes);
  // editing keeps the existing step's type so legacy Playwright steps still
  // open their script form.
  const pickedType: "url" | "microtest" = editing ? editing.type : (initialType ?? "url");
  const [pathInput, setPathInput] = useState<string>(editing?.url ?? "");

  // Resolve the input down to a path. Accepts full URLs (which get stripped
  // to their pathname) and bare paths. Errors on third-party domains.
  const resolved = pathInput.trim() ? resolveProjectPath(pathInput, projectUrls) : null;
  const pathStatus =
    !pathInput ? "idle" : resolved?.ok ? "valid" : "invalid";

  const handleSavePath = () => {
    if (!resolved?.ok) return;
    const value = resolved.path;
    if (editing) {
      onUpdate(editing.id, { url: value });
      onCancel();
    } else {
      onAddUrl(value);
    }
  };

  if (pickedType === "url") {
    return (
      <div className="step-editor stack stack--lg">
        <Field
          label="Path"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="/about"
          status={pathStatus}
          error={pathStatus === "invalid" && resolved && !resolved.ok ? resolved.error : null}
          hint={resolved?.ok && resolved.path !== pathInput.trim()
            ? `Will be saved as ${resolved.path}`
            : undefined}
          autoFocus
          spellCheck={false}
        />
        <div className="step-editor__actions row row--end">
          <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSavePath}
            disabled={!resolved?.ok}
          >
            {editing ? "Save" : "Add step"}
          </button>
        </div>
      </div>
    );
  }

  // Playwright (script) editor — inline CodeMirror, no separate library.
  return (
    <ScriptStepEditor
      editing={editing}
      defaultUrl={projectUrls[0]}
      onSave={(name, script) => {
        if (editing) {
          onUpdate(editing.id, { name, script });
          onCancel();
        } else {
          onAddScript(name, script);
        }
      }}
      onCancel={onCancel}
    />
  );
}
