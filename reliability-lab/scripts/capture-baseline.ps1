param(
    [ValidateSet(
        "docker",
        "kind"
    )]
    [string]$Mode = "docker",

    [string]$OutputPath = ""
)


$ErrorActionPreference = "Stop"


$Namespace = "aira-reliability-lab"
$ClusterName = "aira-reliability-lab"
$KubectlContext = "kind-$ClusterName"

$ApiBase = "http://localhost:18080"
$WorkerBase = "http://localhost:18081"

$DockerPrometheusBase = "http://localhost:19090"


Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA PHASE 21.7 - OBSERVABILITY BASELINE"
Write-Host " Mode: $Mode"
Write-Host "==============================================="
Write-Host ""


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
        throw "Required command '$Command' was not found in PATH."
    }
}


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


function Invoke-JsonGet {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    return Invoke-RestMethod `
        -Method Get `
        -Uri $Uri `
        -TimeoutSec 10
}


function Assert-KindContext {
    Assert-CommandExists `
        -Command "kind"

    Assert-CommandExists `
        -Command "kubectl"


    $Clusters =
        @(
            kind get clusters
        )


    Assert-LastExitCode `
        "Unable to query kind clusters."


    if (
        $Clusters -notcontains
        $ClusterName
    ) {
        throw "Required kind cluster '$ClusterName' does not exist."
    }


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
        Write-Host "kind context missing. Exporting kubeconfig..."

        kind export kubeconfig `
            --name $ClusterName


        Assert-LastExitCode `
            "Unable to export kubeconfig for '$ClusterName'."


        $Contexts =
            @(
                kubectl config get-contexts -o name
            )


        if (
            $Contexts -notcontains
            $KubectlContext
        ) {
            throw "kubectl context '$KubectlContext' is unavailable."
        }
    }


    $NodeJson =
        kubectl `
            --context $KubectlContext `
            get nodes `
            -o json


    Assert-LastExitCode `
        "Unable to inspect kind Reliability Lab nodes."


    $Nodes =
        (
            $NodeJson -join "`n"
        ) |
        ConvertFrom-Json


    if (
        -not $Nodes.items -or
        $Nodes.items.Count -lt 1
    ) {
        throw "No Kubernetes nodes were found in '$KubectlContext'."
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
            throw "Node '$($Node.metadata.name)' is not labelled as an AIRA Reliability Lab node."
        }


        if (
            $Labels.'aira.safety-class' -ne
            "LAB_ONLY"
        ) {
            throw "Node '$($Node.metadata.name)' does not have LAB_ONLY safety classification."
        }
    }
}


