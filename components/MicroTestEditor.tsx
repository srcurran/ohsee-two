"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import type { MicroTest } from "@/lib/types";

interface Props {
  projectId: string;
  microTest: MicroTest;
  onSave: (updated: MicroTest) => void;
  onClose: () => void;
}

/**
 * Camel-case slug suitable for use as a JS-ish identifier (and as the
 * `name` field of a MicroTest, which only surfaces in error messages).
 * "Click Get Started" → "clickGetStarted", "Step 9" → "step9".
 */
function deriveIdentifier(displayName: string): string {
  const words = displayName.trim().match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length === 0) return "step";
  const [first, ...rest] = words;
  return (
    first.toLowerCase() +
    rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("")
  );
}

export default function MicroTestEditor({ projectId, microTest, onSave, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Single user-facing name field. The internal identifier (`microTest.name`)
  // is auto-derived from this on save — we no longer ask the user to maintain
  // both. Existing identifiers are preserved if displayName hasn't changed.
  const [displayName, setDisplayName] = useState(microTest.displayName);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    pass: boolean;
    error?: string;
    durationMs?: number;
  } | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: microTest.script,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.lineWrapping,
        cmPlaceholder('// Your script receives `page` (Playwright Page) and `expect`\nawait page.click("button");'),
        keymap.of([
          {
            key: "Mod-s",
            run: () => {
              handleSave();
              return true;
            },
          },
        ]),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getScript = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? microTest.script;
  }, [microTest.script]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const script = getScript();

    const trimmedDisplay = displayName.trim() || microTest.displayName;
    // If the display name didn't change, keep the existing identifier (so
    // anything that referenced `microTest.name` in logs stays stable). If it
    // did change, regenerate the identifier from the new display name.
    const nextName =
      trimmedDisplay === microTest.displayName
        ? microTest.name
        : deriveIdentifier(trimmedDisplay);

    const res = await fetch(`/api/projects/${projectId}/micro-tests/${microTest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        displayName: trimmedDisplay,
        script,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      onSave(updated);
      // "Save and close" semantics — bounce out of the editor on success.
      onClose();
    }
    setSaving(false);
  }, [projectId, microTest.id, microTest.name, microTest.displayName, displayName, getScript, onSave, onClose]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const script = getScript();
    await fetch(`/api/projects/${projectId}/micro-tests/${microTest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script }),
    });

    const res = await fetch(`/api/projects/${projectId}/micro-tests/${microTest.id}/test`, {
      method: "POST",
    });

    if (res.ok) {
      const result = await res.json();
      setTestResult(result);
    } else {
      setTestResult({ pass: false, error: "Request failed" });
    }
    setTesting(false);
  };

  return (
    <div className="stack stack--lg">
      <button onClick={onClose} className="btn btn--text" style={{ alignSelf: "flex-start" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to composition
      </button>

      <div className="field">
        <label className="field__label field__label--sm">Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Log In"
          className="input input--compact"
        />
      </div>

      <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
        Your script receives <code className="code-inline code-inline--xs">page</code> (Playwright Page) and <code className="code-inline code-inline--xs">expect</code> as arguments.
      </p>

      <div ref={editorRef} className="code-editor" />

      <div className="row">
        <button onClick={handleSave} disabled={saving} className="btn btn--primary-sm">
          {saving ? "Saving..." : "Save and close"}
        </button>
        <button onClick={handleTest} disabled={testing} className="btn btn--outline-soft">
          {testing ? "Running..." : "Test"}
        </button>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>Cmd+S to save and close</span>
      </div>

      {testResult && (
        <div className={`test-result ${testResult.pass ? "test-result--pass" : "test-result--fail"}`}>
          <div className="test-result__header">
            <span className="test-result__status">{testResult.pass ? "PASS" : "FAIL"}</span>
            {testResult.durationMs !== undefined && (
              <span className="test-result__duration">{testResult.durationMs}ms</span>
            )}
          </div>
          {testResult.error && (
            <pre className="test-result__error">{testResult.error}</pre>
          )}
        </div>
      )}
    </div>
  );
}
