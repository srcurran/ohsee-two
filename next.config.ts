import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  // Electron's renderer loads the dev server via http://127.0.0.1 (see
  // electron/main.ts), but Next 16 only allows `localhost` by default and
  // returns 403 for cross-origin `/_next/*` requests — blocking the JS
  // bundles and HMR WebSocket, which leaves the page frozen on the SSR'd
  // placeholder. Allow the loopback IP too.
  allowedDevOrigins: ["127.0.0.1"],
  // Standalone output bundles the minimal server needed to run `next start`
  // so Electron can spawn it directly from inside the packaged .app.
  // No-op for `next dev` and normal `next start`.
  output: "standalone",
  // Next.js's file tracer sometimes misses native-module binaries. Force-include
  // sharp's platform-specific binaries and Playwright's server driver so the
  // packaged standalone build can actually run audits.
  outputFileTracingIncludes: {
    "/api/**": [
      "node_modules/sharp/**/*",
      "node_modules/@img/**/*",
      "node_modules/playwright/**/*",
      "node_modules/playwright-core/**/*",
    ],
  },
  // Stop the tracer from slurping user data, dev artifacts, and doc output
  // into the standalone bundle. DATA_DIR resolves to `./data` at cwd (or
  // OHSEE_DATA_DIR) — real user content, not part of the app build.
  outputFileTracingExcludes: {
    "*": [
      "data/**",
      "data-electron-dev/**",
      "dist-electron/**",
      ".electron-out/**",
      "docs/**",
      ".git/**",
    ],
  },
  // Playwright imports browser drivers lazily; tell the bundler not to attempt
  // to resolve them at build time.
  serverExternalPackages: ["playwright", "playwright-core", "sharp"],
};

export default nextConfig;