function Invoke-PrometheusQuery {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Query
    )


    $Encoded =
        [System.Uri]::EscapeDataString(
            $Query
        )


    if (
        $Mode -eq
        "docker"
    ) {
        $Uri =
            "$DockerPrometheusBase/api/v1/query?query=$Encoded"


        try {
            $Response =
                Invoke-RestMethod `
                    -Method Get `
                    -Uri $Uri `
                    -TimeoutSec 10
        }
        catch {
            throw "Unable to query Docker Reliability Lab Prometheus: $($_.Exception.Message)"
        }
    }
    else {
        #
        # PHASE 21 HARDENING:
        #
        # Query Prometheus through the Kubernetes API service proxy.
        #
        # This deliberately avoids:
        # - PowerShell -> kubectl -> node -e quoting
        # - dependency on curl/wget inside the fixture image
        # - localhost Prometheus port assumptions
        # - temporary port-forward processes
        #

        $ProxyPath =
            "/api/v1/namespaces/$Namespace/services/http:prometheus:9090/proxy/api/v1/query?query=$Encoded"


        $ResponseText =
            kubectl `
                --context $KubectlContext `
                get `
                --raw $ProxyPath


        Assert-LastExitCode `
            "Unable to query Prometheus through the Kubernetes API service proxy."


        if (
            [string]::IsNullOrWhiteSpace(
                $ResponseText
            )
        ) {
            throw "Prometheus returned an empty response."
        }


        try {
            $Response =
                $ResponseText |
                ConvertFrom-Json
        }
        catch {
            throw "Prometheus returned invalid JSON: $($_.Exception.Message)"
        }
    }


    if (
        $null -eq $Response
    ) {
        throw "Prometheus query returned no response object."
    }


    if (
        $Response.status -ne
        "success"
    ) {
        throw "Prometheus query failed: $Query"
    }


    if (
        $null -eq $Response.data
    ) {
        throw "Prometheus response contains no data object."
    }


    if (
        -not $Response.data.result -or
        $Response.data.result.Count -eq 0
    ) {
        return $null
    }


    $RawValue =
        $Response.data.result[0].value[1]


    if (
        $null -eq $RawValue
    ) {
        return $null
    }


    $ParsedValue =
        0.0


    if (
        -not [double]::TryParse(
            [string]$RawValue,
            [System.Globalization.NumberStyles]::Float,
            [System.Globalization.CultureInfo]::InvariantCulture,
            [ref]$ParsedValue
        )
    ) {
        throw "Prometheus returned non-numeric value '$RawValue' for query: $Query"
    }


    return $ParsedValue
}


function New-ObservedMeasurement {
    param(
        $Value,

        [string]$Unit,

        [string]$Source
    )


    return [ordered]@{
        status = "OBSERVED"

        value = $Value

        unit = $Unit

        source = $Source

        observedAt =
            (
                Get-Date
            ).ToUniversalTime().ToString(
                "o"
            )

        metadata = @{}

        executionAuthorized = $false
    }
}


function New-NotApplicableMeasurement {
    param(
        [string]$Source
    )


    return [ordered]@{
        status = "NOT_APPLICABLE"

        value = $null

        unit = $null

        source = $Source

        observedAt = $null

        metadata = @{}

        executionAuthorized = $false
    }
}


function Get-RabbitQueueDepth {
    param(
        [Parameter(Mandatory = $true)]
        [array]$Output
    )


    $QueueDepth = 0


    foreach (
        $Line
        in $Output
    ) {
        $Text =
            [string]$Line


        if (
            $Text -match
            '^"?aira\.reliability\.orders"?,(\d+)$'
        ) {
            $QueueDepth =
                [int]$Matches[1]

            break
        }
    }


    return $QueueDepth
}


if (
    $Mode -eq
    "kind"
) {
    Write-Host "[0/9] Verifying canonical kind cluster/context..."

    Assert-KindContext

    Write-Host "PASS"
    Write-Host "Context: $KubectlContext"
}


Write-Host "[1/9] Checking API and worker health..."


$ApiHealth =
    Invoke-JsonGet `
        -Uri "$ApiBase/health"


$WorkerHealth =
    Invoke-JsonGet `
        -Uri "$WorkerBase/health"


if (
    $ApiHealth.status -ne
        "UP" -or
    $WorkerHealth.status -ne
        "UP"
) {
    throw "Reliability Lab health baseline is not healthy."
}


if (
    $ApiHealth.executionAuthorized -ne
        $false -or
    $WorkerHealth.executionAuthorized -ne
        $false
) {
    throw "Reliability Lab health response unexpectedly authorizes execution."
}


if (
    $ApiHealth.safetyClass -ne
        "LAB_ONLY" -or
    $WorkerHealth.safetyClass -ne
        "LAB_ONLY"
) {
    throw "Reliability Lab health response is not LAB_ONLY."
}


Write-Host "PASS"


Write-Host "[2/9] Checking readiness..."


$ApiReady =
    Invoke-JsonGet `
        -Uri "$ApiBase/ready"


$WorkerReady =
    Invoke-JsonGet `
        -Uri "$WorkerBase/ready"


if (
    $ApiReady.ready -ne
        $true -or
    $WorkerReady.ready -ne
        $true
) {
    throw "Reliability Lab readiness baseline is not healthy."
}


Write-Host "PASS"


Write-Host "[3/9] Checking dependency health..."


$ApiDependencies =
    Invoke-JsonGet `
        -Uri "$ApiBase/dependency-health"


$WorkerDependencies =
    Invoke-JsonGet `
        -Uri "$WorkerBase/dependency-health"


$DependencyValues =
    @(
        $ApiDependencies.dependencies.postgres,
        $ApiDependencies.dependencies.redis,
        $ApiDependencies.dependencies.rabbitmq,
        $WorkerDependencies.dependencies.postgres,
        $WorkerDependencies.dependencies.redis,
        $WorkerDependencies.dependencies.rabbitmq
    )


$DependenciesHealthy =
    $true


foreach (
    $Dependency
    in $DependencyValues
) {
    if (
        $Dependency -ne
        $true
    ) {
        $DependenciesHealthy =
            $false

        break
    }
}


if (
    -not $DependenciesHealthy
) {
    throw "Dependency baseline is unhealthy."
}


Write-Host "PASS"


Write-Host "[4/9] Collecting Prometheus CPU/memory..."


$Cpu =
    Invoke-PrometheusQuery `
        -Query 'sum(rate(process_cpu_user_seconds_total{service=~"aira-lab-(api|worker)"}[1m]) + rate(process_cpu_system_seconds_total{service=~"aira-lab-(api|worker)"}[1m]))'


if (
    $null -eq $Cpu
) {
    $Cpu = 0
}


$Memory =
    Invoke-PrometheusQuery `
        -Query 'sum(process_resident_memory_bytes{service=~"aira-lab-(api|worker)"})'


if (
    $null -eq $Memory
) {
    throw "Memory metric is unavailable."
}


Write-Host "PASS"


Write-Host "[5/9] Collecting latency and error rate..."


$LatencySeconds =
    Invoke-PrometheusQuery `
        -Query 'histogram_quantile(0.95, sum by (le) (rate(aira_lab_http_request_duration_seconds_bucket[5m])))'


if (
    $null -eq $LatencySeconds
) {
    $LatencySeconds = 0
}


$ErrorRate =
    Invoke-PrometheusQuery `
        -Query 'sum(rate(aira_lab_http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(aira_lab_http_requests_total[5m])), 0.000001)'


if (
    $null -eq $ErrorRate
) {
    $ErrorRate = 0
}


Write-Host "PASS"


Write-Host "[6/9] Collecting database connections and queue depth..."


$DbConnections = 0
$QueueDepth = 0


if (
    $Mode -eq
    "docker"
) {
    $DbOutput =
        @(
            docker exec `
                aira-lab-postgres `
                psql `
                -U aira_lab `
                -d aira_lab `
                -t `
                -A `
                -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='aira_lab';"
        )


    Assert-LastExitCode `
        "Unable to collect PostgreSQL connection baseline."


    $DbText =
        (
            $DbOutput -join ""
        ).Trim()


    if (
        -not (
            $DbText -match
            '^\d+$'
        )
    ) {
        throw "PostgreSQL returned an invalid connection count: '$DbText'."
    }


    $DbConnections =
        [int]$DbText


    $QueueOutput =
        @(
            docker exec `
                aira-lab-rabbitmq `
                rabbitmqctl `
                list_queues `
                name `
                messages `
                --formatter csv
        )


    Assert-LastExitCode `
        "Unable to collect RabbitMQ queue baseline."


    $QueueDepth =
        Get-RabbitQueueDepth `
            -Output $QueueOutput
}
else {
    $PostgresPod =
        kubectl `
            --context $KubectlContext `
            get pods `
            -n $Namespace `
            -l app=postgres `
            -o jsonpath='{.items[0].metadata.name}'


    Assert-LastExitCode `
        "Unable to locate PostgreSQL pod."


    if (
        [string]::IsNullOrWhiteSpace(
            $PostgresPod
        )
    ) {
        throw "Unable to locate PostgreSQL pod."
    }


    $DbOutput =
        @(
            kubectl `
                --context $KubectlContext `
                exec `
                -n $Namespace `
                $PostgresPod `
                -- `
                psql `
                -U aira_lab `
                -d aira_lab `
                -t `
                -A `
                -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='aira_lab';"
        )


    Assert-LastExitCode `
        "Unable to collect PostgreSQL connection baseline."


    $DbText =
        (
            $DbOutput -join ""
        ).Trim()


    if (
        -not (
            $DbText -match
            '^\d+$'
        )
    ) {
        throw "PostgreSQL returned an invalid connection count: '$DbText'."
    }


    $DbConnections =
        [int]$DbText


    $RabbitPod =
        kubectl `
            --context $KubectlContext `
            get pods `
            -n $Namespace `
            -l app=rabbitmq `
            -o jsonpath='{.items[0].metadata.name}'


    Assert-LastExitCode `
        "Unable to locate RabbitMQ pod."


    if (
        [string]::IsNullOrWhiteSpace(
            $RabbitPod
        )
    ) {
        throw "Unable to locate RabbitMQ pod."
    }


    $QueueOutput =
        @(
            kubectl `
                --context $KubectlContext `
                exec `
                -n $Namespace `
                $RabbitPod `
                -- `
                rabbitmqctl `
                list_queues `
                name `
                messages `
                --formatter csv
        )


    Assert-LastExitCode `
        "Unable to collect RabbitMQ queue baseline."


    $QueueDepth =
        Get-RabbitQueueDepth `
            -Output $QueueOutput
}


Write-Host "PASS"


Write-Host "[7/9] Collecting workload state..."


if (
    $Mode -eq
    "kind"
) {
    $PodJson =
        kubectl `
            --context $KubectlContext `
            get pods `
            -n $Namespace `
            -o json


    Assert-LastExitCode `
        "Unable to inspect Kubernetes pod baseline."


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


    $AllPodsReady = $true
    $RestartCount = 0


    foreach (
        $Pod
        in $Pods.items
    ) {
        if (
            $Pod.status.phase -ne
            "Running"
        ) {
            $AllPodsReady = $false
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
            $AllPodsReady = $false
        }


        foreach (
            $ContainerStatus
            in @(
                $Pod.status.containerStatuses
            )
        ) {
            if (
                $null -ne $ContainerStatus
            ) {
                if (
                    $ContainerStatus.ready -ne
                    $true
                ) {
                    $AllPodsReady = $false
                }


                $RestartCount +=
                    [int]$ContainerStatus.restartCount
            }
        }
    }


    if (
        -not $AllPodsReady
    ) {
        throw "Kubernetes pod baseline is not ready."
    }


    $PodStateMeasurement =
        New-ObservedMeasurement `
            -Value $true `
            -Unit "boolean" `
            -Source "kubernetes/pods"


    $RestartMeasurement =
        New-ObservedMeasurement `
            -Value $RestartCount `
            -Unit "count" `
            -Source "kubernetes/containerStatuses"
}
else {
    $PodStateMeasurement =
        New-NotApplicableMeasurement `
            -Source "DOCKER_NOT_APPLICABLE"


    $RestartMeasurement =
        New-NotApplicableMeasurement `
            -Source "DOCKER_NOT_APPLICABLE"
}


