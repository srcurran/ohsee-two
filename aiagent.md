# AI Agent Working Memory

The conventions an agent should follow when working on this codebase.
Updated 2026-05-13 after the design-system / component-organization
refactor (commits `2469454` → `84ea74c`).

---

## Workflow

- Commit on discrete, logical pieces of work — not every edit, but every
  cohesive change ("update palette", "split SCSS file", "extract hook").
- Push to `main` after ~10–30 minutes of accumulated work. The user
  reviews visually in the running app + the Figma swatch sheet.
- Before pushing: `gh auth switch --user srcurran`. After pushing:
  switch back to `srcurran-foyer`.
- The dev stack runs from this worktree on port 4000 via
  `npm run electron:dev` (electronmon + Next dev + Electron). HMR
  handles renderer changes; the main process auto-restarts on tsc
  output changes via electronmon.

---

## Tech Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- **SCSS** (not Tailwind) — design system in `app/styles/`
- Playwright for screenshots, sharp + pixelmatch + pngjs for diffing
- JSON files + filesystem for data storage
- Font: Poppins (400, 700)

---

## Design Tokens

### Two-tier system

```
Level 1 — Primitives           app/styles/tokens/_primitives.scss
Level 2 — Component tokens     app/styles/tokens/_semantic.scss
```

**Component SCSS reads only from Level 2 component tokens.** Never
reference raw `--neutral-*` or `--action-*` primitives from a component
SCSS — go through a component token that aliases the primitive.

Naming: `--{component}-{element}-{property}[-state]`
e.g. `--sidebar-item-background-hover`, `--btn-primary-color`.

### Final palette (consolidated)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--neutral-dark-{900,800,700,500,400,200,150,100}` | black at 100/90/70/50/40/20/15/10% | white at 100/92/82/65/55/28/22/16% | Greyscale. Only neutral content tokens. |
| `--neutral-light-100` | `#ffffff` | `#1e1e1e` | Pure surface (cards, modals, panels) |
| `--neutral-light-200` | `#f5f4f0` | `#2a2a2a` | Single tint (page bg, hovers, accents) — slight beige in light |
| `--action-500` | `#ffe030` | same | Brand accent + primary CTA |
| `--status-success-500` | `#09c667` | `#2dd97d` | Pass/success |
| `--status-error-500` | `#ef4444` | `#e06060` | Error / warning / cancel / severity / danger borders (one red) |
| `--status-error-800` | `#b91c1c` | `#e88a8a` | Darker red — hover and high-contrast text |
| `--status-running-400` | `#4095fe` | `#5aa6ff` | In-flight run blue |
| `--on-action / -success` | `#1a1a1a` | same | Black text on yellow / green |
| `--on-error / -running` | `#ffffff` | same | White text on red / blue |

**Text-on-color rule:** yellow + green get black text, red + blue get
white. Captured by the `--on-*` tokens — component tokens for
foregrounds should reference these, not literal hex.

### Computed primitives (live in `_semantic.scss` :root)

Stay as `color-mix(in srgb, var(--foreground) X%, transparent)`:
- `--text-faint` (40%), `--text-dim` (60%), `--text-subdued` (70%)
- `--surface-hover` (10%), `--surface-hover-soft` (5%), `--surface-hover-bare` (3%)

These flip automatically in dark mode because `--foreground` flips.
The fade-gradient pair (`--surface-fade-from/-via`) is overridden
explicitly in `.dark` for the dark bg color.

### Dark mode

The `.dark { … }` block in `_semantic.scss` overrides primitives.
Component tokens that point at primitives flip for free — no need to
declare component tokens twice.

---

## SCSS Organization

### 1:1 file-to-class parity

Every partial in `app/styles/components/` owns a single component or
styling primitive. There are ~60 partials; finding "where is the CSS
for `.foo`" is `_foo.scss` (with rare exceptions for tightly-paired
classes like `.page-detail-panel + .page-detail-scrim`).

Imports are listed in `app/globals.scss` grouped by role (form
primitives → containers → tabs → shell → overlays → editors →
report → page-detail → misc).

### Structure mirrors the JSX DOM

Selectors nest as descendants, matching the rendered hierarchy:

```scss
.sidebar {
  /* <aside> base + modifiers */
  &--collapsed { … }

  .sidebar__nav {           /* the <nav> inside */
    .sidebar__group {       /* groups inside nav */
      .sidebar__tests {
        .sidebar__test {
          &:hover { … }
          .sidebar__test-label { … }
        }
      }
    }
  }
}
```

NOT flat BEM:

