param([string]$InstallDir = "$env:LOCALAPPDATA\Programs\TokenTracker")
. (Join-Path $PSScriptRoot 'cherrystudio-patch-common.ps1')
$markerPath = Get-CherrySafeChild ([IO.Path]::GetFullPath($InstallDir)) 'EmbeddedServer/tokentracker/cherrystudio-patch.json'
$marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
Assert-CherryInstallation $InstallDir $marker.baseVersion | Out-Null
$backupRoot = Get-CherrySafeChild $CherryProjectRoot '.deployment-backups'
$backupDir = [IO.Path]::GetFullPath($marker.backupDir)
if (-not $backupDir.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup directory is outside this project.' }
Set-CherryUpdateProtection $backupDir
Write-Output 'Automatic updates paused while the Cherry Studio patch is installed.'
