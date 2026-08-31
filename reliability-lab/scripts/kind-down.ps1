$ErrorActionPreference = "Stop"

$ClusterName =
    "aira-reliability-lab"


if (-not (Get-Command kind -ErrorAction SilentlyContinue)) {

    throw "kind was not found in PATH."
}


$ExistingClusters =
    kind get clusters


if ($ExistingClusters -notcontains $ClusterName) {

    Write-Host ""
    Write-Host "AIRA Reliability Lab kind cluster does not exist."
    Write-Host ""

    exit 0
}


Write-Host ""
Write-Host "Destroying AIRA Reliability Lab kind cluster..."
Write-Host ""


kind delete cluster `
    --name $ClusterName


if ($LASTEXITCODE -ne 0) {

    throw "Failed to destroy Reliability Lab kind cluster."
}


Write-Host ""
Write-Host "AIRA Reliability Lab kind cluster destroyed."
Write-Host ""