# TokenTracker-CherryStudio

[简体中文](README.md)

Unofficial Windows patch adding Cherry Studio (CherryStudio) token usage, model estimates, chat/Agent sessions and local API platform names to TokenTracker.

**Supports TokenTracker 1.1.5 on Windows only.** Revision: `cherrystudio-1.1.5-r5`. Tested with Cherry Studio 2.0.14's SQLite invocation ledger. This is a patch, not a full installer or an official plugin.

## Install

1. Get `TokenTracker-Setup.exe` or `TokenTracker-win-x64.zip` from the [official v1.1.5 release](https://github.com/xiufengsun/TokenTracker/releases/tag/v1.1.5). Do not downgrade an existing newer installation to force compatibility.
2. Download `TokenTracker-CherryStudio-1.1.5-r5-Windows.zip` from [this project's Releases](https://github.com/anpluto/TokenTracker-CherryStudio/releases). The automatic **Source code (zip)** archive is not deployable.
3. Extract to a permanent folder. Completely quit TokenTracker from its tray menu, then double-click `Deploy.cmd`.
4. Reopen the same installation and choose **Sync Now**. Expand Cherry Studio in usage details and select it on the sessions page.

End users need no Git, Node.js or npm. The default target is `%LOCALAPPDATA%\Programs\TokenTracker`. Custom/portable installations:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

The directory must contain `TokenTracker.exe` and `EmbeddedServer`. Ensure shortcuts point to the patched installation. Use an elevated terminal only when that installation's directory requires it.

Deployment verifies the supported version, baseline and payload checksums before backing up and replacing the backend/dashboard. **It disables automatic updates while patched.** It rolls back failed deployments and accepts repeated deployment of the same patch.

## Verify, restore and upgrade

Once Cherry Studio has created its database, run `Verify.cmd`, or the following for a custom target. An empty ledger reports zero normally; concurrent replies can invalidate a comparison, so retry after they finish. Verification reads the database and writes only a temporary queue.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

Quit TokenTracker and run `Restore.cmd` (or the command below) to restore program files and the original update preference while keeping newer usage data.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-cherrystudio.ps1 -InstallDir 'D:\Apps\TokenTracker'
```

**Keep the extracted directory and `.deployment-backups` in place: do not rename, move or delete them while deployed.** Backups belong to that computer and installation. To update the patch, restore using the previous deployment directory first. Before an official upgrade, restore, install the official update, then wait for a compatible patch. Never overwrite a newer version with an older patch.

## Behavior and privacy

Only `invocation` rows from Cherry Studio's `ai_usage_record` are counted. No Agent-log overlay, legacy aggregate or old-log backfill. Default database: `%APPDATA%\CherryStudio\Data\cherrystudio.sqlite`; override with `TOKENTRACKER_CHERRYSTUDIO_DB` before starting TokenTracker.

Cached input is separated from regular input; reasoning is already included in output and is not billed twice. Costs use TokenTracker's model pricing, not the API platform's actual invoice. Unknown pricing/incomplete counters are flagged.

Chat/Agent titles, identifiers and platform names remain local. No prompt/response bodies, API keys or provider settings are read. These metadata never enter the usage queue or existing cloud/CSV session summaries. TokenTracker's existing cloud-sync setting still governs numerical uploads and is not changed by deployment.

Account totals remain authoritative. Local labels are explicitly observations from this computer, not other devices' attribution. Temporary local failures retain same-context labels marked cached; successful empty reads remove old labels.

Deployment backups can contain local usage/session metadata: never upload them or attach them to a public issue. Share versions and redacted errors instead.

## Rebuild

The repository includes deploy/restore/verify scripts, tests, and a readable source patch. Base source is [official TokenTracker](https://github.com/xiufengsun/TokenTracker), pinned to `d7274599df793f970b9a6559a1882ff7d5b1e7f2`.

On Windows with Git, Node 22+ and internet access:

```powershell
node --test test/*.test.cjs
node scripts/build-release.cjs
node scripts/test-release.cjs
```

The builder checks the patch hash and clean base commit, applies the patch, installs lockfile dependencies, runs relevant backend/UI tests, type/copy/locale/architecture checks, and builds the dashboard with native pet/quota entrypoints. ZIP and SHA-256 output: `.release`. `--local-source <repository>` can obtain the same pinned Git commit locally; dependency installation still needs network initially.

See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). This project is not affiliated with or endorsed by TokenTracker or Cherry Studio.

Root dependency installation skips lifecycle scripts for unrelated native archive codecs. No node_modules are distributed; the separately installed official runtime supplies existing backend dependencies.
