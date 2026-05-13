"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import type { TestStep } from "@/lib/types";

/**
 * Inline Playwright-script step editor. CodeMirror setup lifted from the
 * deleted MicroTestEditor, now used both inside TestSettingsOverlay and the
 * new-test wizard. Writes the script directly onto the step (no separate
 * microTests collection).
 */
export default function ScriptStepEditor({
  editing,
  onSave,
  onCancel,
  primaryLabel,
}: {
  editing: TestStep | null;
  onSave: (name: string, script: string) => void;
  onCancel: () => void;
  /** Optional override for the primary button (defaults to "Save" when
   *  editing, "Add step" when creating). */
  primaryLabel?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [name, setName] = useState(editing?.name ?? "");

  // Stable callback ref so the keymap can call the latest version without
  // us re-binding the editor. Mod-S grabs the live name + doc and saves.
  const saveRef = useRef(() => {});
  saveRef.current = () => {
    const script = viewRef.current?.state.doc.toString() ?? editing?.script ?? "";
    onSave(name, script);
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: editing?.script ?? "",
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.lineWrapping,
        cmPlaceholder(
          '// Your script receives `page` (Playwright Page) and `expect`\nawait page.click("button");',
        ),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              saveRef.current();
              return true;
            },
          },
        ]),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // Re-mount only when switching between create/edit of different steps;
    // keystrokes shouldn't reset the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  return (
    <div className="step-editor">
      <label className="step-editor__field">
        <span className="step-editor__label">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Click sign in"
          className="input input--compact"
          autoFocus
        />
      </label>
      <p className="step-editor__hint">
        Your script receives <code className="code-inline code-inline--xs">page</code>{" "}
        (Playwright Page) and <code className="code-inline code-inline--xs">expect</code>{" "}
        as arguments.
      </p>
      <div ref={editorRef} className="code-editor" />
      <div className="step-editor__actions">
        <button type="button" className="btn btn--text" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => saveRef.current()}
          disabled={!name.trim()}
        >
          {primaryLabel ?? (editing ? "Save" : "Add step")}
        </button>
      </div>
    </div>
  );
}
