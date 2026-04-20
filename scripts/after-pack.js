/**
 * electron-builder afterPack hook — electron-builder's file-handling strips
 * `node_modules` directories from extraResources (dedup heuristic), but the
 * Next.js standalone bundle needs its own traced `node_modules` at runtime.
 * This hook copies it in after the packer is done.
 */
const fs = require("fs");
const path = require("path");

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await fs.promises.readlink(srcPath);
      await fs.promises.symlink(target, destPath);
    } else if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;
  const source = path.resolve(packager.info.projectDir, "electron-build", "node_modules");
  const dest = path.join(
    appOutDir,
    `${appName}.app`,
    "Contents",
    "Resources",
    "app.standalone",
    "node_modules",
  );

  if (!fs.existsSync(source)) {
    console.log(`[afterPack] skip — no electron-build/node_modules at ${source}`);
    return;
  }
  if (fs.existsSync(dest)) {
    console.log(`[afterPack] skip — app.standalone/node_modules already exists`);
    return;
  }

  console.log(`[afterPack] copying standalone node_modules → ${dest}`);
  await copyDir(source, dest);
  console.log(`[afterPack] done`);
};
