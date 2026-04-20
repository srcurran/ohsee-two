# Electron migration — ordered work checklist

Each item is scoped small enough to land as its own commit. Items marked **(safe)** can merge to main without breaking the web app. Items marked **(Electron-only)** only run in the Electron build.

## Phase 0: Pre-work (safe, can merge independently)

- [x] **0.1** `lib/constants.ts:27` — `DATA_DIR` reads `OHSEE_DATA_DIR` env var with `process.cwd()/data` fallback. **(safe, done)**
- [x] **0.2** `NEXT_PUBLIC_OHSEE_ELECTRON` build-time flag — read via `IS_ELECTRON_BUILD` in `lib/electron.ts`. Set at build time by `electron:build` script. **(safe, done)**
- [x] **0.3** `lib/auth-helpers.ts:7` — `requireUserId()` short-circuits to `OHSEE_LOCAL_USER_ID` when set. Also patched `proxy.ts` to skip sign-in redirect. **(safe, done)**
- [x] **0.4** `lib/report-runner.ts` — `runReport()` gained optional `options.onComplete(report)` callback, fires in finally block with terminal status. **(safe, done)**
- [x] **0.5** `lib/electron.ts` + `lib/electron-types.ts` — `IS_ELECTRON_BUILD`, `isElectronRuntime()`, `getOhsee()` helpers + typed `OhseeNative` surface matching the IPC contract doc. **(safe, done)**

## Phase 1: Electron shell + Next spawner

- [x] **1.1** `npm i -D electron concurrently wait-on` — installed (electron 41.2.1). `electron-builder`, `@electron/notarize`, `otpauth` deferred to phase 3.
- [x] **1.2** `electron/main.ts` — spawns Next standalone in prod (free port + env vars), connects to `next dev` on :4000 in dev. Creates `BrowserWindow`, registers quit handlers.
- [x] **1.3** `electron/preload.ts` — empty `contextBridge.exposeInMainWorld('ohsee', {})` stub. Real handlers land in phase 2.
- [x] **1.4** `electron/tsconfig.json` — CommonJS/ES2022, outputs to `.electron-out/`.
- [x] **1.5** Scripts in `package.json`:
  - `electron:build-main` → `tsc -p electron/tsconfig.json`
  - `dev:electron-next` → Next dev with `OHSEE_LOCAL_USER_ID=local`, `OHSEE_DATA_DIR=./data-electron-dev`, `NEXT_PUBLIC_OHSEE_ELECTRON=true`
  - `electron:dev` → `concurrently` running Next + tsc watch + electron (with `wait-on`)
  - `electron:build` → `NEXT_PUBLIC_OHSEE_ELECTRON=true next build && electron:build-main`
- [x] **1.6** Smoke test passed: Electron opens window, loads Next, renders home + API calls return 200.
- [x] **1.7** Auth short-circuit verified: `/api/projects`, `/api/settings`, `/api/auth/session` return 200 under `OHSEE_LOCAL_USER_ID=local`. Data isolation verified: requests hit `./data-electron-dev` instead of `./data`. Patched `proxy.ts` to skip sign-in redirect when env var is set.
- [x] **1.8** External navigation blocked: `webContents.on('will-navigate')` rejects non-app URLs and passes them to `shell.openExternal`. Same for `setWindowOpenHandler`.

## Phase 2: Native features

- [x] **2.1** `electron/ipc/notify.ts` — main-process polling (`trackReport`, `stopTracking`, `setRunningCount`). Fires on "completed"/"failed", skips "cancelled". Click handler restores, focuses, and navigates to `/reports/<id>`.
- [x] **2.2** Main-process-driven architecture chosen: renderer calls `trackReportCompletion(reportId, label)` via `lib/electron.ts` after POSTing a new report. Main polls `/api/reports/<id>` every 2s. Robust to renderer navigation. Wired in 4 call sites:
  - `app/(authenticated)/projects/[id]/page.tsx`
  - `app/(authenticated)/projects/[id]/tests/[testId]/page.tsx`
  - `app/(authenticated)/reports/[reportId]/page.tsx`
  - `app/(authenticated)/reports/[reportId]/pages/[pageId]/page.tsx`