```scss
.sidebar { … }
.sidebar__nav { … }
.sidebar__group { … }
.sidebar__test { … }
```

Modifiers (`&--x`), pseudo (`&:hover`), attribute selectors
(`&[data-foo]`) stay ampersand-prefixed inside the owning block.
Cross-element pseudo like `.foo__row:hover .foo__icon` becomes
`&:hover .foo__icon` inside `.foo__row { … }`.

### `@mixin interactive`

Defined in `app/styles/mixins/_interactive.scss`. Applied to every
clickable surface (`.btn`, `.icon-btn`, `.run-pill`, etc.).

- hover → `filter: brightness(0.94)`
- active → `brightness(0.85)` + `transform: translateY(1px)`
- disabled → 50% opacity, no pointer events

Filled variants (primary, cancel, danger) don't need explicit hover
backgrounds — brightness scales proportionally. Transparent variants
(outline, ghost, secondary, danger-outline) still set their own
hover bg since brightness has nothing to dim on transparent.

### Spacing & layout: the wrapper owns it

Lay containers out **top-down with flexbox** and keep spacing in **one
place — the wrapping element** — never repeated on its children.

- A container that stacks children is `display: flex; flex-direction:
  column` with a `gap` for the space *between* them. Don't fake that gap
  with `margin-bottom` on each child, or with a trailing/leading padding.
- The wrapper owns the inset `padding`. Children do **not** re-declare the
  same `padding-inline`. The classic smell is `__header` and `__body` both
  setting `padding: … var(--space-7) …` — hoist it to the parent.
- A child only owns spacing that is genuinely its own — e.g. the gap
  *between rows inside* the body — not the inset it shares with its siblings.

Canonical example: `.project-settings-overlay__panel` sets `padding` +
`gap`; `__header` and `__body` set neither (see
`_project-settings-overlay.scss`). Build new layouts this way, and prefer
fixing existing ones toward it when you touch them.

### Layout utilities — reach for these before authoring a flex block

We keep a **small, curated** set of layout classes in
`app/styles/utilities/_layout.scss`. When a wrapper's *only* job is to lay
children out — `display: flex` + a `gap` — use a utility in the JSX instead
of minting a BEM block. This is a deliberate hybrid, **not** Tailwind: the set
is intentionally tight, and anything beyond layout still belongs in SCSS.

- **`.stack`** — flex column. **`.row`** — flex row, `align-items: center`.
  Both take a shared gap scale: `--xs --sm --md --lg --xl --2xl --3xl`
  (→ `--space-1,2,3,4,6,8,10`). The **base** (no modifier) is `--gap-md`
  (`space-3`). Sizes map onto the *pixel* of a spacing token, not 1:1 with
  their names — pick the size whose value you want.
- **`.row`** distribution / alignment: `--between --center --end` (main axis),
  `--baseline --top` (cross axis), `--wrap`. **`.stack`** cross-axis:
  `--start --center`.
- **`.cluster`** — wrapping row, small gap (chips/tags). **`.center`** —
  flex centered both axes.
- Child-level atoms (drop on a flex child, no wrapper): **`.grow`**
  (`flex: 1; min-width: 0`), **`.shrink-0`**, **`.self-start/-center/-end`**.

**Keep BEM when the block has identity beyond layout** — borders, background,
typography, `position`, or a selector other code depends on. The two mix
freely: `class="auth-profile stack stack--xl"` uses the utility for the flex +
gap and a thin `.auth-profile { padding }` for the rest. Don't add a one-off
atomic class (`.mt-4`, `.text-center`) — if a utility doesn't exist, either
use a thin BEM block or, if it's genuinely reusable layout, extend
`_layout.scss` (and keep it tight).

Canonical example: `_auth-profiles.scss` + `AuthProfilesPanel.tsx` — the
flex/gap blocks (`__body`, `__field`, `__creds`, `__session`, …) became
`.stack`/`.row`, leaving SCSS with only the component-specific styling.

---

## Component Organization

### Bucketed by page

```
components/
├── index/      project + report overview surfaces
├── detail/     single-page deep-dive + diff
├── settings/   overlays + wizards + recorders (incl. existing settings/* subdir)
└── utility/    shell, rail, shared primitives
```

Each bucket has its own `use/` and `utils/` subfolders. Cross-bucket
imports use `@/components/{bucket}/X` (absolute aliases) — that way
files can be moved between buckets without rewriting their internal
imports.

Within a bucket, imports also use `@/components/{bucket}/X` rather
than relative `./X` for the same reason.

