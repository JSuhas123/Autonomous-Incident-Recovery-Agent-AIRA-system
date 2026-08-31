$ErrorActionPreference = "Stop"

$LabRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $LabRoot "docker\docker-compose.yml"

Write-Host ""
Write-Host "Destroying AIRA Docker Reliability Lab..."
Write-Host ""

docker compose `
    -f $ComposeFile `
    down `
    --remove-orphans `
    --volumes

if ($LASTEXITCODE -ne 0) {
    throw "Docker Reliability Lab shutdown failed."
}

Write-Host ""
Write-Host "Docker Reliability Lab destroyed."
Write-Host ""