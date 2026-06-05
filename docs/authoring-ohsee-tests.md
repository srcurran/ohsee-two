# Authoring ohsee tests — guide for an AI agent

You are helping author **ohsee tests**. ohsee is a visual-regression tool: it
captures screenshots of a **prod** URL and a **dev/staging** URL across several
breakpoints, aligns them, and diffs them. A "test" defines *which screens to
capture and how to reach them*. Your job is to produce correct, deterministic
test definitions and Playwright scripts that fit ohsee's runner exactly.

Read this whole file before writing a test. The rules here are not generic
Playwright advice — they are the actual contract ohsee's runner enforces.

---

## 1. The mental model

- A **Project** (a "site") has a `prodUrl` and a `devUrl`, and a list of
  **tests** (`SiteTest`).
- A **test** produces one or more **screens** (screenshots). The runner runs the
  test once against prod and once against dev, **per breakpoint**, then pairs the
  screens up and diffs each pair.
- **Pairing is by order.** Screen #2 from prod is compared against screen #2 from
  dev. So the test must produce the **same screens in the same order** in both
  environments. Never make the number or order of screens depend on the
  environment, the viewport, or live data.

---

## 2. Pick a test type

A test is **one** of two types. Do not mix them.

### Simple (path) test — `testType: "simple"`
A flat list of URL paths. Each path is loaded and screenshotted. Best for
marketing/content sites with no required interaction or auth.

```jsonc
{
  "name": "Marketing pages",
  "testType": "simple",
  "steps": [
    { "id": "s1", "type": "url", "url": "/",         "captureScreenshot": true },
    { "id": "s2", "type": "url", "url": "/pricing",  "captureScreenshot": true },
    { "id": "s3", "type": "url", "url": "/about",    "captureScreenshot": true }
  ]
}
```

- `url` may be a **path** (`/pricing`) — resolved against the project's prod/dev
  base at run time — or an absolute URL (the origin is rewritten to the current
  environment automatically). **Prefer paths.**
- `captureScreenshot` defaults to `true`. Set it `false` only for a step used
  purely to navigate/set up with no screenshot.

### Advanced (Playwright) test — `testType: "advanced"`
A single Playwright **script** that drives a flow and calls
`await ohsee.snapshot('name')` wherever a screen should be captured. Use this
when reaching the screen needs interaction, multiple steps, or authentication.

There is a one-way **"Convert to Playwright"** upgrade (simple → advanced, never
back). A test is path-based **or** script-based — not both. (`steps[]` entries of
`type: "microtest"`, plus `compositions`/`flows`/`microTests`, are **legacy**
shapes kept for migration — do not author new tests with them.)

---

## 3. The advanced-script contract (read carefully)

The script you write is a **function body**, not a standalone program. The
runner injects three arguments:

| Arg      | What it is |
|----------|------------|
| `page`   | a Playwright `Page`, already created (fresh context per breakpoint) |
| `expect` | Playwright's `expect` from `@playwright/test` |
| `ohsee`  | `{ snapshot(name?: string): Promise<void> }` — the capture hook |

**Do NOT include** any of this (the runner provides it and codegen output is
auto-stripped of it, but author clean):
- `require(...)` / `import ...` of playwright
- `chromium.launch(...)`, `browser.newContext(...)`, `context.newPage(...)`
- an `(async () => { ... })()` wrapper
- `browser.close()` / `context.close()`

**Just write the interactions.** Example:

```js
// Advanced test script — body only.
await page.goto('/pricing');
await ohsee.snapshot('pricing');

await page.getByRole('button', { name: 'Compare plans' }).click();
await expect(page.getByRole('dialog')).toBeVisible();
await ohsee.snapshot('compare-modal');
```

Rules:
- **`ohsee.snapshot('name')`** captures the current page (full page). The `name`
  becomes the screen's label and part of its filename — make it short and unique
  within the test. Snapshots pair across prod/dev by **call order**, so the same
  sequence of `snapshot()` calls must execute in both environments and at every
  breakpoint. Never branch the snapshot count on env/viewport/data.
- **`page.goto('/path')`** — use a path or absolute URL; the origin is rewritten
  to the current environment for you. Prefer paths.
- The script has a **120 s** total budget. Keep flows tight.
- Snapshots are `fullPage: true`. There is no per-snapshot clipping option.

---

## 4. What the runner stabilizes for you (don't redo it)

Immediately before every capture, ohsee already:
- disables all CSS `animation` / `transition` and forces `scroll-behavior: auto`,
- dismisses common cookie/consent/popup overlays,
- expands inner vertical scroll containers so full content is in the page,
- auto-scrolls top-to-bottom to trigger lazy-loaded content, then resets,
- waits for `document.fonts.ready`, then settles briefly.

So **do not** add animation-freezing CSS, manual scrolling, or arbitrary sleeps
to "let things load". Instead, assert the meaningful state:

```js
await page.goto('/dashboard');
await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
await ohsee.snapshot('dashboard');
```

Prefer `expect(...).toBeVisible()`, `page.waitForSelector(...)`, or
`page.waitForLoadState('networkidle')` over `page.waitForTimeout(...)`.

---

## 5. Authentication

If screens are behind a login, choose **one** approach.

