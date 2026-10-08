"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const root = path.resolve(__dirname, "..");
const config = require("../project.json");
test("source patch matches the pinned project checksum and contains no machine-specific documents", () => {
  const patch = fs.readFileSync(path.join(root, config.patch));
  assert.equal(crypto.createHash("sha256").update(patch).digest("hex"), config.patchSha256);
  assert.equal(config.upstreamCommit, "d7274599df793f970b9a6559a1882ff7d5b1e7f2");
  const text = patch.toString("utf8");
  assert(!/Migrated[\\/]PC\d|CodexWork|deployment-backups\/20|relay-cookies\.json.*token/i.test(text));
  const files = [...text.matchAll(/^diff --git a\/(.+?) b\//gm)].map((match) => match[1]);
  assert(files.length > 0);
  assert(files.every((file) => /^(src\/|dashboard\/(src\/|public\/brand-logos\/)|test\/cherrystudio|scripts\/(prepare-cherrystudio-patch|verify-cherrystudio))/.test(file)));
});
test("dependency notices include multiple license texts with named suffixes", (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tt-notices-"));
  t.after(() => {
    assert(path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(scratch, { recursive: true, force: true });
  });
  const pkg = path.join(scratch, "node_modules/example");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "synthetic-example", version: "1.0.0", license: "MIT OR BSD-2-Clause" }));
  fs.writeFileSync(path.join(pkg, "LICENSE-MIT.txt"), "Synthetic MIT notice");
  fs.writeFileSync(path.join(pkg, "LICENSE-BSD"), "Synthetic BSD notice");
  const output = path.join(scratch, "notices.json");
  require("../scripts/dependency-notices.cjs").writeDependencyNotices(path.join(scratch, "node_modules"), output);
  const notices = JSON.parse(fs.readFileSync(output));
  assert.equal(notices[0].licenseTexts.length, 2);
  assert.deepEqual(notices[0].licenseTexts.map((entry) => entry.text).sort(), ["Synthetic BSD notice", "Synthetic MIT notice"]);
});
test("the source archive is clearly distinguished from the deployment package", () => {
  assert.match(fs.readFileSync(path.join(root, "README.en.md"), "utf8"), /Source code \(zip\)/);
  assert.match(fs.readFileSync(path.join(root, "README.md"), "utf8"), /1\.1\.5/);
});
