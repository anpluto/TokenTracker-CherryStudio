Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$CherryProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Get-CherrySafeChild([string]$Root, [string]$Relative) {
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $targetPath = [IO.Path]::GetFullPath((Join-Path $rootPath $Relative))
    if (-not $targetPath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path leaves the expected directory: $Relative"
    }
    return $targetPath
}

function Get-CherryTextHash([string]$Path) {
    $text = [IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant()
    } finally { $algorithm.Dispose() }
}

function Get-CherryFileHash([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Assert-CherryInstallation([string]$InstallDir, [string]$Version) {
    $installPath = (Resolve-Path -LiteralPath $InstallDir).Path
    $packagePath = Get-CherrySafeChild $installPath 'EmbeddedServer/tokentracker/package.json'
    if (-not (Test-Path -LiteralPath (Get-CherrySafeChild $installPath 'TokenTracker.exe'))) {
        throw 'The selected directory is not a TokenTracker Windows installation.'
    }
    $installedVersion = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
    if ($installedVersion -ne $Version) {
        throw "Unsupported TokenTracker version $installedVersion (expected $Version). Merge and test the new upstream version before deploying."
    }
    $running = Get-Process -Name TokenTracker -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and [IO.Path]::GetFullPath($_.Path).Equals((Join-Path $installPath 'TokenTracker.exe'), [StringComparison]::OrdinalIgnoreCase)
    }
    if ($running) { throw 'Quit TokenTracker from its tray menu before deploying or restoring.' }
    $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    $serverRoot = Get-CherrySafeChild $installPath 'EmbeddedServer/tokentracker'
    foreach ($nodeProcess in $nodeProcesses) {
        if ($nodeProcess.CommandLine -and $nodeProcess.CommandLine.IndexOf($serverRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            throw 'The installed TokenTracker backend is still running. Quit it before deploying or restoring.'
        }
    }
    return $installPath
}

function Restore-CherryBackupFiles([string]$BackupDir, [string]$ServerRoot, $Backup) {
    # Validate the entire backup before the first copy/delete. A damaged later
    # file must not leave an installation partially restored and un-restorable.
    foreach ($entry in $Backup.files) {
        Get-CherrySafeChild $ServerRoot $entry.relative | Out-Null
        if ($entry.existed) {
            $original = Get-CherrySafeChild $BackupDir ('files/' + $entry.relative)
            if ((Get-CherryFileHash $original) -ne $entry.beforeSha256) {
                throw "Backup checksum mismatch: $($entry.relative)"
            }
        }
    }
    foreach ($entry in $Backup.files) {
        $target = Get-CherrySafeChild $ServerRoot $entry.relative
        if ($entry.existed) {
            $original = Get-CherrySafeChild $BackupDir ('files/' + $entry.relative)
            # During deployment rollback a locked target can still be exactly
            # the original. Recopying it would fail and strand update settings.
            if ((Test-Path -LiteralPath $target) -and (Get-CherryFileHash $target) -eq $entry.beforeSha256) { continue }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            Copy-Item -LiteralPath $original -Destination $target -Force
        } elseif (Test-Path -LiteralPath $target) {
            # Every deletion is a single validated file beneath the server root.
            Remove-Item -LiteralPath $target -Force
        }
    }
}

function Get-CherryNativeSettings([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{} }
    $content = [IO.File]::ReadAllText($Path)
    if (-not $content.TrimStart().StartsWith('{')) { throw 'Native settings must be a JSON object.' }
    $settings = $content | ConvertFrom-Json
    if ($null -eq $settings -or -not ($settings -is [pscustomobject])) { throw 'Native settings must be a JSON object.' }
    return $settings
}

function Set-CherryUpdateProtection([string]$BackupDir) {
    $manifestPath = Get-CherrySafeChild $BackupDir 'manifest.json'
    $saved = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    $settingsPath = Get-CherrySafeChild $env:LOCALAPPDATA 'TokenTracker/native-settings.json'
    $settings = Get-CherryNativeSettings $settingsPath
    $key = 'UpdateChecker.autoUpdateEnabled'
    if (-not $saved.PSObject.Properties['nativeAutoUpdate']) {
        $original = $settings.PSObject.Properties[$key]
        if (Test-Path -LiteralPath $settingsPath) {
            Copy-Item -LiteralPath $settingsPath -Destination (Get-CherrySafeChild $BackupDir 'native-settings.before.json')
        }
        $value = if ($original) { $original.Value } else { $null }
        $saved | Add-Member -NotePropertyName nativeAutoUpdate -NotePropertyValue ([ordered]@{
            path = $settingsPath; key = $key; wasPresent = [bool]$original; previousValue = $value
        })
        [IO.File]::WriteAllText($manifestPath, ($saved | ConvertTo-Json -Depth 8))
    }
    $settings | Add-Member -NotePropertyName $key -NotePropertyValue $false -Force
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($settingsPath)) | Out-Null
    [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 8))
}

function Restore-CherryUpdateProtection([string]$BackupDir, [switch]$ValidateOnly) {
    $saved = Get-Content -Raw -LiteralPath (Get-CherrySafeChild $BackupDir 'manifest.json') | ConvertFrom-Json
    if (-not $saved.PSObject.Properties['nativeAutoUpdate']) { return }
    $state = $saved.nativeAutoUpdate
    $expectedPath = Get-CherrySafeChild $env:LOCALAPPDATA 'TokenTracker/native-settings.json'
    if (-not $state.path.Equals($expectedPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Native settings backup belongs to another user profile.' }
    # A subsequently deleted settings file is an explicit change, like a
    # subsequently edited value. Do not recreate it or fail after restoring files.
    if (-not (Test-Path -LiteralPath $expectedPath)) { return }
    $settings = Get-CherryNativeSettings $expectedPath
    if ($ValidateOnly) { return }
    $current = $settings.PSObject.Properties[$state.key]
    # Restore only the managed false value; preserve a subsequent explicit edit.
    if ($current -and $current.Value -is [bool] -and $current.Value -eq $false) {
        if ($state.wasPresent) {
            $settings | Add-Member -NotePropertyName $state.key -NotePropertyValue $state.previousValue -Force
        } else { $settings.PSObject.Properties.Remove($state.key) }
        [IO.File]::WriteAllText($expectedPath, ($settings | ConvertTo-Json -Depth 8))
    }
}
