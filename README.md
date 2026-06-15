# Ohsee

Visual regression testing app that captures screenshots of production and dev/staging URLs, then highlights what changed — both pixel-level diffs and semantic changes (layout shifts, color changes, typography differences, etc.).

## Features

- **Multi-breakpoint screenshots** — configurable widths (default: 375, 768, 1440px)
- **Pixel diffing** — side-by-side comparison with highlighted differences via pixelmatch
- **Semantic diffing** — identifies layout, spacing, color, typography, and content changes
- **Variant support** — capture light/dark themes or custom states via init scripts
- **Recorded flows** — record click/fill/wait interactions as replayable test steps
- **Micro-tests** — inline Playwright scripts for complex assertions
- **Per-test credentials** — auth via vault (Electron) or explicit session config
- **Electron app** — macOS desktop app with native notifications and encrypted credential vault

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- SCSS with a two-tier design token system (primitives + semantic)
- Playwright for screenshot capture
- sharp + pixelmatch + pngjs for image processing and diffing
- NextAuth v5 (Google OAuth + dev credentials)
- JSON files + filesystem for data storage (no database)
- Electron for desktop distribution

## Getting Started

```bash
npm install
```

Create a `.env.local` with:

```
AUTH_URL=http://localhost:4000
AUTH_SECRET=<generate with `npx auth secret`>
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>

# Optional: dev login without Google OAuth
DEV_LOGIN_EMAIL=dev@ohsee.local
DEV_LOGIN_PASSWORD=dev
DEV_LOGIN_USER_ID=local
```

Run the dev server:

```bash
npm run dev          # Next.js on port 4000
```

Or run the Electron dev environment:

```bash
npm run electron:dev # Electron + Next.js + tsc watch
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server on port 4000 |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run start:stable` | Production server on port 4001 |
| `npm run electron:dev` | Electron + Next.js dev |
| `npm run electron:pack` | Build macOS DMG (arm64) |

## Project Structure

```
app/
  (authenticated)/    Protected routes (settings, reports)
  api/                REST endpoints (projects, tests, reports, screenshots)
  sign-in/            Auth page
  styles/             SCSS tokens, mixins, component styles
components/
  index/              Report overview + page grid
  detail/             Page-level diff viewer
  settings/           Wizards, editors, configuration panels
  utility/            Shell, nav, shared primitives
lib/                  Core logic (report runner, diffing, screenshot capture, flows)
electron/             Main process, IPC handlers, preload
data/                 User data + screenshots (gitignored)
```
