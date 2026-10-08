# r5 validation

Validated on Windows with the official bundled Node.js 22.22.2 runtime. Base source was checked out cleanly at the pinned v1.1.5 commit before applying the source patch and installing lockfile dependencies.

- 179 relevant backend tests passed, including the invocation adapter, WAL, repeat sync, pricing/session cache and deployment recovery.
- 49 related dashboard tests passed, including same-context cache retention, HTTP-success/database-unavailable responses after restart, successful empty responses, device identity changes, date/timezone isolation and visible cache labels.
- Type checking, copy registry, Chinese locale coverage and architecture checks passed.
- Standalone repository tests passed, including deployment rollback/restore, patch checksum and multiple dependency license notices.
- The actual release ZIP was extracted and all three CMD entrypoints executed against a custom installation path containing spaces. Deployment, repeated deployment, exact restoration, original update preference restoration and empty-ledger verification passed. Unsupported versions and altered payload checksums were refused before deployment.
- A clone of this standalone Git repository retained the exact source-patch checksum. `.gitattributes` prevents patch newline conversion.

Only synthetic test metadata is included in the public source. Private application state, deployment backups and local diagnostics are excluded from Git and the release package. These checks cover this Windows 1.1.5 patch; they are not a claim that every upstream TokenTracker test passes on every platform.