- [x] **2.3** `electron/ipc/vault.ts` — `list/get/set/delete/totp` via `safeStorage` (Keychain-backed). Vault file at `userData/ohsee/vault.json`. Entries encrypted individually as base64 strings. `otpauth` generates 6-digit codes from stored seeds.
- [x] **2.4** Credentials tab on `/settings` page (gated by `isElectronRuntime()`). `components/settings/CredentialsSettings.tsx` — list/add/edit/delete + one-click copy-secret and copy-TOTP buttons.
- [ ] **2.5** FlowStep `credentialRef` integration — **deferred**. Requires plumbing: renderer pre-resolves vault keys via `ohsee.vault.get()`, POSTs a credentials map in the `/api/.../reports` body, `runReport` and `flow-runner` accept the map and substitute at step-execute time. Non-trivial because the flow-runner lives in the Next process (no direct Keychain access). Until wired: users can `Copy TOTP` from the settings tab and type it manually, or use the raw script/micro-test to read credentials from env/file. See "Follow-ups" in [electron-migration-plan.md](electron-migration-plan.md).
- [x] **2.6** `electron/ipc/codegen.ts` — spawns `node_modules/.bin/playwright codegen <url> --target=javascript --output=<temp>`. `start()` returns sessionId immediately; `stop()` kills (if running), reads temp file, cleans up. `codegen:exited` IPC event fires when user closes the inspector.
- [x] **2.7** `components/CodegenRecorder.tsx` — Electron-only button + prompt modal (URL input defaults to project prodUrl) + recording overlay + error state. Captured script flows into the existing `importCode` state → reuses the import parser → creates one micro-test per recorded section. Placed in `app/(authenticated)/projects/[id]/settings/tests/page.tsx` alongside the CLI-copy fallback.
- [x] **2.8** `electron/ipc/dialog.ts` — `saveFile` / `openFile` / `revealInFinder` wrappers. Exposed at `window.ohsee.dialog.*`.
- [ ] **2.9** Export report as PDF/zip via `dialog.saveFile` (nice-to-have, not blocking).

## Phase 3: Package & distribute

- [x] **3.1** `package.json` `build` key — `asar: true`, `asarUnpack` for sharp/playwright/@img, `afterPack` hook. See [scripts/after-pack.js](../scripts/after-pack.js).
- [x] **3.2** `electron:build` script stages `.next/standalone/` + `.next/static/` + `public/` into `electron-build/`, then `extraResources` copies it to `Resources/app.standalone/` inside the .app. `afterPack` hook reinserts `node_modules/` (electron-builder's dedup otherwise strips it).
- [x] **3.3** Unsigned `dist-electron/Ohsee-0.1.0-arm64.dmg` (355 MB) built via `npm run electron:pack`. Launched successfully — Next server bound to `127.0.0.1:<random>`, `/api/projects` returns 200 under `OHSEE_LOCAL_USER_ID=local`, data isolated to `~/Library/Application Support/ohsee/`.
- [ ] **3.4** Apple Developer ID signing + notarization — requires paid Developer account. Current DMG is ad-hoc signed (launches locally after `xattr -cr Ohsee.app` but won't pass Gatekeeper for distribution).
- [ ] **3.5** Auto-update via `electron-updater` + GitHub Releases — requires signed builds; defer with 3.4.
- [ ] **3.6** Auto-install Playwright browsers on first launch — not yet wired. For now: run `PLAYWRIGHT_BROWSERS_PATH=~/Library/Application\ Support/ohsee/browsers npx playwright install chromium` before the first audit.

## Phase 4: Cleanup (after dogfooding for ~1 week)

- [ ] **4.1** Decide: keep web build alive, or sunset in favor of Electron? Affects what we do with `/app/sign-in/`, NextAuth, dev-login.
- [ ] **4.2** If sunsetting web: remove NextAuth, Google OAuth, `/api/auth/*`, `/app/sign-in/*`. Simplify `auth.ts` to just `OHSEE_LOCAL_USER_ID`.
- [ ] **4.3** If keeping both: document the split in README, guard feature-flagged code consistently.
- [ ] **4.4** Migrate existing user data: the first-launch check detects `~/.ohsee-legacy/data/` (or wherever the web app's data lives), offers to copy into `userData/ohsee/`.

## Smoke tests per phase

**After Phase 1:**
- Electron window opens.
- Sidebar loads projects from disk.
- Can click into a project, see its config.
- Can start an audit; progress updates in real time; screenshots appear.
- Data lives in `userData/ohsee/users/local/`, not in the repo.

**After Phase 2:**
- Audit completion triggers a macOS notification. Clicking it focuses the app.
- Dock badge shows running audit count.
- Can add a credential to the vault; it's encrypted on disk.
- Can record a flow with codegen and save it to a test.

**After Phase 3:**
- DMG installs cleanly, launches, runs an audit, stays running in the background.
- Auto-update detects a new release.

## File touch count (estimated)

| Category | Files touched | New files |
|---|---|---|
| Pre-work (phase 0) | 3 (`constants.ts`, `auth.ts`, `report-runner.ts`) | 1 (`lib/electron.ts`) |
| Electron shell (phase 1) | 1 (`package.json`) | 6 (electron/ files + configs) |
| Native features (phase 2) | 3–4 (flow editor, settings pages, report runner) | 5 (ipc/ + vault UI) |
| Packaging (phase 3) | 1 (`package.json`) | 2 (electron-builder config, icons) |
| **Total** | **~9 existing files** | **~14 new files** |

Compared to the original static-export plan's ~200 touches across 12 files, this is ~20 mechanical changes and a clean separation between Electron-only code (`electron/`) and shared code.
