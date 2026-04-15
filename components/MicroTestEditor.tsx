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

  // Initialize CodeMirror
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

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

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

    // Save first so the test runs the latest code
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
    <div className="flex flex-col gap-[16px]">
      {/* Header with back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-[4px] text-[13px] text-text-muted transition-colors hover:text-foreground self-start"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to composition
      </button>

      {/* Name fields */}
      <div className="flex gap-[12px]">
        <div className="flex-1">
          <label className="mb-[4px] block text-[12px] text-text-muted">Identifier</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="loginStep"
            className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground font-mono"
          />
        </div>
        <div className="flex-1">
          <label className="mb-[4px] block text-[12px] text-text-muted">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Log In"
            className="w-full rounded-[8px] border border-border-primary bg-transparent px-[12px] py-[8px] text-[14px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
          />
        </div>
      </div>

      {/* Hint */}
      <p className="text-[12px] text-text-muted">
        Your script receives <code className="rounded bg-surface-tertiary px-[4px] py-[1px] font-mono text-[11px]">page</code> (Playwright Page) and <code className="rounded bg-surface-tertiary px-[4px] py-[1px] font-mono text-[11px]">expect</code> as arguments.
      </p>

      {/* Code editor */}
      <div
        ref={editorRef}
        className="min-h-[200px] max-h-[400px] overflow-auto rounded-[8px] border border-border-primary [&_.cm-editor]:!outline-none [&_.cm-scroller]:min-h-[200px]"
      />

      {/* Action buttons */}
      <div className="flex items-center gap-[8px]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-[8px] bg-foreground px-[16px] py-[8px] text-[14px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-[8px] border border-border-strong px-[16px] py-[8px] text-[14px] text-foreground transition-colors hover:bg-surface-tertiary disabled:opacity-50"
        >
          {testing ? "Running..." : "Test"}
        </button>
        <span className="text-[12px] text-text-muted">Cmd+S to save</span>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-[8px] border p-[12px] text-[13px] ${
            testResult.pass
              ? "border-accent-green/30 bg-accent-green/[0.05] text-accent-green"
              : "border-status-error-border bg-status-error-muted text-status-error"
          }`}
        >
          <div className="flex items-center gap-[8px]">
            <span className="font-bold">{testResult.pass ? "PASS" : "FAIL"}</span>
            {testResult.durationMs !== undefined && (
              <span className="text-text-muted">{testResult.durationMs}ms</span>
            )}
          </div>
          {testResult.error && (
            <pre className="mt-[8px] whitespace-pre-wrap font-mono text-[12px] leading-[1.5]">
              {testResult.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
