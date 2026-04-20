# Electron IPC contract — `window.ohsee`

This is the entire native-side API exposed to the renderer via `contextBridge`. In web builds, `window.ohsee` is `undefined` — code must feature-detect. The Next.js API routes (`/api/*`) remain the primary data surface; IPC is only for things the browser can't do.

## Feature detection pattern

```ts
// lib/electron.ts (shared renderer util)
export const isElectron = typeof window !== 'undefined' && !!window.ohsee;
export const ohsee = typeof window !== 'undefined' ? window.ohsee : undefined;
```

Components that use native features:

```tsx
if (ohsee) ohsee.notify({ title: 'Audit complete', reportId: r.id });
```

## Full surface

### `ohsee.meta`
Introspection only.

| Method | Signature | Main-side |
|---|---|---|
| `meta.getVersion()` | `Promise<{ app: string; electron: string; chromium: string; node: string }>` | `app.getVersion()` etc |
| `meta.getDataDir()` | `Promise<string>` | Returns `app.getPath('userData') + '/ohsee'` |
| `meta.openDataDir()` | `Promise<void>` | `shell.openPath(dataDir)` |

### `ohsee.notify`
Audit lifecycle notifications. Clicks focus the window and navigate.

| Method | Signature | Main-side |
|---|---|---|
| `notify.reportComplete({ reportId, projectName, changedCount })` | `Promise<void>` | `new Notification(...)`; click handler `mainWindow.webContents.loadURL('http://127.0.0.1:<port>/reports/<id>')` |
| `notify.reportFailed({ reportId, projectName, error })` | `Promise<void>` | Same pattern, error style |
| `notify.setRunningCount(n)` | `Promise<void>` | `app.dock.setBadge(n > 0 ? String(n) : '')` |

### `ohsee.codegen`
Launches Playwright's interactive recorder and returns the captured JS on stop.

| Method | Signature | Main-side |
|---|---|---|
| `codegen.start({ url })` | `Promise<{ sessionId: string }>` | Spawns `node_modules/.bin/playwright codegen <url> --target=javascript --output=<tempfile>`. Returns sessionId immediately. |
| `codegen.stop(sessionId)` | `Promise<{ script: string }>` | Kills process if still running (SIGTERM → 2s flush window), reads tempfile, unlinks it, returns content. |
| `codegen.onExited(cb)` | `() => void` (unsubscribe) | Fires when the codegen process exits on its own (user closed the inspector). Renderer should then call `stop()` to retrieve the script. |
| `codegen.onError(cb)` | `() => void` (unsubscribe) | Fires if the spawn fails. |

**Note:** v1 returns raw Playwright JS and funnels it through the existing micro-test import parser (which splits on `// Step N:` comments and navigation boundaries). No custom step parsing in main — keeps the IPC surface stable if the output format changes. Streaming per-step events can be added later if the recording UX calls for it.

### `ohsee.vault`
Encrypted storage for production test account credentials and TOTP seeds. Uses `safeStorage` (macOS Keychain) to encrypt values before writing to `userData/ohsee/vault.json`.

| Method | Signature | Main-side |
|---|---|---|
| `vault.list()` | `Promise<VaultEntry[]>` (metadata only, no secrets) | Read vault.json, return `{ key, label, createdAt }[]` |
| `vault.get(key)` | `Promise<VaultEntry & { secret: string }>` | Decrypt via `safeStorage.decryptString` |
| `vault.set(key, { label, secret, totpSeed? })` | `Promise<void>` | Encrypt and persist |
| `vault.delete(key)` | `Promise<void>` | Remove entry from vault.json |
| `vault.totp(key)` | `Promise<string>` | Looks up seed, returns current 6-digit code via `otpauth` |

**Vault entry shape:**
```ts
type VaultEntry = {
  key: string;          // user-chosen, e.g. "prod-admin"
  label: string;        // display name, e.g. "Prod admin (admin@test.com)"
  secret: string;       // decrypted password or API key
  totpSeed?: string;    // base32 TOTP secret
  createdAt: string;    // ISO
};
```

**Flow integration:** `FlowStep` gains a new shape `{ type: 'credentialRef', key: string, field: 'username' | 'password' | 'totp' }`. Resolved at runtime by the flow runner via `vault.get()` / `vault.totp()`. Renderer never sees the plaintext.

### `ohsee.updater`
| Method | Signature | Main-side |
|---|---|---|
| `updater.check()` | `Promise<{ available: boolean; version?: string; notes?: string }>` | `autoUpdater.checkForUpdates()` |
| `updater.downloadAndRestart()` | `Promise<void>` | `autoUpdater.quitAndInstall()` |
| `updater.onProgress(cb)` | `() => void` | Stream download progress |

### `ohsee.dialog`
Thin wrappers for native pickers (used for importing flow files, exporting reports).

| Method | Signature | Main-side |
|---|---|---|
| `dialog.saveFile({ defaultName, filters })` | `Promise<string \| null>` | `dialog.showSaveDialog` |
| `dialog.openFile({ filters, multiple? })` | `Promise<string[] \| null>` | `dialog.showOpenDialog` |
| `dialog.revealInFinder(path)` | `Promise<void>` | `shell.showItemInFolder(path)` |

## Event streams (main → renderer)
Use `contextBridge.exposeInMainWorld` to expose typed subscription helpers.

```ts
// preload.ts sketch
contextBridge.exposeInMainWorld('ohsee', {
  codegen: {
    onStep: (cb) => {
      const listener = (_: unknown, step: FlowStep) => cb(step);
      ipcRenderer.on('codegen:step', listener);
      return () => ipcRenderer.off('codegen:step', listener);
    },
    // ...
  },
  updater: {
    onProgress: (cb) => { /* similar */ },
  },
});
```

## What's deliberately NOT on this surface
- No `ohsee.projects.*`, no `ohsee.reports.*`, no `ohsee.settings.*` — those keep using `fetch('/api/*')` unchanged.
- No `ohsee.fs.*` — file I/O for data goes through the existing Next.js API.
- No `ohsee.playwright.*` for running audits — that stays behind `/api/projects/[id]/tests/[testId]/reports`.

Keeping the IPC surface small means:
1. The web build and Electron build stay equivalent for the core feature set.
2. Type maintenance is localized to ~20 method signatures, not ~200.
3. Any renderer code that doesn't touch native features is cross-target by default.

## Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the main `BrowserWindow`.
- CSP set to disallow `unsafe-eval` — verify CodeMirror works (it does, unless you enable the Python/Markdown parsers that use eval).
- Only load `http://127.0.0.1:<port>` (the spawned Next). Block all other navigation via `webContents.on('will-navigate')`.
- Vault plaintext only crosses IPC on explicit `vault.get(key)` calls; never log it, never include in error traces.