### A. Auth profile (preferred for advanced tests)
Set the test's `authProfileId` to a site-level **AuthProfile**. Its `loginScript`
is run once per environment to produce a cached `storageState`; every test using
the profile **starts already signed in**. With a profile, **do not** log in again
inside the test script — just navigate to the authenticated screens.

### B. Per-test credentials in the script
Set `credentials.vaultEntryId` and perform the login inside the script (or login
script) using template variables. The runner replaces them with real values from
the Electron Keychain **vault** at run time:

| Variable     | Becomes |
|--------------|---------|
| `$EMAIL$`    | the vault entry's email |
| `$PASSWORD$` | the vault entry's password |
| `$OTP$`      | a fresh TOTP code (from the seed) or the stored static code |

Use them **inside single-quoted strings**, verbatim:

```js
await page.goto('/login');
await page.getByLabel('Email').fill('$EMAIL$');
await page.getByLabel('Password').fill('$PASSWORD$');
await page.getByRole('button', { name: 'Sign in' }).click();
// If the account uses 2FA:
await page.getByLabel('One-time code').fill('$OTP$');
await page.getByRole('button', { name: 'Verify' }).click();
await expect(page).toHaveURL(/\/app/);
```

**Never** put a real email, password, or secret in a script — only the `$…$`
variables. Secrets live exclusively in the vault.

### Login-script contract (AuthProfile.loginScript)
Same shape as an advanced script **except it receives only `page` and `expect`
(no `ohsee`)** — it captures a session, not screenshots. Drive the sign-in using
`$EMAIL$/$PASSWORD$/$OTP$`, and **end once authenticated** (wait for a reliable
signed-in signal, e.g. the dashboard URL or a user-menu element) so the captured
`storageState` is valid.

---

## 6. Breakpoints & variants

- **`breakpoints`** — `number[]` of pixel widths. Omit to use the project/global
  defaults. The built-in set is `1920, 1440, 1024, 768, 440, 375`. Only narrow
  the list if a test is meaningless at some widths.
- **`variants`** — capture the same screens under theme variants. Built-ins:
  `light` and `dark` (each sets a `theme` localStorage value and toggles a
  `.dark` class on `<html>` before load). Use these for sites with a
  light/dark theme. Every variant captures the **same** screen sequence.

---

## 7. Conventions for *good* visual-regression tests

- **Deterministic & idempotent.** A test must produce identical screens on
  repeated runs and not depend on mutations from a previous run. Avoid flows that
  create/delete data unless they clean up or target a stable fixture.
- **Same screens in both envs.** (Restating because it's the #1 failure mode.)
  Identical `snapshot()` order/count for prod and dev, at every breakpoint and
  variant.
- **Resilient selectors.** Prefer `getByRole`, `getByLabel`, `getByText`,
  `getByTestId` over CSS/`nth-child`/deep structural selectors that break on
  redesign.
- **Snapshot stable state.** Capture only after the content you care about is
  present and settled (assert it). One concern per snapshot; clear unique names.
- **Expect noisy content.** Live timestamps, "X minutes ago", random/personalized
  or A/B content, and animated counters will diff. ohsee has a semantic-diff
  layer and an accept-changes flow, but prefer stable inputs: target fixture
  data, pin dates where the app allows, or avoid snapshotting the volatile region
  in isolation.
- **Keep flows short.** Fewer, meaningful screens beat many redundant ones. Don't
  snapshot the same URL twice.

---

## 8. SiteTest field reference (the fields you set)

| Field            | Type                         | Notes |
|------------------|------------------------------|-------|
| `name`           | string                       | Human label, shown in the sidebar. |
| `testType`       | `"simple"` \| `"advanced"`   | Picks the shape below. |
| `steps`          | `TestStep[]`                 | **Simple:** `{ type: "url", url, captureScreenshot? }` entries. |
| `script`         | string                       | **Advanced:** the function body (§3). |
| `authProfileId`  | string                       | Advanced: start signed-in via a profile (§5A). |
| `credentials`    | `{ vaultEntryId }`           | Per-test vault identity for `$…$` vars (§5B). |
| `breakpoints`    | `number[]`                   | Optional; defaults if omitted (§6). |
| `variants`       | `TestVariant[]`              | Optional theme captures (§6). |
| `fastMode`       | boolean                      | Captures more pages in parallel — faster but heavier; may trip rate limits. Leave off unless asked. |

Don't set: `id`, `createdAt`, `lastRunAt`, `draft`, `archived` — the app manages
those. Don't author `flows`, `compositions`, `microTests`, or `type: "microtest"`
steps — legacy.

---

## 9. Pre-flight checklist

Before finalizing a test, verify:

- [ ] Exactly one type: simple **or** advanced (no mixing).
- [ ] Advanced script is a **body only** — no require/launch/context/IIFE/close.
- [ ] Same `ohsee.snapshot()` sequence runs in every environment/breakpoint/variant.
- [ ] Every snapshot is preceded by an assertion that its content is present.
- [ ] No real secrets in any script — only `$EMAIL$ / $PASSWORD$ / $OTP$`.
- [ ] Auth handled once (profile **or** per-test creds), not duplicated.
- [ ] Selectors are role/label/text-based, not brittle CSS.
- [ ] No manual animation-freezing, scrolling, or `waitForTimeout` padding.
- [ ] Snapshot names are short, unique, and descriptive.
