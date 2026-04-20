# Ohsee → Electron macOS migration plan

## Why standalone
- Screenshot capture + storage cost is effectively free at any scale when self-hosted.
- Low risk of leaking test credentials, OTP seeds, and production test accounts — everything stays on-device, protected by the macOS Keychain.
- Unlocks native affordances: system notifications, dock badges, and shelling out to Playwright codegen from the UI.

## Architecture: `output: 'standalone'` + thin IPC

After a full audit of the current codebase, **this plan uses Next.js standalone mode rather than static export.** See [electron-architecture-decision.md](electron-architecture-decision.md) for the full rationale — short version: 4 pages use runtime-only `useSearchParams()`, 5 route segments use user-generated IDs, and there are ~180 fetch calls across 12 components. Static export would turn a mechanical wrap-the-app job into a ~200-change refactor. Standalone keeps the entire existing frontend and backend unchanged.

### How it works
- **Main process** (Electron/Node): spawns Next.js in standalone mode on a random localhost port. Owns the BrowserWindow, IPC handlers for native features, auto-updater, and notification center.
- **Next.js process** (child or in-process via `next/standalone` bootstrap): serves the existing UI and API routes on `http://127.0.0.1:<port>`. `lib/report-runner.ts`, Playwright, sharp — all unchanged.
- **Renderer**: loads `http://127.0.0.1:<port>`. Every `fetch('/api/...')`, dynamic route, and server action keeps working identically. Native features accessed via `window.ohsee` (contextBridge preload).
- **Data dir**: `OHSEE_DATA_DIR=app.getPath('userData')/ohsee` set before spawning Next. (Already wired — see `lib/constants.ts:27`.)
- **Playwright browsers**: `PLAYWRIGHT_BROWSERS_PATH=app.getPath('userData')/ohsee/browsers` — Playwright reads this env var natively, no code change needed.

## Phases

### Phase 1: Electron shell + Next spawner (1 day)
- Add `electron/` with `main.ts`, `preload.ts`, `ipc/` directory.
- Add `electron-builder` and `electronmon` to devDependencies.
- `electron/main.ts` logic:
  1. Pick a free port (`get-port`).
  2. Set `OHSEE_DATA_DIR`, `PLAYWRIGHT_BROWSERS_PATH`, `NODE_ENV=production`.
  3. In dev: spawn `next dev`. In prod: require `.next/standalone/server.js`.
  4. Wait for port to be listening, then create `BrowserWindow` and load the URL.
- Add `npm run electron:dev` script. Keep `npm run dev` working in parallel for web-only testing.

### Phase 2: Local-first auth (0.5 day)
- Add `OHSEE_LOCAL_USER_ID` env var (e.g., `"local"`). When set, `auth.ts` and `requireUserId()` short-circuit to that user and skip NextAuth entirely.
- Electron main always sets this. Web build is unchanged (env var unset → current NextAuth flow).
- Hide the sign-in UI elements in Electron builds via a `NEXT_PUBLIC_OHSEE_ELECTRON` flag.
- Credentials vault (for production test accounts + OTP seeds) behind `window.ohsee.vault.*`:
  - `vault.set(key, value)` → `safeStorage.encryptString` → write to `userData/vault.json`
  - `vault.get(key)` → decrypt
  - `vault.generateTotp(seed)` → use `otpauth` library in main
- Inject credentials into Playwright flows via a new "CredentialsRef" step type that resolves at runtime.

### Phase 3: Native features (0.5 day)
- **Notifications**: `window.ohsee.notify({ title, body, reportId })` → `new Notification(...)` in main → click focuses the window at `/reports/[reportId]`.
- **Dock badge**: `window.ohsee.setRunningCount(n)` → `app.dock.setBadge(n > 0 ? String(n) : '')`.
- **Codegen**: `window.ohsee.codegen.start({ url, cookies })` → spawns `npx playwright codegen`, streams recorded steps back via IPC `codegen:step` events. Parse output into flow editor steps.
- **Custom screenshot protocol** (optional, a perf win): register `ohsee-screenshot://` in main, read directly from `userData/ohsee/users/.../screenshots/`. Replaces `/api/screenshots/[...path]` round trip.

### Phase 4: Package & sign (1 day)
- `next build` with `output: 'standalone'`.
- `electron-builder` config:
  - Target: `dmg`, arch: `arm64` (universal later if needed).
  - `asarUnpack`: `node_modules/sharp/**/*`, `node_modules/playwright-core/**/*`, `.next/standalone/node_modules/sharp/**/*`.
  - Extra resources: copy `.next/standalone`, `.next/static`, `public/` into resources dir.
