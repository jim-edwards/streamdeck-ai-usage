$ErrorActionPreference = 'Stop'

$name    = 'com.eevconsulting.ai-usage.sdPlugin'
$plugins = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins'
$src     = Join-Path $PSScriptRoot $name
$dest    = Join-Path $plugins $name
$exe     = Join-Path $env:ProgramFiles 'Elgato\StreamDeck\StreamDeck.exe'

if (-not (Test-Path $exe)) { throw "Stream Deck not found at $exe" }

Write-Host 'Stopping Stream Deck...'
Get-Process StreamDeck -ErrorAction SilentlyContinue | Stop-Process -Force
Wait-Process -Name StreamDeck -Timeout 15 -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Copy-Item $src $dest -Recurse
Write-Host "Installed to $dest"

Start-Process $exe
Write-Host 'Stream Deck restarted. Find "AI Usage > Claude Spend" in the action list.'
