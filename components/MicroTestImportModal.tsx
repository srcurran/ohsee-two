"use client";

import { useState } from "react";
import type { MicroTest } from "@/lib/types";

interface Props {
  projectId: string;
  onImport: (microTests: MicroTest[]) => void;
  onClose: () => void;
}

const NAV_PATTERNS = /\b(next|submit|continue|get started|sign up|sign in|log in|login|create|register|confirm|finish|done|save|send|go|proceed|start)\b/i;

export interface ParsedStep {
  name: string;
  displayName: string;
  lines: string[];
}

function summarizeStepLines(lines: string[]): string {
  const firstLine = lines[0]?.trim();
  if (firstLine && /^\/\/\s*step\s*\d*\s*:\s*/i.test(firstLine)) {
    return firstLine.replace(/^\/\/\s*step\s*\d*\s*:\s*/i, "").trim();
  }

  const filledFields: string[] = [];
  const clickedItems: string[] = [];
  let gotoPath: string | null = null;

  for (const line of lines) {
    const gotoMatch = line.match(/page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (gotoMatch) {
      try {
        const url = new URL(gotoMatch[1]);
        gotoPath = url.pathname || "/";
      } catch {
        gotoPath = "/";
      }
      continue;
    }

    const fillName = line.match(/name:\s*['"](.*?)['"]/) || line.match(/getByPlaceholder\s*\(\s*['"](.*?)['"]/);
    if (fillName && /\.fill\s*\(/.test(line)) {
      filledFields.push(fillName[1]);
      continue;
    }

    if (line.includes(".click()")) {
      const nameMatch = line.match(/name:\s*['"](.*?)['"]/);
      const textMatch = line.match(/getByText\s*\(\s*['"](.*?)['"]/);
      const hasTextMatch = line.match(/hasText:\s*\/\^(.*?)\$\//);
      const label = nameMatch?.[1] || textMatch?.[1] || hasTextMatch?.[1];
      if (label && !NAV_PATTERNS.test(label)) {
        clickedItems.push(label);
      }
    }
  }

  if (gotoPath) {
    return `Navigate to ${gotoPath}`;
  }

  const parts: string[] = [];
  if (filledFields.length > 0) {
    const shown = filledFields.slice(0, 3);
    parts.push(`Fill ${shown.join(", ")}${filledFields.length > 3 ? "..." : ""}`);
  }
  if (clickedItems.length > 0) {
    const shown = clickedItems.slice(0, 2);
    parts.push(`Select ${shown.join(", ")}${clickedItems.length > 2 ? "..." : ""}`);
  }

  if (parts.length > 0) return parts.join(" & ");

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.includes(".click()")) {
      const nameMatch = line.match(/name:\s*['"](.*?)['"]/);
      const textMatch = line.match(/getByText\s*\(\s*['"](.*?)['"]/);
      const hasTextMatch = line.match(/hasText:\s*\/\^(.*?)\$\//);
      const label = nameMatch?.[1] || textMatch?.[1] || hasTextMatch?.[1];
      if (label) return `Click ${label}`;
    }
  }

  return "Interact with page";
}

function isSplitPoint(line: string): boolean {
  const trimmed = line.trim();
  if (/page\.goto\s*\(/.test(trimmed)) return true;
  if (trimmed.includes(".click()")) {
    const nameMatch = trimmed.match(/name:\s*['"](.*?)['"]/);
    if (nameMatch && NAV_PATTERNS.test(nameMatch[1])) return true;
    const roleMatch = trimmed.match(/getByRole\s*\(\s*['"](\w+)['"]/);
    if (roleMatch && roleMatch[1] === "link") return true;
  }
  return false;
}

function extractActionLines(code: string): string[] {
  return code.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("//")) {
      return /^\/\/\s*step\s*\d*\s*:/i.test(trimmed);
    }
    if (/^import\s/.test(trimmed)) return false;
    if (/^const\s*\{/.test(trimmed)) return false;
    if (/^test\s*\(/.test(trimmed)) return false;
    if (/^\}\s*\)\s*;?\s*$/.test(trimmed)) return false;
    if (/^\s*const\s+(browser|context|page)\s*=/.test(trimmed)) return false;
    if (/^\s*await\s+(browser|context)\.(close|newContext|newPage)/.test(trimmed)) return false;
    if (/^\s*const\s+\w+\s*=\s*await\s+(browser|context)\.(newContext|newPage)/.test(trimmed)) return false;
    return true;
  }).map((l) => l.replace(/^    /, "").replace(/^  /, ""));
}

export function splitIntoSteps(code: string): ParsedStep[] | null {
  const lines = extractActionLines(code);
  if (lines.length === 0) return null;

  const body = lines.join("\n");
  if (!/await\s+(page\.|expect\()/.test(body)) return null;

  const steps: ParsedStep[] = [];
  let currentLines: string[] = [];
  let stepIndex = 1;

  const hasStepComments = lines.some((l) => /^\/\/\s*step\s*\d*\s*:/i.test(l.trim()));

  const flushStep = () => {
    if (currentLines.length === 0) return;

    const label = summarizeStepLines(currentLines);
    const safeName = label.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

    steps.push({
      name: `step${stepIndex}_${safeName}`,
      displayName: label,
      lines: [...currentLines],
    });
    currentLines = [];
    stepIndex++;
  };

  for (const line of lines) {
    const isStepComment = /^\/\/\s*step\s*\d*\s*:/i.test(line.trim());

    if (isStepComment && currentLines.length > 0) {
      flushStep();
    }

    currentLines.push(line);

    if (!hasStepComments && isSplitPoint(line)) {
      flushStep();
    }
  }

  if (currentLines.length > 0) {
    const label = summarizeStepLines(currentLines);
    const safeName = label.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    steps.push({
      name: `step${stepIndex}_${safeName}`,
      displayName: label,
      lines: [...currentLines],
    });
  }

  return steps.length > 0 ? steps : null;
}

export default function MicroTestImportModal({ projectId, onImport, onClose }: Props) {
  const [code, setCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = code.trim() ? splitIntoSteps(code) : null;

  const handleImport = async () => {
    if (!steps) return;
    setImporting(true);
    setError(null);

    const created: MicroTest[] = [];
    for (const step of steps) {
      const res = await fetch(`/api/projects/${projectId}/micro-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: step.name,
          displayName: step.displayName,
          script: step.lines.filter((l) => !l.trim().startsWith("//")).join("\n"),
        }),
      });

      if (res.ok) {
        const mt: MicroTest = await res.json();
        created.push(mt);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Failed to create step "${step.displayName}"`);
        setImporting(false);
        return;
      }
    }

    onImport(created);
    setImporting(false);
  };

  return (
    <div
      className="modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal__panel modal__panel--lg modal__panel--compact">
        <h2 className="modal__title">Import from Playwright</h2>

        <p style={{ marginBottom: "var(--space-3)", fontSize: "var(--font-size-base)", color: "var(--text-muted)" }}>
          Paste output from <code className="code-inline">npx playwright codegen</code> and
          we&apos;ll split it into steps with screenshots at each navigation.
        </p>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`await page.goto('https://example.com');\nawait page.getByRole('textbox', { name: 'Email' }).fill('user@test.com');\nawait page.getByRole('button', { name: 'Submit' }).click();`}
          className="textarea textarea--mono textarea--tinted textarea--no-resize"
          style={{ height: 200, marginBottom: "var(--space-3)" }}
        />

        {steps && (
          <div className="step-preview" style={{ marginBottom: "var(--space-3)" }}>
            <p className="step-preview__title">
              {steps.length} step{steps.length !== 1 ? "s" : ""} detected
            </p>
            <div className="step-preview__list">
              {steps.map((step, i) => (
                <div key={i} className="step-preview__item">
                  <span className="step-preview__index">{i + 1}.</span>
                  <span className="step-preview__label">{step.displayName}</span>
                  <span className="step-preview__meta">({step.lines.length} line{step.lines.length !== 1 ? "s" : ""})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {code.trim() && !steps && (
          <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>
            Could not parse the pasted code. Paste Playwright code containing <code>page.</code> or <code>expect()</code> calls.
          </p>
        )}

        {error && (
          <p className="error-text" style={{ marginBottom: "var(--space-3)" }}>{error}</p>
        )}

        <div className="modal__actions">
          <button onClick={onClose} className="btn btn--ghost">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!steps || importing}
            className="btn btn--primary-sm"
          >
            {importing ? `Importing ${steps?.length ?? 0} steps...` : `Import ${steps?.length ?? 0} step${(steps?.length ?? 0) !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
