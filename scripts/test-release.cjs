"use strict";
// Exercise scripts from the actual ZIP against an isolated custom installation.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "..");
const config = require("../project.json");
const build = JSON.parse(fs.readFileSync(path.join(root, ".release/last-build.json"), "utf8"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cherry-release-"));
const release = path.join(temp, "Deployment with spaces");
const app = path.join(temp, "Custom App");
const server = path.join(app, "EmbeddedServer/tokentracker");
const profile = path.join(temp, "profile");
const env = { ...process.env, USERPROFILE: profile, HOME: profile, LOCALAPPDATA: path.join(profile, "AppData/Local"), APPDATA: path.join(profile, "AppData/Roaming") };
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function run(script, success = true, wrapper = null) {
  const command = wrapper ? process.env.ComSpec || "cmd.exe" : "powershell.exe";
  // All interpolated paths are controlled temporary fixture paths, quoted for
  // cmd; filesystem operations stay within the PowerShell deployment scripts.
  const args = wrapper ? ["/d", "/s", "/c", `""${path.join(release, wrapper)}" -InstallDir "${app}" < nul"`]
    : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(release, "scripts", script), "-InstallDir", app];
  const result = spawnSync(command, args, {
    env, encoding: "utf8", windowsHide: true, windowsVerbatimArguments: Boolean(wrapper), timeout: 45000,
  });
  if (result.error) throw result.error;
  if (success) assert.equal(result.status, 0, result.stdout + result.stderr);
  else assert.notEqual(result.status, 0, "Expected refusal");
  return result.stdout;
}
function inventory(dir, prefix = "", values = {}) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isDirectory()) inventory(path.join(dir, item.name), relative, values);
    else values[relative] = hash(path.join(dir, item.name));
  }
  return values;
}
try {
  const checksum = fs.readFileSync(`${build.zip}.sha256`, "utf8").split(/\s/)[0];
  assert.equal(hash(build.zip), checksum);
  const extract = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:TT_TEST_ZIP, $env:TT_TEST_RELEASE)"], {
    env: { ...env, TT_TEST_ZIP: build.zip, TT_TEST_RELEASE: release }, encoding: "utf8", windowsHide: true,
  });
  assert.equal(extract.status, 0, extract.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(release, ".local-patch/manifest.json"), "utf8"));
  assert.equal(manifest.patchId, config.patchId);
  assert.equal(JSON.parse(fs.readFileSync(path.join(release, "project.json"))).patchSha256, config.patchSha256, "ZIP is from an older source patch");
  assert.equal(hash(path.join(release, config.patch)), config.patchSha256);
  const allowed = new Set(["README.md", "README.en.md", "LICENSE", "NOTICE.md", "Deploy.cmd", "Restore.cmd", "Verify.cmd", "project.json", "BUILD.json", ".local-patch", "licenses", "patches", "scripts"]);
  assert(fs.readdirSync(release).every((name) => allowed.has(name)), "Unexpected ZIP entry");
  assert.deepEqual(fs.readdirSync(path.join(release, ".local-patch")).sort(), ["manifest.json", "payload"]);
  for (const entry of manifest.files) assert.equal(hash(path.join(release, ".local-patch/payload", entry.relative)), entry.sha256);
  fs.mkdirSync(server, { recursive: true });
  // All supporting backend modules are copied from the clean reconstructed
  // source, then patched baseline files are restored to their official bytes.
  fs.cpSync(path.join(build.upstream, "src"), path.join(server, "src"), { recursive: true });
  fs.rmSync(path.join(server, "src/lib/cherrystudio.js"));
  for (const entry of manifest.files.filter((value) => value.baselineTextSha256)) {
    const original = spawnSync("git", ["show", `${config.upstreamCommit}:${entry.relative}`], { cwd: build.upstream, windowsHide: true });
    assert.equal(original.status, 0);
    fs.writeFileSync(path.join(server, entry.relative), original.stdout);
  }
  const packagePath = path.join(server, "package.json");
  fs.writeFileSync(packagePath, JSON.stringify({ version: "1.1.5" }));
  fs.writeFileSync(path.join(app, "TokenTracker.exe"), "synthetic test executable");
  fs.copyFileSync(process.execPath, path.join(app, "EmbeddedServer/node.exe"));
  fs.mkdirSync(path.join(server, "dashboard/dist"), { recursive: true });
  fs.writeFileSync(path.join(server, "dashboard/dist/index.html"), "synthetic original dashboard");
  const settings = path.join(env.LOCALAPPDATA, "TokenTracker/native-settings.json");
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  const settingsBefore = { Theme: "dark", "UpdateChecker.autoUpdateEnabled": true };
  fs.writeFileSync(settings, JSON.stringify(settingsBefore));
  const baseline = inventory(app);
  fs.writeFileSync(packagePath, JSON.stringify({ version: "1.1.13" }));
  const newer = inventory(app);
  run("deploy-cherrystudio.ps1", false, "Deploy.cmd");
  assert.deepEqual(inventory(app), newer);
  fs.writeFileSync(packagePath, JSON.stringify({ version: "1.1.5" }));
  run("deploy-cherrystudio.ps1", true, "Deploy.cmd");
  assert.match(run("deploy-cherrystudio.ps1", true, "Deploy.cmd"), /Already installed/);
  assert.equal(JSON.parse(fs.readFileSync(settings))["UpdateChecker.autoUpdateEnabled"], false);
  const dbPath = path.join(temp, "empty.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE ai_usage_record (id TEXT, request_id TEXT, record_kind TEXT, created_at INTEGER,
    input_tokens INTEGER, output_tokens INTEGER, no_cache_tokens INTEGER, cache_read_tokens INTEGER,
    cache_write_tokens INTEGER, reasoning_tokens INTEGER, total_tokens INTEGER)`);
  db.close();
  env.TOKENTRACKER_CHERRYSTUDIO_DB = dbPath;
  const verificationText = run("verify-cherrystudio.ps1", true, "Verify.cmd");
  const verification = JSON.parse(verificationText.slice(verificationText.indexOf("{"), verificationText.lastIndexOf("}") + 1));
  assert.equal(verification.verified, true);
  assert.equal(verification.requests, 0);
  run("restore-cherrystudio.ps1", true, "Restore.cmd");
  assert.deepEqual(inventory(app), baseline);
  assert.deepEqual(JSON.parse(fs.readFileSync(settings)), settingsBefore);
  const payloadFile = path.join(release, ".local-patch/payload", manifest.files[0].relative);
  fs.appendFileSync(payloadFile, "tampered fixture");
  run("deploy-cherrystudio.ps1", false);
  assert.deepEqual(inventory(app), baseline);
  const report = { verified: true, payloadFiles: manifest.files.length, customPathWithSpaces: true,
    repeatedDeploy: true, exactRestore: true, restoredUpdatePreference: true, unsupportedVersionRefused: true,
    badChecksumRefused: true, emptyLedgerVerification: true };
  report.cmdEntrypointsVerified = true;
  fs.writeFileSync(path.join(root, ".release/release-validation.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  const resolved = path.resolve(temp);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unsafe fixture cleanup");
  fs.rmSync(resolved, { recursive: true, force: true });
}
