"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const windowsOnly = { skip: process.platform !== "win32" };
const digest = (data) => crypto.createHash("sha256").update(data).digest("hex");
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

function inventory(dir, base = dir, result = {}) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) inventory(file, base, result);
    else result[path.relative(base, file)] = digest(fs.readFileSync(file));
  }
  return result;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cherry-deployment-"));
  const scripts = path.join(root, "scripts");
  const app = path.join(root, "app");
  const server = path.join(app, "EmbeddedServer", "tokentracker");
  const payload = path.join(root, ".local-patch", "payload");
  const profile = path.join(root, "profile");
  const localAppData = path.join(profile, "AppData", "Local");
  const settings = path.join(localAppData, "TokenTracker", "native-settings.json");
  const marker = path.join(server, "cherrystudio-patch.json");
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(server, { recursive: true });
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, JSON.stringify({ Theme: "dark", "UpdateChecker.autoUpdateEnabled": true }));
  for (const name of ["deploy-cherrystudio.ps1", "restore-cherrystudio.ps1", "cherrystudio-patch-common.ps1"]) {
    fs.copyFileSync(path.join(__dirname, "..", "scripts", name), path.join(scripts, name));
  }
  fs.writeFileSync(path.join(app, "TokenTracker.exe"), "fixture-only");
  fs.writeFileSync(path.join(server, "package.json"), JSON.stringify({ version: "1.1.5" }));
  const files = ["src/commands/sync.js", "src/lib/local-api.js", "src/lib/cherrystudio.js"].map((relative, i) => {
    const original = `original ${i}\n`;
    const updated = `patched ${i}\n`;
    const target = path.join(server, relative);
    const source = path.join(payload, relative);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, updated);
    if (i < 2) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, original);
    }
    return { relative, sha256: digest(updated), baselineTextSha256: i < 2 ? digest(original) : null };
  });
  fs.writeFileSync(path.join(root, ".local-patch", "manifest.json"), JSON.stringify({ patchId: "test-cherry", baseVersion: "1.1.5", files }));
  const baseline = inventory(app);
  const env = { ...process.env, USERPROFILE: profile, LOCALAPPDATA: localAppData };
  function run(name, success = true) {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scripts, name), "-InstallDir", app], {
      env, encoding: "utf8", windowsHide: true, timeout: 30000,
    });
    if (result.error) throw result.error;
    if (success) assert.equal(result.status, 0, result.stdout + result.stderr);
    else assert.notEqual(result.status, 0, "Expected operation to be refused");
    return result.stdout + result.stderr;
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { app, server, settings, marker, baseline, run, files };
}

test("Cherry deployment is idempotent and restores bytes and the prior update preference", windowsOnly, (t) => {
  const f = fixture(t);
  f.run("deploy-cherrystudio.ps1");
  assert.equal(json(f.settings)["UpdateChecker.autoUpdateEnabled"], false);
  assert.match(f.run("deploy-cherrystudio.ps1"), /Already installed/);
  fs.writeFileSync(f.settings, JSON.stringify({ ...json(f.settings), Theme: "light" }));
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
  assert.deepEqual(json(f.settings), { Theme: "light", "UpdateChecker.autoUpdateEnabled": true });
});

test("Cherry restore rejects a damaged later backup before changing any installed file", windowsOnly, (t) => {
  const f = fixture(t);
  f.run("deploy-cherrystudio.ps1");
  const backup = path.join(json(f.marker).backupDir, "files", f.files[1].relative);
  const original = fs.readFileSync(backup);
  fs.appendFileSync(backup, "damaged");
  const installed = inventory(f.app);
  const settings = fs.readFileSync(f.settings);
  assert.match(f.run("restore-cherrystudio.ps1", false), /Backup checksum mismatch/);
  assert.deepEqual(inventory(f.app), installed);
  assert.deepEqual(fs.readFileSync(f.settings), settings);
  fs.writeFileSync(backup, original);
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
});

