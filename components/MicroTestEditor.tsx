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

export default function MicroTestEditor({ projectId, microTest, onSave, onClose }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [name, setName] = useState(microTest.name);
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

    const res = await fetch(`/api/projects/${projectId}/micro-tests/${microTest.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || microTest.name,
        displayName: displayName.trim() || microTest.displayName,
        script,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      onSave(updated);
    }
    setSaving(false);
  }, [projectId, microTest.id, microTest.name, microTest.displayName, name, displayName, getScript, onSave]);

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

      <div className="row" style={{ gap: "var(--space-3)" }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label field__label--sm">Identifier</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="loginStep"
            className="input input--compact input--code"
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field__label field__label--sm">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Log In"
            className="input input--compact"
          />
        </div>
      </div>

      <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
        Your script receives <code className="code-inline code-inline--xs">page</code> (Playwright Page) and <code className="code-inline code-inline--xs">expect</code> as arguments.
      </p>

      <div ref={editorRef} className="code-editor" />

      <div className="row">
        <button onClick={handleSave} disabled={saving} className="btn btn--primary-sm">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={handleTest} disabled={testing} className="btn btn--outline-soft">
          {testing ? "Running..." : "Test"}
        </button>
        <span style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>Cmd+S to save</span>
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
