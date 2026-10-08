"use strict";
const fs = require("node:fs");
const path = require("node:path");
function writeDependencyNotices(nodeModules, output) {
  const notices = new Map();
  function visitPackage(dir) {
    const packagePath = path.join(dir, "package.json");
    if (!fs.existsSync(packagePath)) return;
    const value = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const licenseFiles = fs.readdirSync(dir).filter((name) => /^(license|licence|copying)([-_.].*)?$/i.test(name) && fs.statSync(path.join(dir, name)).isFile());
    notices.set(`${value.name}@${value.version}`, { name: value.name, version: value.version,
      license: value.license || value.licenses || "See upstream", repository: value.repository || null,
      licenseTexts: licenseFiles.map((name) => ({ file: name, text: fs.readFileSync(path.join(dir, name), "utf8") })) });
    visitModules(path.join(dir, "node_modules"));
  }
  function visitModules(dir) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!item.isDirectory() || item.name.startsWith(".")) continue;
      const next = path.join(dir, item.name);
      if (item.name.startsWith("@")) for (const name of fs.readdirSync(next)) visitPackage(path.join(next, name));
      else visitPackage(next);
    }
  }
  visitModules(nodeModules);
  fs.writeFileSync(output, JSON.stringify([...notices.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)), null, 2) + "\n");
}
module.exports = { writeDependencyNotices };
