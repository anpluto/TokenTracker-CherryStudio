param([string]$InstallDir = "$env:LOCALAPPDATA\Programs\TokenTracker")
. (Join-Path $PSScriptRoot 'cherrystudio-patch-common.ps1')
$serverRoot = Get-CherrySafeChild ([IO.Path]::GetFullPath($InstallDir)) 'EmbeddedServer/tokentracker'
$markerPath = Get-CherrySafeChild $serverRoot 'cherrystudio-patch.json'
$marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
$installPath = Assert-CherryInstallation $InstallDir $marker.baseVersion
$backupRoot = Get-CherrySafeChild $CherryProjectRoot '.deployment-backups'
$backupDir = [IO.Path]::GetFullPath($marker.backupDir)
if (-not $backupDir.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup directory is outside this project.' }
$backup = Get-Content -Raw -LiteralPath (Join-Path $backupDir 'manifest.json') | ConvertFrom-Json
if (-not $backup.installDir.Equals($installPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'The backup belongs to a different installation.' }
# Allow a retry after interrupted file restoration: every file must match
# either the deployed patch or its saved original, never an unrelated edit.
foreach ($entry in $backup.files) {
    $target = Get-CherrySafeChild $serverRoot $entry.relative
    if (Test-Path -LiteralPath $target) {
        $hash = Get-CherryFileHash $target
        if ($hash -eq $entry.afterSha256 -or ($entry.existed -and $hash -eq $entry.beforeSha256)) { continue }
    } elseif (-not $entry.existed) { continue }
    throw "Installed file changed since deployment: $($entry.relative). Restore stopped before changing anything."
}
Restore-CherryUpdateProtection $backupDir -ValidateOnly
Restore-CherryBackupFiles $backupDir $serverRoot $backup
Restore-CherryUpdateProtection $backupDir
Remove-Item -LiteralPath $markerPath -Force
Write-Output 'Original program files and the prior automatic-update preference restored. Existing usage data was preserved.'
