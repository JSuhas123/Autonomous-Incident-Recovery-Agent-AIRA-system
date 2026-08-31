$ErrorActionPreference = "Stop"

$LabRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $LabRoot "docker\docker-compose.yml"

Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA PHASE 21 - DOCKER RELIABILITY LAB"
Write-Host "==============================================="
Write-Host ""

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found."
}

docker info | Out-Null

if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon is not available."
}

Write-Host "[1/3] Validating Docker Compose..."

docker compose `
    -f $ComposeFile `
    config `
    --quiet

if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose validation failed."
}

Write-Host "[2/3] Building Reliability Lab fixture..."

docker compose `
    -f $ComposeFile `
    build `
    lab-api `
    lab-worker

if ($LASTEXITCODE -ne 0) {
    throw "Reliability Lab fixture build failed."
}

Write-Host "[3/3] Starting Reliability Lab..."

docker compose `
    -f $ComposeFile `
    up `
    -d `
    --wait

if ($LASTEXITCODE -ne 0) {
    throw "Reliability Lab startup failed."
}

Write-Host ""
Write-Host "Docker Reliability Lab is running."
Write-Host ""
Write-Host "API:        http://localhost:18080"
Write-Host "Worker:     http://localhost:18081"
Write-Host "Prometheus: http://localhost:19090"
Write-Host "RabbitMQ:   http://localhost:25673"
Write-Host ""
Write-Host "Run:"
Write-Host ".\reliability-lab\scripts\smoke-test.ps1 -Mode docker"
Write-Host ""