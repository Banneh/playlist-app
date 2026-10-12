/* electron-builder afterPack hook: ad-hoc sign the macOS app bundle.
   Without a paid Developer ID there is nothing to notarize, but a complete ad-hoc
   signature still matters: an app whose seal is missing or broken gets macOS's
   "damaged, move to Bin" dialog, which can only be fixed from Terminal. A properly
   sealed ad-hoc app gets the "Apple couldn't verify" dialog instead, which users can
   get past in System Settings → Privacy & Security → Open Anyway. */
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const sign = (p, extra = []) => execFileSync("codesign", ["--force", "--sign", "-", "--timestamp=none", ...extra, p], { stdio: "inherit" });
  // helper binaries that live outside the standard bundle locations: sign them first,
  // then the bundle itself (inside-out, like codesign expects)
  const unpacked = path.join(app, "Contents", "Resources", "app.asar.unpacked", "node_modules");
  for (const bin of [["ffmpeg-static", "ffmpeg"], ["ffprobe-static", "bin", "darwin", context.arch === 3 ? "arm64" : "x64", "ffprobe"]]) {
    const p = path.join(unpacked, ...bin);
    try { sign(p); } catch (e) { console.warn("  • could not sign", p, e.message); }
  }
  sign(app, ["--deep", "--options", "runtime", "--entitlements", path.join(__dirname, "entitlements.plist")]);
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" });
  console.log("  • ad-hoc signed", path.basename(app));
};
