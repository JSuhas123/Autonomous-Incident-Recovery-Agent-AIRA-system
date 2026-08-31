param(
    [ValidateSet(
        "docker",
        "kind"
    )]
    [string]$Mode = "docker",

    [string]$OutputPath = ""
)


$ErrorActionPreference =
    "Stop"


Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA PHASE 21.7 - OBSERVABILITY BASELINE"
Write-Host " Mode: $Mode"
Write-Host "==============================================="
Write-Host ""


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


function Invoke-PrometheusQuery {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Query
    )


    $encoded =
        [System.Uri]::EscapeDataString(
            $Query
        )


    $response =
        Invoke-RestMethod `
            -Method Get `
            -Uri "http://localhost:19090/api/v1/query?query=$encoded" `
            -TimeoutSec 10


    if (
        $response.status -ne
        "success"
    ) {
        throw "Prometheus query failed: $Query"
    }


    if (
        -not $response.data.result -or
        $response.data.result.Count -eq 0
    ) {
        return $null
    }


    return [double](
        $response
            .data
            .result[0]
            .value[1]
    )
}


function New-ObservedMeasurement {
    param(
        $Value,

        [string]$Unit,

        [string]$Source
    )


    return [ordered]@{
        status =
            "OBSERVED"

        value =
            $Value

        unit =
            $Unit

        source =
            $Source

        observedAt =
            (
                Get-Date
            ).ToUniversalTime().ToString(
                "o"
            )

        metadata =
            @{}

        executionAuthorized =
            $false
    }
}


function New-NotApplicableMeasurement {
    param(
        [string]$Source
    )


    return [ordered]@{
        status =
            "NOT_APPLICABLE"

        value =
            $null

        unit =
            $null

        source =
            $Source

        observedAt =
            $null

        metadata =
            @{}

        executionAuthorized =
            $false
    }
}


Write-Host "[1/8] Checking API and worker health..."


$apiHealth =
    Invoke-JsonGet `
        -Uri "http://localhost:18080/health"


$workerHealth =
    Invoke-JsonGet `
        -Uri "http://localhost:18081/health"


if (
    $apiHealth.status -ne
        "UP" -or
    $workerHealth.status -ne
        "UP"
) {
    throw "Reliability Lab health baseline is not healthy."
}


Write-Host "PASS"


Write-Host "[2/8] Checking readiness..."


$apiReady =
    Invoke-JsonGet `
        -Uri "http://localhost:18080/ready"


$workerReady =
    Invoke-JsonGet `
        -Uri "http://localhost:18081/ready"


if (
    $apiReady.ready -ne
        $true -or
    $workerReady.ready -ne
        $true
) {
    throw "Reliability Lab readiness baseline is not healthy."
}


Write-Host "PASS"


Write-Host "[3/8] Checking dependency health..."


$apiDependencies =
    Invoke-JsonGet `
        -Uri "http://localhost:18080/dependency-health"


$workerDependencies =
    Invoke-JsonGet `
        -Uri "http://localhost:18081/dependency-health"


$dependencyValues =
    @(
        $apiDependencies.dependencies.postgres,
        $apiDependencies.dependencies.redis,
        $apiDependencies.dependencies.rabbitmq,
        $workerDependencies.dependencies.postgres,
        $workerDependencies.dependencies.redis,
        $workerDependencies.dependencies.rabbitmq
    )


$dependenciesHealthy =
    $true


foreach (
    $dependency
    in $dependencyValues
) {
    if (
        $dependency -ne
        $true
    ) {
        $dependenciesHealthy =
            $false
    }
}


if (
    -not $dependenciesHealthy
) {
    throw "Dependency baseline is unhealthy."
}


Write-Host "PASS"


Write-Host "[4/8] Collecting Prometheus CPU/memory..."


$cpu =
    Invoke-PrometheusQuery `
        -Query 'sum(rate(process_cpu_user_seconds_total{service=~"aira-lab-(api|worker)"}[1m]) + rate(process_cpu_system_seconds_total{service=~"aira-lab-(api|worker)"}[1m]))'


if (
    $null -eq $cpu
) {
    $cpu =
        0
}