Write-Host "PASS"


Write-Host "[8/9] Verifying lab safety boundary..."


if (
    $ApiHealth.safetyClass -ne
        "LAB_ONLY" -or
    $WorkerHealth.safetyClass -ne
        "LAB_ONLY"
) {
    throw "Reliability Lab safety classification is invalid."
}


if (
    $ApiHealth.executionAuthorized -ne
        $false -or
    $WorkerHealth.executionAuthorized -ne
        $false
) {
    throw "Reliability Lab unexpectedly authorizes execution."
}


Write-Host "PASS"


Write-Host "[9/9] Building baseline artifact..."


if (
    [string]::IsNullOrWhiteSpace(
        $env:PHASE21_LAB_ENVIRONMENT_ID
    )
) {
    $CanonicalLabEnvironmentId =
        "aira-reliability-lab-$Mode"
}
else {
    $CanonicalLabEnvironmentId =
        $env:PHASE21_LAB_ENVIRONMENT_ID
}


if (
    $Mode -eq
    "kind"
) {
    $PrometheusReference =
        "kubernetes://$ClusterName/$Namespace/service/prometheus:9090"
}
else {
    $PrometheusReference =
        $DockerPrometheusBase
}


$Baseline =
    [ordered]@{
        baselineVersion = "21.7-v1"

        phase = 21

        labEnvironmentId =
            $CanonicalLabEnvironmentId

        labKind =
            $Mode.ToUpper()

        capturedAt =
            (
                Get-Date
            ).ToUniversalTime().ToString(
                "o"
            )

        healthy = $true

        measurements =
            [ordered]@{
                CPU =
                    New-ObservedMeasurement `
                        -Value $Cpu `
                        -Unit "cores" `
                        -Source "prometheus"

                MEMORY =
                    New-ObservedMeasurement `
                        -Value $Memory `
                        -Unit "bytes" `
                        -Source "prometheus"

                LATENCY =
                    New-ObservedMeasurement `
                        -Value (
                            $LatencySeconds *
                            1000
                        ) `
                        -Unit "ms_p95" `
                        -Source "prometheus"

                ERROR_RATE =
                    New-ObservedMeasurement `
                        -Value $ErrorRate `
                        -Unit "ratio" `
                        -Source "prometheus"

                POD_STATE =
                    $PodStateMeasurement

                RESTART_COUNT =
                    $RestartMeasurement

                DB_CONNECTIONS =
                    New-ObservedMeasurement `
                        -Value $DbConnections `
                        -Unit "count" `
                        -Source "postgres.pg_stat_activity"

                QUEUE_DEPTH =
                    New-ObservedMeasurement `
                        -Value $QueueDepth `
                        -Unit "messages" `
                        -Source "rabbitmq"

                DEPENDENCY_HEALTH =
                    New-ObservedMeasurement `
                        -Value $DependenciesHealthy `
                        -Unit "boolean" `
                        -Source "/dependency-health"

                HEALTH =
                    New-ObservedMeasurement `
                        -Value $true `
                        -Unit "boolean" `
                        -Source "/health"

                READINESS =
                    New-ObservedMeasurement `
                        -Value $true `
                        -Unit "boolean" `
                        -Source "/ready"
            }

        sourceReferences =
            @(
                [ordered]@{
                    type = "PROMETHEUS"

                    ref =
                        $PrometheusReference

                    executionAuthorized =
                        $false
                },

                [ordered]@{
                    type = "LAB_API"

                    ref =
                        $ApiBase

                    executionAuthorized =
                        $false
                },

                [ordered]@{
                    type = "LAB_WORKER"

                    ref =
                        $WorkerBase

                    executionAuthorized =
                        $false
                }
            )

        bulkTelemetryStored =
            $false

        canonicalTelemetryAuthority =
            "OBSERVABILITY_SYSTEMS"

        productionCertified =
            $false

        executionAuthorized =
            $false
    }


if (
    [string]::IsNullOrWhiteSpace(
        $OutputPath
    )
) {
    $EvidenceDirectory =
        Join-Path `
            $PSScriptRoot `
            "..\evidence"


    New-Item `
        -ItemType Directory `
        -Force `
        -Path $EvidenceDirectory |
        Out-Null


    $OutputPath =
        Join-Path `
            $EvidenceDirectory `
            "baseline-$Mode.json"
}


$ResolvedOutput =
    [System.IO.Path]::GetFullPath(
        $OutputPath
    )


$Baseline |
    ConvertTo-Json `
        -Depth 20 |
    Set-Content `
        -Path $ResolvedOutput `
        -Encoding UTF8


Write-Host "PASS"
Write-Host ""
Write-Host "==============================================="
Write-Host " PHASE 21.7 BASELINE CAPTURE PASSED"
Write-Host "==============================================="
Write-Host ""
Write-Host "Output:"
Write-Host " $ResolvedOutput"
Write-Host ""
Write-Host "Verified:"
Write-Host " - canonical kind context where applicable"
Write-Host " - LAB_ONLY safety boundary"
Write-Host " - health/readiness"
Write-Host " - dependency health"
Write-Host " - CPU"
Write-Host " - memory"
Write-Host " - latency"
Write-Host " - error rate"
Write-Host " - PostgreSQL connections"
Write-Host " - RabbitMQ queue depth"
Write-Host " - Kubernetes pod state where applicable"
Write-Host " - Kubernetes restart count where applicable"
Write-Host " - executionAuthorized=false"
Write-Host " - productionCertified=false"
Write-Host " - bulk telemetry remains external"
Write-Host ""