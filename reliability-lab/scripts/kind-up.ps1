$ErrorActionPreference = "Stop"


$LabRoot =
    Split-Path -Parent $PSScriptRoot


$KindConfig =
    Join-Path `
        $LabRoot `
        "kubernetes\kind-config.yaml"


$NamespaceManifest =
    Join-Path `
        $LabRoot `
        "kubernetes\00-namespace.yaml"


$DependenciesManifest =
    Join-Path `
        $LabRoot `
        "kubernetes\01-dependencies.yaml"


$FixtureManifest =
    Join-Path `
        $LabRoot `
        "kubernetes\02-fixture.yaml"


$ObservabilityManifest =
    Join-Path `
        $LabRoot `
        "kubernetes\03-observability.yaml"


$FixtureDirectory =
    Join-Path `
        $LabRoot `
        "apps\fixture"


$ClusterName =
    "aira-reliability-lab"


$FixtureImage =
    "aira-reliability-fixture:21.6-v1"


$Namespace =
    "aira-reliability-lab"


function Assert-LastExitCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )


    if (
        $LASTEXITCODE -ne 0
    ) {
        throw $Message
    }
}


function Wait-ForDeployment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Deployment,

        [int]$TimeoutSeconds = 180
    )


    Write-Host "Waiting for deployment/$Deployment..."


    kubectl rollout status `
        "deployment/$Deployment" `
        -n $Namespace `
        "--timeout=${TimeoutSeconds}s"


    Assert-LastExitCode `
        "Deployment $Deployment failed to become ready within ${TimeoutSeconds}s."
}


Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA PHASE 21 - KIND RELIABILITY LAB"
Write-Host "==============================================="
Write-Host ""


foreach (
    $Command
    in @(
        "docker",
        "kind",
        "kubectl"
    )
) {
    if (
        -not (
            Get-Command `
                $Command `
                -ErrorAction SilentlyContinue
        )
    ) {
        throw "$Command was not found in PATH."
    }
}


docker info |
    Out-Null


Assert-LastExitCode `
    "Docker daemon is not available."


$ExistingClusters =
    @(
        kind get clusters
    )


Assert-LastExitCode `
    "Unable to query kind clusters."


if (
    $ExistingClusters -notcontains
    $ClusterName
) {
    Write-Host "[1/7] Creating kind cluster..."


    kind create cluster `
        --name $ClusterName `
        --config $KindConfig


    Assert-LastExitCode `
        "kind cluster creation failed."
}
else {
    Write-Host "[1/7] kind cluster already exists."
}


Write-Host "[2/7] Building deterministic fixture image..."


docker build `
    -t $FixtureImage `
    $FixtureDirectory


Assert-LastExitCode `
    "Fixture Docker image build failed."


Write-Host "[3/7] Loading fixture image into kind..."


kind load docker-image `
    $FixtureImage `
    --name $ClusterName


Assert-LastExitCode `
    "Loading fixture image into kind failed."


Write-Host "[4/7] Creating Reliability Lab namespace..."


kubectl apply `
    -f $NamespaceManifest


Assert-LastExitCode `
    "Namespace deployment failed."


Write-Host "[5/7] Deploying dependencies..."


kubectl apply `
    -f $DependenciesManifest


Assert-LastExitCode `
    "Dependency deployment failed."


Wait-ForDeployment `
    -Deployment "postgres" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "redis" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "rabbitmq" `
    -TimeoutSeconds 240


Write-Host "[6/7] Deploying deterministic fixture..."


kubectl apply `
    -f $FixtureManifest


Assert-LastExitCode `
    "Fixture deployment failed."


Wait-ForDeployment `
    -Deployment "lab-api" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "lab-worker" `
    -TimeoutSeconds 180


Write-Host "[7/7] Deploying observability..."


kubectl apply `
    -f $ObservabilityManifest


Assert-LastExitCode `
    "Observability deployment failed."


Wait-ForDeployment `
    -Deployment "otel-collector" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "prometheus" `
    -TimeoutSeconds 180


$NotReadyPods =
    @(
        kubectl get pods `
            -n $Namespace `
            --field-selector=status.phase!=Running `
            -o name
    )


Assert-LastExitCode `
    "Unable to inspect Reliability Lab pod state."


if (
    $NotReadyPods.Count -gt 0
) {
    Write-Host ""
    Write-Host "Pods not in Running phase:"


    $NotReadyPods |
        ForEach-Object {
            Write-Host " - $_"
        }


    throw "Reliability Lab contains non-running pods."
}


$PodJson =
    kubectl get pods `
        -n $Namespace `
        -o json


Assert-LastExitCode `
    "Unable to inspect Reliability Lab readiness."


$Pods =
    $PodJson |
    ConvertFrom-Json


foreach (
    $Pod
    in $Pods.items
) {
    $Ready =
        $false


    foreach (
        $Condition
        in $Pod.status.conditions
    ) {
        if (
            $Condition.type -eq "Ready" -and
            $Condition.status -eq "True"
        ) {
            $Ready =
                $true


            break
        }
    }


    if (
        -not $Ready
    ) {
        throw "Pod $($Pod.metadata.name) is running but not Ready."
    }
}


Write-Host ""
Write-Host "==============================================="
Write-Host " KUBERNETES RELIABILITY LAB IS READY"
Write-Host "==============================================="
Write-Host ""
Write-Host "Verified:"
Write-Host " - PostgreSQL ready"
Write-Host " - Redis ready"
Write-Host " - RabbitMQ ready"
Write-Host " - lab-api ready"
Write-Host " - lab-worker ready"
Write-Host " - OpenTelemetry Collector ready"
Write-Host " - Prometheus ready"
Write-Host ""
Write-Host "API:    http://localhost:18080"
Write-Host "Worker: http://localhost:18081"
Write-Host ""
Write-Host "Next:"
Write-Host ".\reliability-lab\scripts\smoke-test.ps1 -Mode kind"
Write-Host ""