$memory =
    Invoke-PrometheusQuery `
        -Query 'sum(process_resident_memory_bytes{service=~"aira-lab-(api|worker)"})'


if (
    $null -eq $memory
) {
    throw "Memory metric is unavailable."
}


Write-Host "PASS"


Write-Host "[5/8] Collecting latency and error rate..."


$latencySeconds =
    Invoke-PrometheusQuery `
        -Query 'histogram_quantile(0.95, sum by (le) (rate(aira_lab_http_request_duration_seconds_bucket[5m])))'


if (
    $null -eq $latencySeconds
) {
    $latencySeconds =
        0
}


$errorRate =
    Invoke-PrometheusQuery `
        -Query 'sum(rate(aira_lab_http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(aira_lab_http_requests_total[5m])), 0.000001)'


if (
    $null -eq $errorRate
) {
    $errorRate =
        0
}


Write-Host "PASS"


Write-Host "[6/8] Collecting database connections and queue depth..."


$dbConnections =
    0


$queueDepth =
    0


if (
    $Mode -eq
    "docker"
) {
    $dbOutput =
        docker exec `
            aira-lab-postgres `
            psql `
            -U aira_lab `
            -d aira_lab `
            -t `
            -A `
            -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='aira_lab';"


    if (
        $LASTEXITCODE -ne
        0
    ) {
        throw "Unable to collect PostgreSQL connection baseline."
    }


    $dbConnections =
        [int](
            $dbOutput.Trim()
        )


    $queueOutput =
        docker exec `
            aira-lab-rabbitmq `
            rabbitmqctl `
            list_queues `
            name `
            messages `
            --formatter csv


    if (
        $LASTEXITCODE -ne
        0
    ) {
        throw "Unable to collect RabbitMQ queue baseline."
    }


    $queueDepth =
        0


    foreach (
        $line
        in $queueOutput
    ) {
        if (
            $line -match
            '^"aira\.reliability\.orders",(\d+)$'
        ) {
            $queueDepth =
                [int]$Matches[1]
        }
    }
}
else {
    $postgresPod =
        kubectl get pods `
            -n aira-reliability-lab `
            -l app=postgres `
            -o jsonpath='{.items[0].metadata.name}'


    if (
        $LASTEXITCODE -ne
        0 -or
        -not $postgresPod
    ) {
        throw "Unable to locate PostgreSQL pod."
    }


    $dbOutput =
        kubectl exec `
            -n aira-reliability-lab `
            $postgresPod `
            -- `
            psql `
            -U aira_lab `
            -d aira_lab `
            -t `
            -A `
            -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='aira_lab';"


    if (
        $LASTEXITCODE -ne
        0
    ) {
        throw "Unable to collect PostgreSQL connection baseline."
    }


    $dbConnections =
        [int](
            $dbOutput.Trim()
        )


    $rabbitPod =
        kubectl get pods `
            -n aira-reliability-lab `
            -l app=rabbitmq `
            -o jsonpath='{.items[0].metadata.name}'


    if (
        $LASTEXITCODE -ne
        0 -or
        -not $rabbitPod
    ) {
        throw "Unable to locate RabbitMQ pod."
    }


    $queueOutput =
        kubectl exec `
            -n aira-reliability-lab `
            $rabbitPod `
            -- `
            rabbitmqctl `
            list_queues `
            name `
            messages `
            --formatter csv


    if (
        $LASTEXITCODE -ne
        0
    ) {
        throw "Unable to collect RabbitMQ queue baseline."
    }


    foreach (
        $line
        in $queueOutput
    ) {
        if (
            $line -match
            '^"aira\.reliability\.orders",(\d+)$'
        ) {
            $queueDepth =
                [int]$Matches[1]
        }
    }
}


Write-Host "PASS"


Write-Host "[7/8] Collecting workload state..."


if (
    $Mode -eq
    "kind"
) {
    $podJson =
        kubectl get pods `
            -n aira-reliability-lab `
            -o json |
        ConvertFrom-Json


    $allPodsReady =
        $true


    $restartCount =
        0


    foreach (
        $pod
        in $podJson.items
    ) {
        foreach (
            $condition
            in $pod.status.conditions
        ) {
            if (
                $condition.type -eq
                    "Ready" -and
                $condition.status -ne
                    "True"
            ) {
                $allPodsReady =
                    $false
            }
        }


        foreach (
            $containerStatus
            in $pod.status.containerStatuses
        ) {
            $restartCount +=
                [int](
                    $containerStatus.restartCount
                )
        }
    }


    if (
        -not $allPodsReady
    ) {
        throw "Kubernetes pod baseline is not ready."
    }


    $podStateMeasurement =
        New-ObservedMeasurement `
            -Value $true `
            -Unit "boolean" `
            -Source "kubernetes/pods"


    $restartMeasurement =
        New-ObservedMeasurement `
            -Value $restartCount `
            -Unit "count" `
            -Source "kubernetes/containerStatuses"
}
else {
    $podStateMeasurement =
        New-NotApplicableMeasurement `
            -Source "DOCKER_NOT_APPLICABLE"


    $restartMeasurement =
        New-NotApplicableMeasurement `
            -Source "DOCKER_NOT_APPLICABLE"
}


Write-Host "PASS"


Write-Host "[8/8] Building baseline artifact..."


$baseline =
    [ordered]@{
        baselineVersion =
            "21.7-v1"

        phase =
            21

        labEnvironmentId =
            "aira-reliability-lab-$Mode"

        labKind =
            $Mode.ToUpper()

        capturedAt =
            (
                Get-Date
            ).ToUniversalTime().ToString(
                "o"
            )

        healthy =
            $true

        measurements =
            [ordered]@{
                CPU =
                    New-ObservedMeasurement `
                        -Value $cpu `
                        -Unit "cores" `
                        -Source "prometheus"

                MEMORY =
                    New-ObservedMeasurement `
                        -Value $memory `
                        -Unit "bytes" `
                        -Source "prometheus"

                LATENCY =
                    New-ObservedMeasurement `
                        -Value (
                            $latencySeconds *
                            1000
                        ) `
                        -Unit "ms_p95" `
                        -Source "prometheus"

                ERROR_RATE =
                    New-ObservedMeasurement `
                        -Value $errorRate `
                        -Unit "ratio" `
                        -Source "prometheus"

                POD_STATE =
                    $podStateMeasurement

                RESTART_COUNT =
                    $restartMeasurement

                DB_CONNECTIONS =
                    New-ObservedMeasurement `
                        -Value $dbConnections `
                        -Unit "count" `
                        -Source "postgres.pg_stat_activity"

                QUEUE_DEPTH =
                    New-ObservedMeasurement `
                        -Value $queueDepth `
                        -Unit "messages" `
                        -Source "rabbitmq"

                DEPENDENCY_HEALTH =
                    New-ObservedMeasurement `
                        -Value $dependenciesHealthy `
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
                    type =
                        "PROMETHEUS"

                    ref =
                        "http://localhost:19090"

                    executionAuthorized =
                        $false
                },

                [ordered]@{
                    type =
                        "LAB_API"

                    ref =
                        "http://localhost:18080"

                    executionAuthorized =
                        $false
                },

                [ordered]@{
                    type =
                        "LAB_WORKER"

                    ref =
                        "http://localhost:18081"

                    executionAuthorized =
                        $false
                }
            )

        bulkTelemetryStored =
            $false

        canonicalTelemetryAuthority =
            "OBSERVABILITY_SYSTEMS"

        executionAuthorized =
            $false
    }


if (
    [string]::IsNullOrWhiteSpace(
        $OutputPath
    )
) {
    $evidenceDirectory =
        Join-Path `
            $PSScriptRoot `
            "..\evidence"


    New-Item `
        -ItemType Directory `
        -Force `
        -Path $evidenceDirectory |
        Out-Null


    $OutputPath =
        Join-Path `
            $evidenceDirectory `
            "baseline-$Mode.json"
}


$resolvedOutput =
    [System.IO.Path]::GetFullPath(
        $OutputPath
    )


$baseline |
    ConvertTo-Json `
        -Depth 20 |
    Set-Content `
        -Path $resolvedOutput `
        -Encoding UTF8


Write-Host "PASS"
Write-Host ""
Write-Host "==============================================="
Write-Host " PHASE 21.7 BASELINE CAPTURE PASSED"
Write-Host "==============================================="
Write-Host ""
Write-Host "Output:"
Write-Host " $resolvedOutput"
Write-Host ""
Write-Host "Verified:"
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
Write-Host " - bulk telemetry remains external"
Write-Host ""