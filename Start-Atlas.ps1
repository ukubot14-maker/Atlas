$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $root 'server'
$webPath = Join-Path $root 'web'

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$serverPath'; npm run dev"
)

Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$webPath'; npm run dev"
)

Write-Host 'Atlas started in two PowerShell windows: server and web.'
