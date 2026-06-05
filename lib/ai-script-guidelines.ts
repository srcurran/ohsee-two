/**
 * Paste-ready guidelines for an AI agent writing an ohsee advanced-test
 * Playwright script. Surfaced in the UI via the "Copy AI agent script
 * guidelines" button in ScriptEditor. Keep in sync with
 * docs/authoring-ohsee-tests.md (this is the condensed, script-only subset).
 */
export const AI_SCRIPT_GUIDELINES = `# ohsee — Playwright script guidelines

You are writing the script for an **ohsee** visual-regression test. ohsee
screenshots a prod URL and a dev/staging URL across breakpoints and diffs them.
Your script drives the flow and marks where the screenshots are taken.

## The contract
Your script is a **function body**, not a standalone program. Three arguments are
injected for you:
- \`page\`   — a Playwright Page, already created (fresh context per breakpoint).
- \`expect\` — Playwright's \`expect\`.
- \`ohsee\`  — \`{ snapshot(name?) }\`; call \`await ohsee.snapshot('label')\` to capture.

Do NOT write: require/import, chromium.launch, browser/context/newPage, an
\`(async () => { ... })()\` wrapper, or browser.close(). Just the interactions.

## Snapshots
- \`await ohsee.snapshot('name')\` captures the current page, full-page. The name
  labels the screen — keep it short and unique within the test.
- Screens pair across prod/dev by **call order**. The same sequence of snapshot()
  calls must run in BOTH environments and at EVERY breakpoint — never branch the
  number or order of snapshots on environment, viewport, or live data.
- Total budget is 120s per run; keep the flow tight.

## Navigation
- \`await page.goto('/path')\` — use a path; ohsee rewrites the origin to the
  current environment (prod or dev) automatically. Prefer paths over absolute URLs.

## Don't re-stabilize — ohsee already does it
Before every capture ohsee disables animations/transitions, dismisses
cookie/consent popups, expands inner scroll containers, auto-scrolls to trigger
lazy-loading, waits for fonts, and settles. So do NOT add animation-freezing CSS,
manual scrolling, or \`waitForTimeout\` padding. Instead, assert the state you want
before snapshotting:

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await ohsee.snapshot('dashboard');

## Auth (only if the screens need a login)
Either the test already starts signed in (an auth profile seeds the session — then
just navigate, don't log in again), OR log in inside the script using template
variables that ohsee fills from its secret vault at run time:
- \`$EMAIL$\`, \`$PASSWORD$\`, \`$OTP$\` (OTP is a fresh TOTP code or a static code).

Use them inside single quotes, e.g. \`await page.getByLabel('Password').fill('$PASSWORD$')\`.
NEVER put a real email, password, or secret in the script — only these placeholders.

## Conventions
- Deterministic & idempotent: identical screens on every run; never depend on data
  a previous run created.
- Resilient selectors: prefer getByRole / getByLabel / getByText / getByTestId over
  CSS or nth-child.
- One concern per snapshot; assert its content is visible first.
- Live timestamps, random/personalized, and A/B content will diff — avoid
  snapshotting volatile regions in isolation; target stable fixture data.

## Example
    await page.goto('/pricing');
    await ohsee.snapshot('pricing');

    await page.getByRole('button', { name: 'Compare plans' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await ohsee.snapshot('compare-modal');

## Before you finish
- Body only — no require/launch/context/IIFE/close.
- Same snapshot() sequence in every environment and at every breakpoint.
- Every snapshot is preceded by an assertion that its content is present.
- No real secrets — only $EMAIL$ / $PASSWORD$ / $OTP$.
- Role/label/text selectors, not brittle CSS.
- No manual animation-freezing, scrolling, or waitForTimeout padding.
`;
