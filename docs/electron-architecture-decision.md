# Architecture decision: standalone vs static export

## TL;DR
Use **`output: 'standalone'`** (Next.js server runs in Electron main process on localhost). Reject static export despite its smaller bundle size.

## Context
The original migration plan proposed `next build` with `output: 'export'`, converting all 11 API routes to IPC handlers and introducing an `apiClient` abstraction in the renderer. A detailed audit of the existing codebase (see "Audit findings" below) revealed this approach requires ~200 mechanical code changes and a routing refactor.

## Options considered

### Option A: Static export + IPC (original plan)
Build Next.js to `out/`, serve via `file://` or custom protocol. API routes become `ipcMain.handle(...)` handlers. Renderer uses `window.ohsee.api.*` instead of `fetch('/api/*')`.

**Cost to reach parity:**
- Rewrite 11 API routes as IPC handlers (small files, but N of them)
- Introduce `apiClient` abstraction + update ~180 call sites across 12 components
- Refactor 4 pages that use `useSearchParams()` — either hash-route them or convert to client-side state
- Add `generateStaticParams` to 5 dynamic route segments (returning `[]`, with client-only rendering) — and verify Next 15 actually supports this with `output: 'export'`
- Remove server actions in `app/sign-in/actions.ts` (replaced by Electron auth)
- Remove NextAuth entirely; reimplement session handling for API handlers that are now IPC

**Benefits:**
- Smaller packaged app (~2 MB renderer vs ~80 MB with Next runtime)
- Cleaner security model (no localhost HTTP server)
- No port allocation or bootstrap wait
- Clearer separation of concerns (renderer = UI, main = logic)

### Option B: Standalone + thin IPC (chosen)
`next build` with `output: 'standalone'`. Electron main spawns Next on a random localhost port. Renderer loads `http://127.0.0.1:<port>`. IPC is used only for native-only features (notifications, codegen, credentials vault, auto-update).

**Cost to reach parity:**
- Write `electron/main.ts` that boots Next standalone and creates a window
- Add preload + contextBridge for native features (~8 IPC channels, not 11 + auth + everything)
- `OHSEE_DATA_DIR` env var override (already done)
- `OHSEE_LOCAL_USER_ID` env var short-circuit in `auth.ts`
- `NEXT_PUBLIC_OHSEE_ELECTRON` flag to hide sign-in UI in Electron builds

**Benefits:**
- Every existing fetch call, dynamic route, server action, and `useSearchParams` keeps working
- No routing refactor
- No `apiClient` abstraction
- Can revert any single change and fall back to the web app cleanly
- Parity with the web app maintained throughout migration; easier to A/B debug

**Downsides accepted:**
- Packaged app is ~80 MB larger (Next.js runtime + node_modules)
- 200–500ms cold start while Next boots — masked by a splash screen
- Two routing layers (Electron window + Next router), but they don't interact

## Audit findings driving the decision

From an exhaustive audit of the codebase:

| Metric | Value | Impact on static export |
|---|---|---|
| `fetch('/api/*')` call sites | ~180 across 12 files | Each needs `apiClient.x()` swap |
| API routes | 18 | Each needs an IPC handler rewrite |
| Dynamic route segments using runtime IDs | 5 | Each needs `generateStaticParams` + client-only rendering |
| Pages using `useSearchParams()` | 4 | Each needs hash routing or state refactor |
| Server actions | 1 file (`app/sign-in/actions.ts`) | Must be removed |
| Middleware | 0 | No impact |
| `next/image` usage | 0 | No impact |
| Global state in `lib/report-runner.ts` | 2 Maps | Fine in main process either way |
| Hardcoded `data/` paths | 0 (all via `lib/constants.ts`) | Trivial env-var override |

The data paths being centralized and the absence of `next/image` / middleware made static export *plausible*. The dynamic route and search-param situation made it expensive.

## Revisit trigger

If any of the following become true, reconsider static export:

1. App bundle size becomes a distribution concern (unlikely — it's an internal tool).
2. We want to ship to iOS/web-share targets (would need static anyway).
3. We discover Next.js standalone has a blocking issue with some native feature we need.
4. We decide to merge main-process and renderer-process logic for a true offline-first architecture.

## Notes on the "lib/ stays put" invariant

Both options keep `lib/report-runner.ts`, `lib/screenshot.ts`, `lib/diff.ts`, `lib/flow-runner.ts`, and `lib/data.ts` unchanged. The difference is only *how they're invoked*: in Option A, from IPC handlers; in Option B, from the existing API routes running in the spawned Next.js process. Either way, the core audit engine is untouched.
