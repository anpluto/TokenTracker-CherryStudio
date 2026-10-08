# Publishing checklist

The working repository and release assets are prepared locally; no remote is created or pushed by the build scripts.

Target: public `anpluto/TokenTracker-CherryStudio`, default branch `main`. Description and topics are recorded in `project.json`. Describe this as an unofficial patch and include both TokenTracker and Cherry Studio / CherryStudio in the About section and README.

Before publishing, run repository tests, clean rebuild and extracted-package tests. Review the tracked file list and the release ZIP allowlist. Do not upload `.build`, `.deployment-backups`, private configuration, usage databases/queues or local diagnostics. `.release` itself is ignored by Git.

Push the reviewed repository and tag `cherrystudio-1.1.5-r5`. Create a release for that exact commit and attach these two files:

- `TokenTracker-CherryStudio-1.1.5-r5-Windows.zip`
- `TokenTracker-CherryStudio-1.1.5-r5-Windows.zip.sha256`

Release notes must say Windows / TokenTracker 1.1.5 only, explain automatic updates are paused, link the official v1.1.5 downloads, and direct users to Deploy.cmd / Restore.cmd. The generated Source code archive is not a deployment package. Future official versions need a new pinned base, patch revision and validation first.

GitHub topics: `tokentracker`, `cherry-studio`, `token-usage`, `windows`, `powershell`. These help discovery but do not guarantee search placement. CI uploads build artifacts only; it does not publish releases automatically.