test("Cherry restore tolerates a subsequently deleted native settings file", windowsOnly, (t) => {
  const f = fixture(t);
  f.run("deploy-cherrystudio.ps1");
  fs.unlinkSync(f.settings);
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
  assert.equal(fs.existsSync(f.settings), false);
});

test("Cherry restore validates malformed native settings before restoring program files", windowsOnly, (t) => {
  const f = fixture(t);
  f.run("deploy-cherrystudio.ps1");
  const valid = fs.readFileSync(f.settings);
  const installed = inventory(f.app);
  for (const invalid of ["malformed-json", "null", "", "[]", '[{"Theme":"light"}]']) {
    fs.writeFileSync(f.settings, invalid);
    f.run("restore-cherrystudio.ps1", false);
    assert.deepEqual(inventory(f.app), installed);
  }
  fs.writeFileSync(f.settings, valid);
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
});

test("Cherry restore can be retried after an installed file was locked mid-restoration", windowsOnly, (t) => {
  const f = fixture(t);
  f.run("deploy-cherrystudio.ps1");
  const scripts = path.join(path.dirname(f.app), "scripts");
  fs.writeFileSync(path.join(scripts, "restore-with-lock.ps1"), `
    param([string]$InstallDir)
    $ErrorActionPreference = 'Stop'
    $target = Join-Path $InstallDir 'EmbeddedServer/tokentracker/src/lib/local-api.js'
    $stream = [IO.File]::OpenRead($target)
    try { & (Join-Path $PSScriptRoot 'restore-cherrystudio.ps1') -InstallDir $InstallDir }
    finally { $stream.Dispose() }
  `);
  f.run("restore-with-lock.ps1", false);
  assert.equal(digest(fs.readFileSync(path.join(f.server, f.files[0].relative))), f.files[0].baselineTextSha256);
  assert.equal(digest(fs.readFileSync(path.join(f.server, f.files[1].relative))), f.files[1].sha256);
  assert.equal(fs.existsSync(f.marker), true);
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
  assert.equal(json(f.settings)["UpdateChecker.autoUpdateEnabled"], true);
});

test("Cherry failed deployment rolls back files and update settings even when an original file is locked", windowsOnly, (t) => {
  const f = fixture(t);
  const scripts = path.join(path.dirname(f.app), "scripts");
  fs.writeFileSync(path.join(scripts, "deploy-with-lock.ps1"), `
    param([string]$InstallDir)
    $ErrorActionPreference = 'Stop'
    $target = Join-Path $InstallDir 'EmbeddedServer/tokentracker/src/lib/local-api.js'
    $stream = [IO.File]::OpenRead($target)
    try { & (Join-Path $PSScriptRoot 'deploy-cherrystudio.ps1') -InstallDir $InstallDir }
    finally { $stream.Dispose() }
  `);
  f.run("deploy-with-lock.ps1", false);
  assert.deepEqual(inventory(f.app), f.baseline);
  assert.equal(json(f.settings)["UpdateChecker.autoUpdateEnabled"], true);
  f.run("deploy-cherrystudio.ps1");
  f.run("restore-cherrystudio.ps1");
  assert.deepEqual(inventory(f.app), f.baseline);
});

test("Cherry deployment and restore refuse upgraded or subsequently edited program files", windowsOnly, (t) => {
  const f = fixture(t);
  const packagePath = path.join(f.server, "package.json");
  const originalPackage = fs.readFileSync(packagePath);
  fs.writeFileSync(packagePath, JSON.stringify({ version: "1.1.6" }));
  const upgraded = inventory(f.app);
  f.run("deploy-cherrystudio.ps1", false);
  assert.deepEqual(inventory(f.app), upgraded);
  fs.writeFileSync(packagePath, originalPackage);
  f.run("deploy-cherrystudio.ps1");
  fs.appendFileSync(path.join(f.server, f.files[0].relative), "user edit");
  const edited = inventory(f.app);
  f.run("restore-cherrystudio.ps1", false);
  assert.deepEqual(inventory(f.app), edited);
});
