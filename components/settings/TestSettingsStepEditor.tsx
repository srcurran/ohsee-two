/** Sub-view that replaces the overlay body while a step is being added or
 * edited. Shows a fork ("Path" vs "Playwright") on first open, then the
 * path-or-script form. Path resolution validates that the user-entered URL
 * belongs to one of the project's domains. */

"use client";

import { useState } from "react";
import MaterialField from "@/components/utility/MaterialField";
import ScriptStepEditor from "@/components/settings/ScriptStepEditor";
import { resolveProjectPath } from "@/lib/url-utils";
import type { TestStep } from "@/lib/types";
import { Icon } from "@/components/utility/Icon";

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
  const [pickedType, setPickedType] = useState<"url" | "microtest" | null>(
    editing ? editing.type : (initialType ?? null),
  );
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

  if (!pickedType) {
    return (
      <div className="add-step-fork">
        <p className="add-step-fork__copy">
          What kind of step do you want to add?
        </p>
        <div className="add-step-fork__cards">
          <button
            type="button"
            className="add-step-fork__card"
            onClick={() => setPickedType("url")}
          >
            <Icon name="globe" size={16} className="add-step-fork__card-icon" />
            <span className="add-step-fork__card-title">Path</span>
            <span className="add-step-fork__card-copy">Navigate to a page on this site and capture a screenshot.</span>
          </button>
          <button
            type="button"
            className="add-step-fork__card"
            onClick={() => setPickedType("microtest")}
          >
            <Icon name="playwright" size={16} className="add-step-fork__card-icon" />
            <span className="add-step-fork__card-title">Playwright</span>
            <span className="add-step-fork__card-copy">Run a Playwright script — type it or record one.</span>
          </button>
        </div>
      </div>
    );
  }

  if (pickedType === "url") {
    return (
      <div className="step-editor">
        <MaterialField
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
        <div className="step-editor__actions">
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
