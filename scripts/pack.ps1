# Builds dist/com.eevconsulting.ai-usage-<version>.streamDeckPlugin (a zip with the .sdPlugin folder at its root).
# Double-clicking the file installs it into Stream Deck. Used locally and by the release workflow.
#   -Version 1.2.3        release version (a leading "v" is allowed, so a tag can be passed straight in);
#                         defaults to the version in package.json
#   -Build 42             fourth manifest version part; 0 for releases, the CI run number otherwise
#   -Suffix ci.42-abc1234 appended to the file name to tell non-release builds apart
param(
  [string]$Version = '',
  [int]$Build = 0,
  [string]$Suffix = ''
)
$ErrorActionPreference = 'Stop'

if (-not $Version) { $Version = (Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'package.json') -Raw | ConvertFrom-Json).version }

if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') { throw "Version must look like 1.2.3 or v1.2.3, got '$Version'" }
$semver = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
if ($Build -lt 0) { throw "Build must be 0 or more, got $Build" }
if ($Suffix -and $Suffix -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$') { throw "Suffix may only contain letters, digits, '.' and '-', got '$Suffix'" }

$name  = 'com.eevconsulting.ai-usage.sdPlugin'
$root  = Split-Path $PSScriptRoot -Parent
$dist  = Join-Path $root 'dist'
$stage = Join-Path $dist 'stage'
$file  = "com.eevconsulting.ai-usage-$semver" + $(if ($Suffix) { "-$Suffix" } else { '' }) + '.streamDeckPlugin'
$out   = Join-Path $dist $file

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null
Copy-Item (Join-Path $root $name) $stage -Recurse
$plugin = Join-Path $stage $name
$logs = Join-Path $plugin 'logs'
if (Test-Path $logs) { Remove-Item $logs -Recurse -Force }
# GPL: the licence travels with every copy.
Copy-Item (Join-Path $root 'LICENSE') $plugin

# Stream Deck wants a four-part version.
$manifestPath = Join-Path $plugin 'manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.Version = "$semver.$Build"
# The Node debugger is for local development only; never ship it enabled.
$manifest.Nodejs.Debug = 'disabled'
$manifest | ConvertTo-Json -Depth 20 | Set-Content $manifestPath -Encoding utf8
$written = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($written.Version -ne "$semver.$Build" -or $written.Nodejs.Debug -ne 'disabled') { throw 'Manifest was not written as expected' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $out)
Remove-Item $stage -Recurse -Force

Write-Host "Built $out"
