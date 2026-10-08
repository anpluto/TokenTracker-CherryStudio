param([string]$InstallDir = "$env:LOCALAPPDATA\Programs\TokenTracker")
. (Join-Path $PSScriptRoot 'cherrystudio-patch-common.ps1')
$patchRoot = Get-CherrySafeChild $CherryProjectRoot '.local-patch'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $patchRoot 'manifest.json') | ConvertFrom-Json
$installPath = Assert-CherryInstallation $InstallDir $manifest.baseVersion
$serverRoot = Get-CherrySafeChild $installPath 'EmbeddedServer/tokentracker'
$markerPath = Get-CherrySafeChild $serverRoot 'cherrystudio-patch.json'
if (Test-Path -LiteralPath $markerPath) {
    $current = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if ($current.patchId -ne $manifest.patchId) { throw 'Another custom patch is installed. Restore it before deploying this patch.' }
    foreach ($entry in $manifest.files) {
        $target = Get-CherrySafeChild $serverRoot $entry.relative
        if (-not (Test-Path -LiteralPath $target) -or (Get-CherryFileHash $target) -ne $entry.sha256) {
            throw 'An installed patch file changed. Restore the existing patch before redeploying.'
        }
    }
    Set-CherryUpdateProtection $current.backupDir
    Write-Output "Already installed: $($manifest.patchId). Automatic updates paused."
    return
}

# Validate all payload and baseline files before changing anything.
foreach ($entry in $manifest.files) {
    $payloadFile = Get-CherrySafeChild (Join-Path $patchRoot 'payload') $entry.relative
    if ((Get-CherryFileHash $payloadFile) -ne $entry.sha256) {
        throw "Payload checksum mismatch: $($entry.relative)"
    }
    $target = Get-CherrySafeChild $serverRoot $entry.relative
    if ($entry.baselineTextSha256 -and ((-not (Test-Path -LiteralPath $target)) -or (Get-CherryTextHash $target) -ne $entry.baselineTextSha256)) {
        throw "Installed source differs from official $($manifest.baseVersion): $($entry.relative). Nothing was deployed."
    }
    if ($entry.relative -eq 'src/lib/cherrystudio.js' -and (Test-Path -LiteralPath $target)) {
        throw 'An unmanaged Cherry Studio adapter already exists. Nothing was deployed.'
    }
}
$backupRoot = Get-CherrySafeChild $CherryProjectRoot '.deployment-backups'
$backupDir = Get-CherrySafeChild $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8))
[IO.Directory]::CreateDirectory($backupDir) | Out-Null
$backup = [ordered]@{ patchId = $manifest.patchId; baseVersion = $manifest.baseVersion; installDir = $installPath; files = @() }
foreach ($entry in $manifest.files) {
    $target = Get-CherrySafeChild $serverRoot $entry.relative
    $existed = Test-Path -LiteralPath $target
    $before = $null
    if ($existed) {
        $original = Get-CherrySafeChild $backupDir ('files/' + $entry.relative)
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($original)) | Out-Null
        Copy-Item -LiteralPath $target -Destination $original
        $before = Get-CherryFileHash $original
    }
    $backup.files += [ordered]@{ relative = $entry.relative; existed = [bool]$existed; beforeSha256 = $before; afterSha256 = $entry.sha256 }
}
$backup | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backupDir 'manifest.json') -Encoding UTF8
# Safety copy only: restoring program files must not discard newer usage from
# other tools. These local metadata backups are never uploaded or Git-tracked.
$usageRoot = Join-Path $env:USERPROFILE '.tokentracker/tracker'
foreach ($relative in @('queue.jsonl', 'queue.state.json', 'cursors.json', 'cursor-store', 'session.queue.jsonl', 'session.queue.jsonl.meta.json')) {
    $source = Get-CherrySafeChild $usageRoot $relative
    if (Test-Path -LiteralPath $source) {
        $destination = Get-CherrySafeChild $backupDir ('usage-state/' + $relative)
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
}
try {
    # Record the backup before replacing files so an interrupted deployment can
    # use the restore script, which accepts either original or patched bytes.
    [ordered]@{ patchId = $manifest.patchId; baseVersion = $manifest.baseVersion; backupDir = $backupDir } |
        ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
    Set-CherryUpdateProtection $backupDir
    foreach ($entry in $manifest.files) {
        $target = Get-CherrySafeChild $serverRoot $entry.relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        Copy-Item -LiteralPath (Get-CherrySafeChild (Join-Path $patchRoot 'payload') $entry.relative) -Destination $target -Force
    }
} catch {
    Restore-CherryBackupFiles $backupDir $serverRoot $backup
    Restore-CherryUpdateProtection $backupDir
    if (Test-Path -LiteralPath $markerPath) { Remove-Item -LiteralPath $markerPath -Force }
    throw
}
Write-Output "Installed $($manifest.patchId). Automatic updates paused. Backup: $backupDir. Start TokenTracker normally."
