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


$KubectlContext =
    "kind-$ClusterName"


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


function Assert-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )


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


function Ensure-KindContext {
    $Contexts =
        @(
            kubectl config get-contexts -o name
        )


    Assert-LastExitCode `
        "Unable to query kubectl contexts."


    if (
        $Contexts -notcontains
        $KubectlContext
    ) {
        Write-Host "Exporting kubeconfig for $ClusterName..."


        kind export kubeconfig `
            --name $ClusterName


        Assert-LastExitCode `
            "Unable to export kubeconfig for kind cluster '$ClusterName'."


        $Contexts =
            @(
                kubectl config get-contexts -o name
            )


        if (
            $Contexts -notcontains
            $KubectlContext
        ) {
            throw "Required kubectl context '$KubectlContext' is unavailable."
        }
    }
}


function Assert-CanonicalLabCluster {
    $NodeJson =
        kubectl `
            --context $KubectlContext `
            get nodes `
            -o json


    Assert-LastExitCode `
        "Unable to inspect Reliability Lab Kubernetes nodes."


    $Nodes =
        (
            $NodeJson -join "`n"
        ) |
        ConvertFrom-Json


    if (
        -not $Nodes.items -or
        $Nodes.items.Count -lt 1
    ) {
        throw "Reliability Lab kind cluster has no Kubernetes nodes."
    }


    foreach (
        $Node
        in $Nodes.items
    ) {
        $Labels =
            $Node.metadata.labels


        if (
            $Labels.'aira.reliability-lab' -ne
            "true"
        ) {
            throw "Refusing to continue: node '$($Node.metadata.name)' is not an AIRA Reliability Lab node."
        }


        if (
            $Labels.'aira.safety-class' -ne
            "LAB_ONLY"
        ) {
            throw "Refusing to continue: node '$($Node.metadata.name)' is not LAB_ONLY."
        }
    }


    Write-Host "Verified kubectl context: $KubectlContext"
    Write-Host "Verified Reliability Lab node labels."
}


function Wait-ForDeployment {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Deployment,

        [int]$TimeoutSeconds = 180
    )


    Write-Host "Waiting for deployment/$Deployment..."


    kubectl `
        --context $KubectlContext `
        rollout status `
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
    Assert-CommandExists `
        -Command $Command
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
    Write-Host "[1/8] Creating kind cluster..."


    kind create cluster `
        --name $ClusterName `
        --config $KindConfig


    Assert-LastExitCode `
        "kind cluster creation failed."
}
else {
    Write-Host "[1/8] kind cluster already exists."
}


Write-Host "[2/8] Verifying canonical Kubernetes context..."


Ensure-KindContext
Assert-CanonicalLabCluster


Write-Host "PASS"


Write-Host "[3/8] Building deterministic fixture image..."


docker build `
    -t $FixtureImage `
    $FixtureDirectory


Assert-LastExitCode `
    "Fixture Docker image build failed."


Write-Host "[4/8] Loading fixture image into kind..."


kind load docker-image `
    $FixtureImage `
    --name $ClusterName


Assert-LastExitCode `
    "Loading fixture image into kind failed."


Write-Host "[5/8] Creating Reliability Lab namespace..."


kubectl `
    --context $KubectlContext `
    apply `
    -f $NamespaceManifest


Assert-LastExitCode `
    "Namespace deployment failed."


Write-Host "[6/8] Deploying dependencies..."


kubectl `
    --context $KubectlContext `
    apply `
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


Write-Host "[7/8] Deploying deterministic fixture..."


kubectl `
    --context $KubectlContext `
    apply `
    -f $FixtureManifest


Assert-LastExitCode `
    "Fixture deployment failed."


Wait-ForDeployment `
    -Deployment "lab-api" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "lab-worker" `
    -TimeoutSeconds 180


Write-Host "[8/8] Deploying observability..."


kubectl `
    --context $KubectlContext `
    apply `
    -f $ObservabilityManifest


Assert-LastExitCode `
    "Observability deployment failed."


Wait-ForDeployment `
    -Deployment "otel-collector" `
    -TimeoutSeconds 180


Wait-ForDeployment `
    -Deployment "prometheus" `
    -TimeoutSeconds 180


$PodJson =
    kubectl `
        --context $KubectlContext `
        get pods `
        -n $Namespace `
        -o json


Assert-LastExitCode `
    "Unable to inspect Reliability Lab pod state."


$Pods =
    (
        $PodJson -join "`n"
    ) |
    ConvertFrom-Json


if (
    -not $Pods.items -or
    $Pods.items.Count -eq 0
) {
    throw "Reliability Lab namespace contains no pods."
}


foreach (
    $Pod
    in $Pods.items
) {
    if (
        $Pod.status.phase -ne
        "Running"
    ) {
        throw "Pod '$($Pod.metadata.name)' is not Running. phase=$($Pod.status.phase)"
    }


    $ReadyCondition =
        $Pod.status.conditions |
        Where-Object {
            $_.type -eq "Ready"
        } |
        Select-Object -First 1


    if (
        $null -eq $ReadyCondition -or
        $ReadyCondition.status -ne
        "True"
    ) {
        throw "Pod '$($Pod.metadata.name)' is running but not Ready."
    }


    foreach (
        $ContainerStatus
        in @(
            $Pod.status.containerStatuses
        )
    ) {
        if (
            $null -ne $ContainerStatus -and
            $ContainerStatus.ready -ne
            $true
        ) {
            throw "Container '$($ContainerStatus.name)' in pod '$($Pod.metadata.name)' is not Ready."
        }
    }
}


$ApiEndpoints =
    kubectl `
        --context $KubectlContext `
        get endpoints `
        lab-api `
        -n $Namespace `
        -o jsonpath='{.subsets[*].addresses[*].ip}'


Assert-LastExitCode `
    "Unable to verify lab-api endpoints."


if (
    [string]::IsNullOrWhiteSpace(
        $ApiEndpoints
    )
) {
    throw "lab-api has no Ready Kubernetes endpoint."
}


$WorkerEndpoints =
    kubectl `
        --context $KubectlContext `
        get endpoints `
        lab-worker `
        -n $Namespace `
        -o jsonpath='{.subsets[*].addresses[*].ip}'


Assert-LastExitCode `
    "Unable to verify lab-worker endpoints."


if (
    [string]::IsNullOrWhiteSpace(
        $WorkerEndpoints
    )
) {
    throw "lab-worker has no Ready Kubernetes endpoint."
}


Write-Host ""
Write-Host "==============================================="
Write-Host " KUBERNETES RELIABILITY LAB IS READY"
Write-Host "==============================================="
Write-Host ""
Write-Host "Verified:"
Write-Host " - explicit kubectl context: $KubectlContext"
Write-Host " - Reliability Lab node labels"
Write-Host " - LAB_ONLY Kubernetes safety classification"
Write-Host " - PostgreSQL ready"
Write-Host " - Redis ready"
Write-Host " - RabbitMQ ready"
Write-Host " - lab-api ready"
Write-Host " - lab-worker ready"
Write-Host " - lab-api endpoint exists"
Write-Host " - lab-worker endpoint exists"
Write-Host " - OpenTelemetry Collector ready"
Write-Host " - Prometheus ready"
Write-Host ""
Write-Host "API:    http://localhost:18080"
Write-Host "Worker: http://localhost:18081"
Write-Host ""
Write-Host "Next:"
Write-Host ".\reliability-lab\scripts\smoke-test.ps1 -Mode kind"
Write-Host ""