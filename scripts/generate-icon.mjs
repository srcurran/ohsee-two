#!/usr/bin/env node
/**
 * Regenerate the Electron app icon from build/icon.svg.
 *
 * Produces:
 *   build/icon.png      — 1024×1024 master (electron-builder fallback)
 *   build/icon.icns     — macOS icon set (used by electron-builder on mac)
 *
 * Run after editing build/icon.svg:  node scripts/generate-icon.mjs
 * Requires macOS `iconutil` (for .icns) and the `sharp` dependency.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const buildDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "build");
const svgPath = path.join(buildDir, "icon.svg");

// Render the SVG to a PNG buffer at an exact pixel size (re-rasterized each
// size for crisp edges, rather than downscaling one big raster).
async function renderPng(size) {
  return sharp(svgPath, { density: 384 }).resize(size, size).png().toBuffer();
}

async function main() {
  mkdirSync(buildDir, { recursive: true });

  // 1024 master
  await sharp(await renderPng(1024)).toFile(path.join(buildDir, "icon.png"));
  console.log("✓ build/icon.png (1024×1024)");

  // macOS .iconset → .icns
  const iconset = mkdtempSync(path.join(tmpdir(), "ohsee-icon-")) + "/icon.iconset";
  mkdirSync(iconset, { recursive: true });
  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of variants) {
    await sharp(await renderPng(size)).toFile(path.join(iconset, name));
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(buildDir, "icon.icns")]);
  rmSync(path.dirname(iconset), { recursive: true, force: true });
  console.log("✓ build/icon.icns");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
