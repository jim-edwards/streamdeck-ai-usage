# Renders the Marketplace thumbnail and gallery images to dist/marketplace/*.png (1920×960).
# Needs Node and Microsoft Edge (Windows). Regenerate after any visual change to the key.
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'dist/marketplace'
$htmlDir = Join-Path $outDir 'html'

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }

node (Join-Path $PSScriptRoot 'pages.js') $htmlDir
if ($LASTEXITCODE) { throw 'pages.js failed' }

Add-Type -AssemblyName System.Drawing
foreach ($page in Get-ChildItem $htmlDir -Filter *.html) {
  $png = Join-Path $outDir ($page.BaseName + '.png')
  $url = 'file:///' + ($page.FullName -replace '\\', '/')
  & $edge --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1920,960 "--screenshot=$png" $url 2>&1 | Out-Null
  $img = [System.Drawing.Image]::FromFile($png)
  $size = "$($img.Width)x$($img.Height)"
  $img.Dispose()
  if ($size -ne '1920x960') { throw "$($page.BaseName).png is $size, expected 1920x960" }
  Write-Host "Built $png ($size)"
}