- Code signing + notarization: Apple Developer ID + `electron-notarize`. Budget half a day for first round.
- Auto-update: `electron-updater` + GitHub Releases.

## New features enabled

### Audit-complete alert
- `new Notification(...)` when `runReport` resolves. Click focuses the window and deep-links to `/reports/[reportId]`.
- Dock badge during runs via `app.dock.setBadge()`.
- Hook: add a completion callback to `runReport` in `lib/report-runner.ts`; callback is a no-op in web, calls IPC in Electron.

### Playwright codegen from UI
- Spawn `npx playwright codegen` as a child process in main. Stream stdout; parse the JS output into flow steps. Pipe into the existing flow editor.
- Bonus: restore cookies from a prior run first so users can extend existing flows rather than start from scratch.

## Pre-work already completed
- [lib/constants.ts:27](../lib/constants.ts#L27) — `DATA_DIR` now reads `OHSEE_DATA_DIR` env var with fallback to `process.cwd()/data`. Web unchanged; Electron gets path isolation for free.

## Pre-work still recommended (phase 0, small safe PRs)
- Add `NEXT_PUBLIC_OHSEE_ELECTRON` flag for build-time UI branching (hide sign-in, show native-only settings).
- Add `OHSEE_LOCAL_USER_ID` short-circuit in `auth.ts` behind `NODE_ENV !== 'production' || process.env.OHSEE_LOCAL_USER_ID` check.
- Thread an optional `onComplete` callback through `lib/report-runner.ts` so notifications have somewhere to hook in.
- Add `get-port`, `electron`, `electron-builder`, `electronmon`, `@electron/notarize`, `otpauth` to devDependencies.

## Risks / open questions

- **Native modules in ASAR**: `sharp`, Playwright's drivers must be in `asarUnpack`. Standard but easy to miss on first build.
- **Port conflicts**: `get-port` picks a free port, but if the user has other dev servers running, be sure we don't accidentally bind to 4000/4001 (current web ports).
- **Distribution**: personal build (self-signed DMG) or shared (Apple Developer ID + notarization)? Affects whether we need the cert now.
- **NextAuth + standalone**: verify NextAuth v5 works in standalone mode — it should, but warrants a 10-minute smoke test in phase 1.

## Related docs
- [electron-architecture-decision.md](electron-architecture-decision.md) — why standalone over static export
- [electron-ipc-contract.md](electron-ipc-contract.md) — full `window.ohsee` surface
- [electron-migration-checklist.md](electron-migration-checklist.md) — ordered file-by-file work list

## Follow-ups (not blocking a dogfood build)

### FlowStep credentialRef integration
The vault is wired end-to-end (CRUD + Keychain + TOTP), but Playwright flows don't yet consume stored credentials automatically. Wiring plan:

1. Extend `FlowStep` in `lib/types.ts` with `{ type: 'credentialRef', key, field: 'username' | 'password' | 'totp' }`.
2. On audit start (renderer), walk the test's flows + compositions collecting every `credentialRef` key.
3. Call `ohsee.vault.get(key)` for each (main decrypts via Keychain, returns plaintext over IPC).
4. POST the resolved map in the request body to `/api/projects/[id]/tests/[testId]/reports`.
5. Thread it through `runReport` → `flow-runner.executeFlow` → substitute at step-execute time (for TOTP, call `ohsee.vault.totp(key)` fresh each execution since codes rotate every 30s — or re-resolve just before injection).
6. Step editor UI: a picker that lists vault entries by label, inserts a `credentialRef` step.

Cross-process subtlety: plaintext transits main → renderer → Next API → `flow-runner` in memory. That's acceptable because all three processes are local and trust each other, but worth a comment in the code.

### Packaging follow-ups
- **Code signing + notarization** requires an Apple Developer ID ($99/yr). Until then, personal builds only (launch with `xattr -cr Ohsee.app` to clear quarantine).
- **Auto-update** via `electron-updater` depends on signing.
- **Playwright browsers on first launch** — add a first-run flow that calls `npx playwright install chromium` with `PLAYWRIGHT_BROWSERS_PATH=userData/ohsee/browsers`, showing download progress. Until then, users must run that command manually once.
- **App icon + branding** — currently ships with the default Electron icon. Drop a `build/icon.icns` and `build/background.png` for the DMG.