### Logic / presentation split

Every non-trivial component splits like the sidebar:

- `Foo.tsx` — thin presentational shell (composes hooks + child views)
- `FooHelper.tsx` — sub-presentation components, also at bucket root
- `{bucket}/use/fooData.ts` — data-fetching hook (`useFooData`)
- `{bucket}/use/fooDrag.ts` — interaction state hook
- `{bucket}/utils/foo.ts` — pure helpers, no React

Hook filenames are the export name minus the `use` prefix
(`useFooData` → `fooData.ts`). Inline SVGs go in
`components/utility/icons.tsx` (shared across all buckets).

---

## Copy & terminology

**One term per concept, consistent noun/verb forms.** Don't mix synonyms for
the same thing on a screen (or across the app). Pick the word once.

Authentication vocabulary (user-facing copy):

- **sign in** (verb) / **sign-in** (noun + adjective, hyphenated) — the term
  for authenticating. NOT "log in" / "login", NOT "session" in copy.
- **credential** — a stored identity (the vault entry: email / password / OTP).
- **sign-in profile** — a reusable authenticated state (a credential + the
  sign-in script + its captured state). Tests reference one to start signed in.

Verbs match the noun: the button that runs the sign-in script is **"Test sign
in"**, its result reads **"Signed in 2 hours ago"** — not "Generate session" /
"Session captured".

Code identifiers may keep technical names (`loginScript`, `storageState`,
`captureLoginState`) — this rule governs **user-facing strings**, not symbols.

---

## Things to Avoid

- **Literal hex colors in component SCSS.** Always go through a
  component token. The four exceptions live in `_primitives.scss` as
  pinned `--on-*` foreground tokens (`#1a1a1a`, `#ffffff`).
- **Hardcoded class strings that don't appear in any JSX.** The audit
  in commit `296adb2` (and follow-ups) pruned ~25 dead BEM children
  — keep the file lean. If you add a `&__newthing` block, make sure
  some JSX renders `className="foo__newthing"`.
- **New role-aliases** like `--surface-tertiary`. Add a component
  token that points at a primitive directly.
- **Re-mixing component concerns into a single SCSS file** (e.g.,
  putting `.foo` and `.bar` in the same partial because they're "kind
  of related"). The 1:1 rule is the readability win.
- **Reaching across buckets via relative imports.** Always use
  `@/components/{bucket}/X`.
- **Repeating padding/gaps across sibling children.** Spacing lives on the
  flex wrapper (`gap` + one `padding`), not duplicated on `__header`/`__body`-
  style children or faked with per-child `margin-bottom`. See "Spacing &
  layout: the wrapper owns it" above.

---

## Visual Regression Workflow

When making UI changes:

1. **Before**: take screenshots via `mcp__Claude_Preview__preview_screenshot`
   on key routes.
2. **Make changes**.
3. **After**: re-screenshot and compare visually.
4. **Auth**: app needs sign-in. `/sign-in` works unauthenticated and
   is a good baseline. Use the running Electron app (which is already
   signed in) for authenticated routes.

### Key routes to check

- `/sign-in` — public, no auth needed
- `/` — home/empty state
- `/projects/[id]` — project with no reports
- `/reports/[reportId]` — report overview with page grid
- `/reports/[reportId]/pages/[pageId]` — page detail with diff +
  comparison

### Dark mode checklist

- Toggle light → dark → system in sidebar menu
- Hard refresh in dark mode — no FOUC
- Cancel buttons + .badge--warning chiclets stay white-on-red
- Action CTAs (primary/run-pill) stay black-on-yellow
- Gradient fade on collapsible issues works in both modes

---

## Figma — Design Tokens Sheet

The live swatch sheet lives at:
<https://www.figma.com/design/QAvOKTZcTnhELgD8rU4GIG/Ohsee>
node `3:2` ("Page 2"). The frame name is `Design Tokens`. Rebuild it
via the Figma MCP `use_figma` tool when the palette changes — script
template is in the repo history under the "Design Tokens" Figma
commits.

When connecting, the write MCP must be authenticated as
`srcurran@gmail.com` (the file owner). If it shows "could not be
accessed", re-auth via `/mcp` and pick the right account.

---

## Pre-existing Quirks

- `--radius-pill` is referenced in `_change-list.scss:178` but never
  defined. Pre-dates this work; flagged for future fix.
- The two API route errors (`prod`/`dev` on a `{ok:false}` type) in
  `app/api/projects/[id]/reports/route.ts` and similar are pre-existing
  — typecheck noise, not blocking.
