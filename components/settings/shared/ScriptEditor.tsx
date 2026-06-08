"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  snippet,
  nextSnippetField,
  prevSnippetField,
  clearSnippet,
} from "@codemirror/autocomplete";
import { basicSetup } from "codemirror";
import CodegenRecorder from "@/components/settings/shared/CodegenRecorder";
import { extractScriptBody, insertSnapshotsAfterNavigation } from "@/lib/script-utils";
import { AI_SCRIPT_GUIDELINES } from "@/lib/ai-script-guidelines";

/** Click-to-insert snippets. `${…}` marks an editable field: inserting selects
 *  the first one so you can type immediately, and Tab jumps to the next.
 *  Credential variables ($EMAIL$ / $PASSWORD$ / $OTP$) live on the credential
 *  fields instead — copy them from there. */
const SNIPPETS: { label: string; code: string }[] = [
  { label: "Go to path", code: "await page.goto('${/path}');" },
  { label: "Snapshot", code: "await ohsee.snapshot('${name}');" },
  { label: "Click role", code: "await page.getByRole('${button}', { name: '${Submit}' }).click();" },
  { label: "Click text", code: "await page.getByText('${Sign in}').click();" },
  { label: "Fill field", code: "await page.getByLabel('${Email}').fill('$EMAIL$');" },
  { label: "Fill password", code: "await page.getByLabel('${Password}').fill('$PASSWORD$');" },
  { label: "Press", code: "await page.keyboard.press('${Enter}');" },
  { label: "Wait for text", code: "await page.getByText('${Welcome}').waitFor();" },
];

/**
 * Always-visible script editor for advanced tests. The script is the source
 * of truth; Record is a bootstrap that writes into it. Emits onChange on every
 * edit (parent debounces persistence). Captured recordings are cleaned (codegen
 * scaffolding stripped) and get an ohsee.snapshot() inserted after each
 * navigation.
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
  const [copied, setCopied] = useState(false);

  /** Copy the paste-ready ohsee script guidelines for handing to an AI agent. */
  const copyGuidelines = async () => {
    try {
      await navigator.clipboard.writeText(AI_SCRIPT_GUIDELINES);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  };

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
          "// Drive the flow with `page`, wait with `.waitFor()`,\n" +
          "// and capture with `await ohsee.snapshot('name')`.\n" +
          "await page.goto('/');\nawait ohsee.snapshot('home');",
        ),
        // Tab/Shift-Tab move between active snippet fields; the commands
        // no-op (return false) when no field is active, so Tab is otherwise
        // unaffected. Highest precedence so it wins over default bindings.
        Prec.highest(
          keymap.of([
            { key: "Tab", run: nextSnippetField, shift: prevSnippetField },
            { key: "Escape", run: clearSnippet },
          ]),
        ),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // Mount once — external writes go through dispatchInsert/replaceAll below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Insert a snippet on its own line and select its first `${…}` field.
   *  Tab then moves between fields. onChange fires via the update listener. */
  const insertSnippet = (template: string) => {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const atLineStart = pos === 0 || view.state.doc.sliceString(pos - 1, pos) === "\n";
    const full = `${atLineStart ? "" : "\n"}${template}\n`;
    snippet(full)(view, null, pos, pos);
    view.focus();
  };

  /** Append a cleaned, snapshot-annotated script body from a recording. */
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

  return (
    <div className="script-editor">
      <div className="row row--sm row--wrap">
        {defaultUrl && (
          <CodegenRecorder
            defaultUrl={defaultUrl}
            label="Record with Playwright"
            className="btn btn--outline btn--sm"
            onScriptCaptured={appendBody}
          />
        )}
        <button
          type="button"
          className="btn btn--text btn--sm script-editor__guidelines"
          onClick={copyGuidelines}
          title="Copy guidelines for writing this script with an AI agent"
        >
          {copied ? "Copied!" : "Copy AI agent script guidelines"}
        </button>
      </div>

      <div ref={editorRef} className="code-editor script-editor__code" />

      <div className="script-editor__reference row row--sm">
        <span className="script-editor__reference-title">Click to insert</span>
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="script-editor__snippet"
            onClick={() => insertSnippet(s.code)}
            title={s.code}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
