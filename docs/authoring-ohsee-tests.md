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

## 2. You're writing an advanced (script) test

An AI-authored ohsee test is an **advanced** test: a single Playwright **script**
that drives the flow and calls `await ohsee.snapshot('name')` to capture each
screen. Set `testType: "advanced"` and put your code in the `script` field; the
rest of this guide is about that script.

(ohsee also has a `"simple"` type — a hand-entered list of URL paths with no
code — but producing a script *is* the advanced type, so you never need to choose.
Ignore the legacy `flows` / `compositions` / `type: "microtest"` shapes entirely.)

---

## 3. The advanced-script contract (read carefully)

The script you write is a **function body**, not a standalone program. The
runner injects three arguments:

| Arg      | What it is |
|----------|------------|
| `page`   | a Playwright `Page`, already created (fresh context per breakpoint) |
| `ohsee`  | `{ snapshot(name?: string): Promise<void> }` — the capture hook |

> ⚠️ **Do not use `expect(...)`.** ohsee bundles `playwright` but **not**
> `@playwright/test`, so `expect` is `undefined` at run time and the first
> `expect(...)` call throws — taking down the whole run before any snapshot. Wait
> for content with methods on `page`/locators instead: `locator.waitFor()`,
> `page.waitForSelector(...)`, `page.waitForLoadState(...)`, `page.waitForURL(...)`.

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
await page.getByRole('dialog').waitFor();
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
to "let things load". Instead, wait for the meaningful state:

```js
await page.goto('/dashboard');
await page.getByRole('heading', { name: 'Overview' }).waitFor();
await ohsee.snapshot('dashboard');
```

Prefer `locator.waitFor()`, `page.waitForSelector(...)`, or
`page.waitForLoadState('networkidle')` over `page.waitForTimeout(...)`. **Capture
the landing page right after `goto`, before any wait** — a wait that times out
aborts the run, and you want at least that first screen (and a wait can't fail
before you've seen where you landed).

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
await page.waitForURL(/\/app/);
```

**Never** put a real email, password, or secret in a script — only the `$…$`
variables. Secrets live exclusively in the vault.

### Login-script contract (AuthProfile.loginScript)
Same shape as an advanced script **except it gets only `page` (no `ohsee`)** — it
captures a session, not screenshots. Drive the sign-in using
`$EMAIL$/$PASSWORD$/$OTP$`, and **end once authenticated** (wait for a reliable
signed-in signal via `page.waitForURL(...)` or `locator.waitFor()`, e.g. the
dashboard URL or a user-menu element) so the captured `storageState` is valid.

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
  present and settled (`waitFor` it). One concern per snapshot; clear unique names.
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
| `testType`       | `"advanced"`                 | Always `"advanced"` for a script. |
| `script`         | string                       | The function body (§3) — your test. |
| `authProfileId`  | string                       | Start signed-in via a profile (§5A). |
| `credentials`    | `{ vaultEntryId }`           | Per-test vault identity for `$…$` vars (§5B). |
| `breakpoints`    | `number[]`                   | Optional; defaults if omitted (§6). |
| `variants`       | `TestVariant[]`              | Optional theme captures (§6). |
| `fastMode`       | boolean                      | Captures more pages in parallel — faster but heavier; may trip rate limits. Leave off unless asked. |

Don't set: `id`, `createdAt`, `lastRunAt`, `draft`, `archived` — the app manages
those. Don't author `steps`, `flows`, `compositions`, or `microTests` — legacy.

---

## 9. Pre-flight checklist

Before finalizing a test, verify:

- [ ] Script is a **body only** — no require/launch/context/IIFE/close.
- [ ] **No `expect(...)`** — wait with `locator.waitFor()` / `page.waitForSelector`.
- [ ] First snapshot is right after `goto`, not gated behind a wait that can fail.
- [ ] Same `ohsee.snapshot()` sequence runs in every environment/breakpoint/variant.
- [ ] No real secrets in any script — only `$EMAIL$ / $PASSWORD$ / $OTP$`.
- [ ] Auth handled once (profile **or** per-test creds), not duplicated.
- [ ] Selectors are role/label/text-based, not brittle CSS.
- [ ] No manual animation-freezing, scrolling, or `waitForTimeout` padding.
- [ ] Snapshot names are short, unique, and descriptive.
