"use strict";
// Rebuild from pinned public source. Never copy an installed application or
// local state into a distributable. Windows, Git and Node >=22 are required.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const config = require("../project.json");
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
if (process.platform !== "win32" || Number(process.versions.node.split(".")[0]) < 22) throw new Error("Build on Windows with Node 22 or newer.");
const patchPath = path.join(root, config.patch);
if (digest(patchPath) !== config.patchSha256) throw new Error("Source patch checksum mismatch.");
const buildRoot = path.join(root, ".build", crypto.randomUUID());
const upstream = path.join(buildRoot, "upstream");
fs.mkdirSync(buildRoot, { recursive: true });
// Do not let private Vite values or local alternate-database settings leak
// into a public build. Dependencies retain their public upstream defaults.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(VITE_|TOKENTRACKER_)/.test(key)));
env.TOKENTRACKER_BUILD_PET = "1";
function run(command, commandArgs, cwd = upstream) {
  const result = spawnSync(command, commandArgs, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
function readGit(commandArgs) {
  const result = spawnSync("git", commandArgs, { cwd: upstream, env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Cannot verify upstream checkout");
  return result.stdout.trim();
}
const localSource = option("--local-source");
if (localSource) {
  // Optional offline checkout: all content still comes from the exact pinned
  // Git commit, never from the local source's working files.
  run("git", ["clone", "--no-checkout", "--no-hardlinks", path.resolve(localSource), upstream], root);
  run("git", ["checkout", "--detach", config.upstreamCommit]);
} else {
  run("git", ["clone", "--depth", "1", "--branch", config.upstreamTag, config.upstream, upstream], root);
}
if (readGit(["rev-parse", "HEAD"]) !== config.upstreamCommit || readGit(["status", "--porcelain"])) throw new Error("Upstream is not the clean pinned commit.");
run("git", ["apply", "--check", "--binary", patchPath]);
run("git", ["apply", "--binary", patchPath]);
for (const name of ["deploy-cherrystudio.ps1", "restore-cherrystudio.ps1", "cherrystudio-patch-common.ps1"]) {
  fs.copyFileSync(path.join(root, "scripts", name), path.join(upstream, "scripts", name));
}
fs.copyFileSync(path.join(root, "test/deployment.test.cjs"), path.join(upstream, "test/cherrystudio-deployment.test.js"));
// npm.cmd is a batch file; invoke it with fixed, non-user-supplied commands.
const npm = (command) => run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command]);
// The patch never distributes root node_modules. Avoid unrelated archive
// codec native builds: the installed official runtime supplies those modules.
npm("npm.cmd ci --ignore-scripts --no-audit --no-fund");
npm("npm.cmd --prefix dashboard ci --no-audit --no-fund");
const backendTests = ["cherrystudio", "cherrystudio-verification", "cherrystudio-deployment", "session-analytics", "model-breakdown", "sync-background", "pricing", "architecture-guardrails"];
run(process.execPath, ["--test", ...backendTests.map((name) => `test/${name}.test.js`)]);
npm("npm.cmd --prefix dashboard test -- src/hooks/use-usage-model-breakdown.test.tsx src/lib/model-breakdown.test.ts src/ui/dashboard/components/__tests__/UsageOverview.test.jsx src/pages/SessionsPage.test.jsx");
npm("npm.cmd --prefix dashboard run typecheck");
npm("npm.cmd run validate:copy");
npm("npm.cmd run validate:locale");
run(process.execPath, ["scripts/validate-architecture-guardrails.cjs"]);
npm("npm.cmd --prefix dashboard run build");
run(process.execPath, ["scripts/prepare-cherrystudio-patch.cjs"]);
const manifestPath = path.join(upstream, ".local-patch", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.patchId !== config.patchId || manifest.baseCommit !== config.upstreamCommit) throw new Error("Unexpected prepared manifest");
const releaseRoot = path.join(root, ".release");
const stage = path.join(releaseRoot, `stage-${crypto.randomUUID()}`, config.releaseName);
fs.mkdirSync(path.join(stage, "scripts"), { recursive: true });
const publicFiles = ["README.md", "README.en.md", "LICENSE", "NOTICE.md", "Deploy.cmd", "Restore.cmd", "Verify.cmd", "project.json"];
for (const relative of publicFiles) fs.copyFileSync(path.join(root, relative), path.join(stage, relative));
fs.cpSync(path.join(root, "licenses"), path.join(stage, "licenses"), { recursive: true });
require("./dependency-notices.cjs").writeDependencyNotices(path.join(upstream, "dashboard/node_modules"),
  path.join(stage, "licenses/TokenTracker-dashboard-dependencies.json"));
for (const name of ["deploy-cherrystudio.ps1", "restore-cherrystudio.ps1", "protect-cherrystudio-updates.ps1", "cherrystudio-patch-common.ps1", "verify-cherrystudio.ps1", "verify-cherrystudio.cjs"]) {
  fs.copyFileSync(path.join(root, "scripts", name), path.join(stage, "scripts", name));
}
fs.cpSync(path.join(upstream, ".local-patch"), path.join(stage, ".local-patch"), { recursive: true });
fs.mkdirSync(path.join(stage, "patches"));
fs.copyFileSync(patchPath, path.join(stage, config.patch));
fs.writeFileSync(path.join(stage, "BUILD.json"), JSON.stringify({ patchId: config.patchId,
  upstreamCommit: config.upstreamCommit, patchSha256: config.patchSha256, nodeVersion: process.versions.node }, null, 2) + "\n");
const zip = path.join(releaseRoot, `${config.releaseName}.zip`);
run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts/package-release.ps1"), "-StageDir", stage, "-OutputZip", zip], root);
fs.writeFileSync(`${zip}.sha256`, `${digest(zip)}  ${path.basename(zip)}\n`);
fs.writeFileSync(path.join(releaseRoot, "last-build.json"), JSON.stringify({ upstream, stage, zip }, null, 2) + "\n");
console.log(`Ready: ${zip}`);
