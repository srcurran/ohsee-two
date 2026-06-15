/**
 * electron-builder afterPack hook — electron-builder's file-handling strips
 * `node_modules` directories from extraResources (dedup heuristic), but the
 * Next.js standalone bundle needs its own traced `node_modules` at runtime.
 * This hook copies it in after the packer is done.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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
  const { appOutDir, packager, electronPlatformName } = context;
  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  // 1) Reinsert the Next standalone node_modules (electron-builder's dedup
  //    heuristic strips it from extraResources, but the bundle needs it at
  //    runtime).
  const source = path.resolve(packager.info.projectDir, "electron-build", "node_modules");
  const dest = path.join(appPath, "Contents", "Resources", "app.standalone", "node_modules");
  if (!fs.existsSync(source)) {
    console.log(`[afterPack] skip node_modules copy — none at ${source}`);
  } else if (fs.existsSync(dest)) {
    console.log(`[afterPack] skip node_modules copy — already present`);
  } else {
    console.log(`[afterPack] copying standalone node_modules → ${dest}`);
    await copyDir(source, dest);
    console.log(`[afterPack] node_modules copied`);
  }

  // 2) Ad-hoc code-sign the bundle. We pack with identity=null (no Apple
  //    Developer cert), so electron-builder SKIPS signing — but Apple Silicon
  //    refuses to launch an unsigned / invalidly-sealed app ("damaged, can't
  //    be opened"). A self-signed ad-hoc signature ("-") satisfies the kernel
  //    for local use. Must run AFTER the node_modules copy so the seal covers
  //    it, and here in afterPack (before the DMG is built) so the disk image
  //    ships the signed app too.
  if (electronPlatformName === "darwin") {
    console.log(`[afterPack] ad-hoc code-signing ${appPath}`);
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
    console.log(`[afterPack] code-signing done`);
  }
};
