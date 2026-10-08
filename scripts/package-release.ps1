param([Parameter(Mandatory=$true)][string]$StageDir, [Parameter(Mandatory=$true)][string]$OutputZip)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.release')).TrimEnd('\') + '\'
$stagePath = [IO.Path]::GetFullPath($StageDir)
$zipPath = [IO.Path]::GetFullPath($OutputZip)
if (-not $stagePath.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $zipPath.StartsWith($releaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Release output must stay within .release.'
}
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stagePath, $zipPath)
