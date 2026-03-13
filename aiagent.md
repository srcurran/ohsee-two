# AI Agent Working Memory

## User Preferences

### Git / Workflow
- Commit on discrete, logical pieces of work (not after every tiny edit)
- Push after ~10 minutes of accumulated work
- User will review visually in their browser and give feedback

### Code Style
- All colors must flow through the two-level token system (Primitives → Semantic) in `globals.css`
- Never use hardcoded `text-black`, `bg-white`, `focus:border-black` etc. in components — always use semantic tokens like `text-foreground`, `bg-surface-content`
- Intentional exceptions: CTA buttons (`bg-black text-white`), modal backdrops (`bg-black/40`), tooltips (`bg-black/90 text-white`), scroll-to-top (`bg-black/70 text-white`), slider overlays
- Pixel values in brackets: `px-[12px]`, `text-[14px]`, `rounded-[8px]` — the project uses explicit pixel values, not Tailwind's spacing scale
- Font: Poppins (400 normal, 700 bold only)

### UI Feedback
- Elevation: User prefers `shadow-elevation-md` + `hover:-translate-y-[1px]` for interactive cards. `shadow-elevation-lg` felt too heavy.
- Keep UI clean — don't over-elevate

## Gotchas & Pitfalls

### Turbopack CSS Cache (Critical)
**Problem**: When adding NEW tokens to `@theme inline` in `globals.css`, Turbopack's dev server caches the old `@theme` registration. New tokens (e.g., `bg-surface-content`, `from-surface-fade-from`) will silently resolve to `transparent` / empty values. Existing tokens continue to work, making it look like a code bug when it's a cache bug.

**Fix**: After adding new tokens to `@theme inline`, always run:
```bash
rm -rf .next && npm run dev
```
Tell the user to hard-refresh (Cmd+Shift+R) their browser.

**Detection**: Test new token classes by checking `getComputedStyle` on a temp element. If the value is `rgba(0,0,0,0)` (transparent) for what should be a solid color, it's the cache.

### Circular CSS Variable References in @theme inline
**Problem**: In Tailwind v4, `@theme inline` uses the `--shadow-*` namespace for shadows. If your `:root` primitive is ALSO named `--shadow-elevation-sm`, the `@theme inline` entry `--shadow-elevation-sm: var(--shadow-elevation-sm)` creates a circular self-reference — the shadow silently disappears.

**Fix**: Name `:root` primitives differently from the `@theme inline` entries:
```css
:root {
  --elevation-sm: 0px 1px 2px rgba(0,0,0,0.06); /* primitive */
}
@theme inline {
  --shadow-elevation-sm: var(--elevation-sm); /* Tailwind token */
}
```

### Tailwind v4 @theme inline Behavior
- `@theme inline` does NOT output `--color-*` CSS custom properties. It registers tokens internally and generates utilities that reference the underlying `var(--your-var)` directly.
- This means `getComputedStyle(el).getPropertyValue('--color-foreground')` will always be empty — that's expected.
- The utilities themselves (e.g., `text-foreground`) DO work because they output `color: var(--foreground)`.
- Opacity modifiers (`bg-foreground/10`) use `color-mix(in oklab, ...)` under the hood — works in modern browsers.

### Dark Mode Token Strategy
- Override Level 1 primitives in `.dark {}` class — all Level 2 semantic tokens auto-switch because they reference primitives via `var()`.
- New semantic tokens that need DIFFERENT values in dark mode (not just primitive swaps) must be explicitly overridden in `.dark {}` — e.g., `--surface-content`, `--surface-fade-from`, `--elevation-content`.
- `next-themes` handles the `.dark` class on `<html>`, localStorage persistence, and system preference detection.

## Visual Regression Self-Testing Workflow

### Before/After Screenshot Process
When making UI changes, follow this workflow to catch regressions:

1. **Before changes**: Take screenshots of key routes via preview tools
2. **Make changes**
3. **After changes**: Take screenshots again, compare visually
4. **If adding new @theme inline tokens**: ALWAYS `rm -rf .next` before testing (see Turbopack cache gotcha)

### Key Routes to Check
- `/sign-in` — public, no auth needed (good baseline test)
- `/` — home/empty state (authenticated)
- `/projects/[id]` — project with no reports
- `/reports/[reportId]` — report overview with page grid
- `/reports/[reportId]/pages/[pageId]` — page detail with diff viewer + comparison

### Dark Mode Verification Checklist
- [ ] Toggle light → dark → system in sidebar menu
- [ ] Hard refresh in dark mode — no FOUC
- [ ] CTA buttons (Sign In, Create Project) stay dark in both modes
- [ ] Tooltips, overlays, scroll-to-top stay dark in both modes
- [ ] Form inputs have correct bg/text in dark mode
- [ ] Gradient fade on collapsible issues works in both modes

### Auth Limitation
The app requires Google OAuth — can't screenshot authenticated routes via unauthenticated scripts. Options:
- Use preview tools (Playwright-based, can reuse browser session)
- Screenshot sign-in page for light/dark baseline (no auth needed)
- For authenticated pages, user tests manually and provides screenshots

## Token Reference

### New Tokens Added (Dark Mode)
| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `surface-content` | `#ffffff` | `#1e1e1e` | Content panels, modals, dropdowns, sticky navs |
| `surface-fade-from` | `#ffffff` | `#1e1e1e` | Gradient fade on collapsible sections |
| `surface-fade-via` | `rgba(255,255,255,0.9)` | `rgba(30,30,30,0.9)` | Gradient mid-stop |
| `elevation-content` | soft light shadow | subtle dark shadow | Content panel shadow |

### Elevation Tiers
| Token | Values | Used For |
|-------|--------|----------|
| `shadow-elevation-sm` | subtle | Sidebar icons, secondary buttons on hover |
| `shadow-elevation-md` | medium | Primary CTAs, interactive cards on hover |
| `shadow-elevation-lg` | heavy | Dropdown menus |
| `shadow-elevation-content` | ambient | Main content panel |
