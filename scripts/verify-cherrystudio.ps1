param([string]$InstallDir = "$env:LOCALAPPDATA\Programs\TokenTracker")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$installPath = (Resolve-Path -LiteralPath $InstallDir).Path
$serverRoot = Join-Path $installPath 'EmbeddedServer\tokentracker'
$nodePath = Join-Path $installPath 'EmbeddedServer\node.exe'
$packagePath = Join-Path $serverRoot 'package.json'
if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath (Join-Path $serverRoot 'src\lib\cherrystudio.js'))) {
    throw 'Deploy the Cherry Studio patch to this installation before verifying.'
}
if ((Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version -ne '1.1.5') { throw 'Only TokenTracker 1.1.5 is supported.' }
& $nodePath (Join-Path $PSScriptRoot 'verify-cherrystudio.cjs') --server-root $serverRoot
exit $LASTEXITCODE
