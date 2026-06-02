/**
 * Helpers for turning recorded/pasted Playwright into the "body" our runner
 * executes. Playwright codegen emits a standalone program — a `require`, an
 * `(async () => { … })()` IIFE, and browser/context/page setup. Our advanced
 * scripts are function bodies that run against an injected `page`/`expect`/
 * `ohsee`, so we strip the scaffolding and keep only the interactions.
 */

/** Extract the usable interaction body from a recorded/standalone script. */
export function extractScriptBody(raw: string): string {
  let s = raw ?? "";

  // Unwrap an `(async () => { … })()` IIFE — keep only its inner body so the
  // surrounding require/launch scaffolding falls away.
  const iife = s.match(/\(async\s*\(\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)\s*;?\s*$/);
  if (iife) s = iife[1];

  const out: string[] = [];
  let inLaunchOpts = false;

  for (const line of s.split("\n")) {
    const t = line.trim();
    if (!t) { out.push(line); continue; }

    // playwright require/import
    if (/=\s*require\(\s*['"]playwright['"]\s*\)/.test(t)) continue;
    if (/^import\s.*playwright/.test(t)) continue;

    // `const browser = await chromium.launch({` — possibly multiline opts
    if (/^const\s+browser\s*=/.test(t)) {
      inLaunchOpts = !/\)\s*;?\s*$/.test(t);
      continue;
    }
    if (inLaunchOpts) {
      if (/\}\s*\)\s*;?\s*$/.test(t) || /^\)\s*;?$/.test(t)) inLaunchOpts = false;
      continue;
    }

    // context/page setup + teardown
    if (/^const\s+context\s*=/.test(t)) continue;
    if (/^const\s+page\s*=/.test(t)) continue;
    if (/^await\s+(browser|context)\.close\(\s*\)/.test(t)) continue;

    // stray IIFE / launch-option fragments left by sloppy recordings
    if (/^\(async\s*\(\)\s*=>\s*\{$/.test(t)) continue;
    if (/^\}\s*\)\s*\(\s*\)\s*;?$/.test(t)) continue;
    if (/^headless\s*:/.test(t)) continue;

    out.push(line);
  }

  return out.join("\n").trim();
}

/**
 * Insert `await ohsee.snapshot()` after each top-level `page.goto(...)` so a
 * recording produces a complete script with a capture per page load. Only
 * adds a snapshot when the next non-blank line isn't already one, to stay
 * idempotent and avoid doubling up.
 */
export function insertSnapshotsAfterNavigation(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    if (!/\bpage\s*\.\s*goto\s*\(/.test(line)) continue;

    // Peek at the next meaningful line; skip if it's already a snapshot.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && /ohsee\s*\.\s*snapshot\s*\(/.test(lines[j])) continue;

    const indent = line.match(/^\s*/)?.[0] ?? "";
    out.push(`${indent}await ohsee.snapshot();`);
  }

  return out.join("\n");
}
