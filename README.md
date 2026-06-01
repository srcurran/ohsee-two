# Ohsee

Visual regression testing tool that compares screenshots across environments, breakpoints, and theme variants. Runs as a Next.js web app or an Electron desktop app.

## What it does

- Captures screenshots of prod vs dev/staging URLs using Playwright
- Diffs them at the pixel level (pixelmatch) and detects semantic changes (layout, color, typography)
- Supports multiple viewport breakpoints (375–1920px, configurable) and light/dark theme variants
- Records and replays browser flows (click, fill, wait) for pages behind auth or complex navigation
- Runs inline Playwright micro-tests with a built-in script editor (CodeMirror)
- Stores everything as JSON files on the local filesystem — no database required

## Tech stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **SCSS** design system with two-tier token architecture (primitives + component tokens)
- **Playwright** for headless browser screenshots and flow recording
- **sharp + pixelmatch + pngjs** for image processing and diffing
- **Electron** for the desktop app (native notifications, encrypted credential vault via macOS Keychain)
- **NextAuth** with Google OAuth (+ dev credentials provider)

## Getting started

### Prerequisites

- Node.js 20+
- A Google OAuth app for auth (or use the dev login in development)

### Setup

```bash
npm install
```

Playwright's Chromium binary installs automatically via `postinstall`.

Create a `.env.local`:

```env
AUTH_URL=http://localhost:4000
AUTH_SECRET=           # generate with: npx auth secret
AUTH_GOOGLE_ID=        # Google OAuth client ID
AUTH_GOOGLE_SECRET=    # Google OAuth client secret
```

For development without Google OAuth, add:

```env
DEV_LOGIN_EMAIL=dev@example.com
DEV_LOGIN_PASSWORD=password
DEV_LOGIN_USER_ID=local
```

### Run (web)

```bash
npm run dev
```

Opens at [http://localhost:4000](http://localhost:4000).

### Run (Electron)

```bash
npm run electron:dev
```

Starts Next.js + TypeScript watcher + Electron with hot reload.

### Build (Electron)

```bash
npm run electron:pack
```

Outputs a macOS `.dmg` to `dist-electron/`.

## Project structure

```
app/
  (authenticated)/          Routes behind auth (projects, reports, settings)
  api/                      REST API (projects, tests, reports, screenshots, crawl)
  styles/                   SCSS design system (tokens, mixins, component partials)
components/
  index/                    Project + report overview surfaces
  detail/                   Page-level diff viewer (side-by-side, slider, change list)
  settings/                 Wizards, editors, flow recorder
  utility/                  Shell, sidebar, shared primitives
electron/
  main.ts                   Electron entry point
  ipc/                      IPC handlers (vault, codegen, notify, dialog)
lib/                        Core business logic (data access, diffing, auth helpers)
types/                      Shared TypeScript type definitions
```

## Key routes

| Route | Description |
|-------|-------------|
| `/` | Dashboard — list of projects |
| `/projects/[id]` | Project overview with tests |
| `/projects/[id]/settings/*` | Project config (pages, tests, flows, advanced) |
| `/reports/[reportId]` | Report overview — page grid with diff thumbnails |
| `/reports/[reportId]/pages/[pageId]` | Page detail — pixel diff, slider comparison, change list |
| `/settings` | User defaults (breakpoints, variants) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on port 4000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run electron:dev` | Start Electron dev environment |
| `npm run electron:pack` | Build + package macOS Electron app |
