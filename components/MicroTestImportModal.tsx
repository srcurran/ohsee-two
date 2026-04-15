"use client";

import { useState } from "react";
import type { MicroTest } from "@/lib/types";

interface Props {
  projectId: string;
  onImport: (microTests: MicroTest[]) => void;
  onClose: () => void;
}

/** Words in button/link text that indicate a navigation boundary */
const NAV_PATTERNS = /\b(next|submit|continue|get started|sign up|sign in|log in|login|create|register|confirm|finish|done|save|send|go|proceed|start)\b/i;

interface ParsedStep {
  name: string;
  displayName: string;
  lines: string[];
}

/**
 * Summarizes a group of Playwright action lines into a human-readable step name.
 * Looks at fields filled, elements clicked, and navigation to build a description.
 */
function summarizeStepLines(lines: string[]): string {
  // Check for a leading comment like "// Step 3: Home Details"
  const firstLine = lines[0]?.trim();
  if (firstLine && /^\/\/\s*step\s*\d*\s*:\s*/i.test(firstLine)) {
    return firstLine.replace(/^\/\/\s*step\s*\d*\s*:\s*/i, "").trim();
  }

  const filledFields: string[] = [];
  const clickedItems: string[] = [];
  let gotoPath: string | null = null;

  for (const line of lines) {
    // page.goto('...')
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

    // .fill() — extract field name from name attribute, placeholder, or label
    const fillName = line.match(/name:\s*['"](.*?)['"]/) || line.match(/getByPlaceholder\s*\(\s*['"](.*?)['"]/);
    if (fillName && /\.fill\s*\(/.test(line)) {
      filledFields.push(fillName[1]);
      continue;
    }

    // .click() on non-navigation elements (navigation clicks are split points, handled separately)
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

  // Build a descriptive name from what happened
  if (gotoPath) {
    return `Navigate to ${gotoPath}`;
  }

  const parts: string[] = [];
  if (filledFields.length > 0) {
    // Limit to 3 fields to keep it readable
    const shown = filledFields.slice(0, 3);
    parts.push(`Fill ${shown.join(", ")}${filledFields.length > 3 ? "..." : ""}`);
  }
  if (clickedItems.length > 0) {
    const shown = clickedItems.slice(0, 2);
    parts.push(`Select ${shown.join(", ")}${clickedItems.length > 2 ? "..." : ""}`);
  }

  if (parts.length > 0) return parts.join(" & ");

  // Fallback: describe the last click action (even navigation ones)
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

/**
 * Determines if a line is a "split point" — a natural boundary after which
 * a screenshot should be taken (navigation, form submission, page load).
 */
function isSplitPoint(line: string): boolean {
  const trimmed = line.trim();

  // page.goto() — always a split point
  if (/page\.goto\s*\(/.test(trimmed)) return true;

  // .click() on a button or link whose name matches navigation patterns
  if (trimmed.includes(".click()")) {
    const nameMatch = trimmed.match(/name:\s*['"](.*?)['"]/);
    if (nameMatch && NAV_PATTERNS.test(nameMatch[1])) return true;

    // getByRole('link', ...).click() — links are usually navigation
    const roleMatch = trimmed.match(/getByRole\s*\(\s*['"](\w+)['"]/);
    if (roleMatch && roleMatch[1] === "link") return true;
  }

  return false;
}

/**
 * Strips boilerplate from codegen output, returns clean action lines.
 */
function extractActionLines(code: string): string[] {
  return code.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Keep step-name comments (e.g. "// Step 1: Landing"), strip others
    if (trimmed.startsWith("//")) {
      return /^\/\/\s*step\s*\d*\s*:/i.test(trimmed);
    }
    // Strip imports, test wrapper, browser/context setup
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

/**
 * Splits raw Playwright code into logical step groups.
 * Each group captures a screenshot.
 */
function splitIntoSteps(code: string): ParsedStep[] | null {
  const lines = extractActionLines(code);
  if (lines.length === 0) return null;

  // Check that this is actually Playwright code
  const body = lines.join("\n");
  if (!/await\s+(page\.|expect\()/.test(body)) return null;

  const steps: ParsedStep[] = [];
  let currentLines: string[] = [];
  let stepIndex = 1;

  // Detect whether the code has explicit step comments — if so, use only those as split points
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

    // A step-name comment starts a new chunk
    if (isStepComment && currentLines.length > 0) {
      flushStep();
    }

    currentLines.push(line);

    // Only auto-split on navigation clicks when there are no explicit step comments
    if (!hasStepComments && isSplitPoint(line)) {
      flushStep();
    }
  }

  // Remaining lines become the final step
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[600px] rounded-[12px] bg-surface-content p-[24px]">
        <h2 className="mb-[16px] text-[20px] font-bold text-foreground">
          Import from Playwright
        </h2>

        <p className="mb-[12px] text-[14px] text-text-muted">
          Paste output from <code className="rounded bg-surface-tertiary px-[4px] py-[1px] font-mono text-[12px]">npx playwright codegen</code> and
          we&apos;ll split it into steps with screenshots at each navigation.
        </p>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`await page.goto('https://example.com');\nawait page.getByRole('textbox', { name: 'Email' }).fill('user@test.com');\nawait page.getByRole('button', { name: 'Submit' }).click();`}
          className="mb-[12px] h-[200px] w-full resize-none rounded-[8px] border border-border-primary bg-surface-tertiary p-[12px] font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-text-muted focus:border-foreground"
        />

        {/* Steps preview */}
        {steps && (
          <div className="mb-[12px] rounded-[8px] border border-accent-green/30 bg-accent-green/[0.05] p-[12px]">
            <p className="mb-[8px] text-[13px] font-bold text-foreground">
              {steps.length} step{steps.length !== 1 ? "s" : ""} detected
            </p>
            <div className="flex flex-col gap-[4px]">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-[8px] text-[13px]">
                  <span className="shrink-0 w-[20px] text-text-muted text-right">{i + 1}.</span>
                  <span className="text-foreground">{step.displayName}</span>
                  <span className="text-text-muted">({step.lines.length} line{step.lines.length !== 1 ? "s" : ""})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {code.trim() && !steps && (
          <p className="mb-[12px] text-[13px] text-status-error">
            Could not parse the pasted code. Paste Playwright code containing <code>page.</code> or <code>expect()</code> calls.
          </p>
        )}

        {error && (
          <p className="mb-[12px] text-[13px] text-status-error">{error}</p>
        )}

        <div className="flex justify-end gap-[12px]">
          <button
            onClick={onClose}
            className="rounded-[8px] px-[16px] py-[8px] text-[14px] text-text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!steps || importing}
            className="rounded-[8px] bg-foreground px-[20px] py-[8px] text-[14px] font-bold text-surface-content transition-all hover:shadow-elevation-md hover:-translate-y-[1px] disabled:opacity-50"
          >
            {importing ? `Importing ${steps?.length ?? 0} steps...` : `Import ${steps?.length ?? 0} step${(steps?.length ?? 0) !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
