# Builds dist/com.eevconsulting.ai-usage-<version>.streamDeckPlugin (a zip with the .sdPlugin folder at its root).
# Double-clicking the file installs it into Stream Deck. Used locally and by the release workflow.
param(
  [Parameter(Mandatory)][string]$Version
)
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') { throw "Version must look like 1.2.3 or v1.2.3, got '$Version'" }
$semver = "$($Matches[1]).$($Matches[2]).$($Matches[3])"

$name  = 'com.eevconsulting.ai-usage.sdPlugin'
$root  = Split-Path $PSScriptRoot -Parent
$dist  = Join-Path $root 'dist'
$stage = Join-Path $dist 'stage'
$out   = Join-Path $dist "com.eevconsulting.ai-usage-$semver.streamDeckPlugin"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null
Copy-Item (Join-Path $root $name) $stage -Recurse
$plugin = Join-Path $stage $name
$logs = Join-Path $plugin 'logs'
if (Test-Path $logs) { Remove-Item $logs -Recurse -Force }
# GPL: the licence travels with every copy.
Copy-Item (Join-Path $root 'LICENSE') $plugin

# Stream Deck wants a four-part version; the release tag supplies the first three.
$manifestPath = Join-Path $plugin 'manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.Version = "$semver.0"
# The Node debugger is for local development only; never ship it enabled.
$manifest.Nodejs.Debug = 'disabled'
$manifest | ConvertTo-Json -Depth 20 | Set-Content $manifestPath -Encoding utf8
$written = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($written.Version -ne "$semver.0" -or $written.Nodejs.Debug -ne 'disabled') { throw 'Manifest was not written as expected' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $out)
Remove-Item $stage -Recurse -Force

Write-Host "Built $out"
