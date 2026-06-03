"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import CodegenRecorder from "@/components/settings/CodegenRecorder";
import { extractScriptBody, insertSnapshotsAfterNavigation } from "@/lib/script-utils";

/** Click-to-insert snippets shown in the quick reference. Statement snippets
 *  drop in on their own line; `inline` ones insert at the cursor. The
 *  credential variables ($EMAIL$ / $PASSWORD$ / $OTP$) live on the credential
 *  fields instead — copy them from there. */
const SNIPPETS: { label: string; code: string; inline?: boolean }[] = [
  { label: "Go to path", code: "await page.goto('/path');" },
  { label: "Snapshot", code: "await ohsee.snapshot('name');" },
  { label: "Click role", code: "await page.getByRole('button', { name: 'Submit' }).click();" },
  { label: "Click text", code: "await page.getByText('Sign in').click();" },
  { label: "Fill field", code: "await page.getByLabel('Email').fill('$EMAIL$');" },
  { label: "Fill password", code: "await page.getByLabel('Password').fill('$PASSWORD$');" },
  { label: "Press", code: "await page.keyboard.press('Enter');" },
  { label: "Wait for text", code: "await expect(page.getByText('Welcome')).toBeVisible();" },
];

/**
 * Always-visible script editor for advanced tests. The script is the source
 * of truth; Record and Upload are bootstraps that write into it. Emits
 * onChange on every edit (parent debounces persistence). Captured recordings
 * and uploads are cleaned (codegen scaffolding stripped) and get an
 * ohsee.snapshot() inserted after each navigation.
 */
export default function ScriptEditor({
  value,
  onChange,
  defaultUrl,
}: {
  value: string;
  onChange: (script: string) => void;
  /** Project URL for the Playwright codegen recorder (Electron only). */
  defaultUrl?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Stable onChange ref so the editor extension always calls the latest.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) onChangeRef.current(v.state.doc.toString());
        }),
        cmPlaceholder(
          "// Drive the flow with `page`, assert with `expect`,\n" +
          "// and capture with `await ohsee.snapshot('name')`.\n" +
          "await page.goto('/');\nawait ohsee.snapshot('home');",
        ),
        keymap.of([]),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // Mount once — external writes go through dispatchInsert/replaceAll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Insert a reference snippet. Statement snippets land on their own line;
   *  `inline` ones (credential variables) drop in at the cursor. */
  const insertAtCursor = (text: string, inline = false) => {
    const view = viewRef.current;
    if (!view) return;
    if (inline) {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    } else {
      const pos = view.state.selection.main.head;
      const pad = pos > 0 && view.state.doc.sliceString(pos - 1, pos) !== "\n" ? "\n" : "";
      view.dispatch({
        changes: { from: pos, insert: `${pad}${text}\n` },
        selection: { anchor: pos + pad.length + text.length + 1 },
      });
    }
    view.focus();
    onChangeRef.current(view.state.doc.toString());
  };

  /** Append a cleaned, snapshot-annotated script body (record / upload). */
  const appendBody = (raw: string) => {
    const view = viewRef.current;
    if (!view) return;
    const body = insertSnapshotsAfterNavigation(extractScriptBody(raw));
    if (!body) return;
    const cur = view.state.doc.toString();
    const next = cur.trim() ? `${cur.trimEnd()}\n\n${body}\n` : `${body}\n`;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    onChangeRef.current(next);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => appendBody(String(reader.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="script-editor">
      <div className="script-editor__toolbar">
        {defaultUrl && (
          <CodegenRecorder
            defaultUrl={defaultUrl}
            label="Record with Playwright"
            className="btn btn--outline btn--sm"
            onScriptCaptured={appendBody}
          />
        )}
        <label className="btn btn--outline btn--sm">
          Upload script
          <input
            type="file"
            accept=".js,.ts,.txt,text/plain,text/javascript"
            onChange={onUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      <div ref={editorRef} className="code-editor script-editor__code" />

      <div className="script-editor__reference">
        <span className="script-editor__reference-title">Click to insert</span>
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="script-editor__snippet"
            onClick={() => insertAtCursor(s.code, s.inline)}
            title={s.code}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
