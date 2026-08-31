param(

    [ValidateSet(
        "docker",
        "kind"
    )]

    [string]
    $Mode = "docker"
)


$ErrorActionPreference =
    "Stop"


$ApiBase =
    "http://localhost:18080"


$WorkerBase =
    "http://localhost:18081"


function Assert-True {

    param(

        [bool]
        $Condition,

        [string]
        $Message
    )


    if (-not $Condition) {

        throw $Message
    }
}


Write-Host ""
Write-Host "==============================================="
Write-Host " AIRA PHASE 21 BATCH-3 SMOKE TEST"
Write-Host " Mode: $Mode"
Write-Host "==============================================="
Write-Host ""


Write-Host "[1/7] API health..."

$ApiHealth =
    Invoke-RestMethod `
        -Uri "$ApiBase/health" `
        -Method Get


Assert-True `
    ($ApiHealth.status -eq "UP") `
    "API did not report UP."


Assert-True `
    ($ApiHealth.safetyClass -eq "LAB_ONLY") `
    "API did not report LAB_ONLY."


Assert-True `
    ($ApiHealth.executionAuthorized -eq $false) `
    "API unexpectedly authorized execution."


Write-Host "PASS"


Write-Host "[2/7] Worker health..."

$WorkerHealth =
    Invoke-RestMethod `
        -Uri "$WorkerBase/health" `
        -Method Get


Assert-True `
    ($WorkerHealth.status -eq "UP") `
    "Worker did not report UP."


Assert-True `
    ($WorkerHealth.safetyClass -eq "LAB_ONLY") `
    "Worker did not report LAB_ONLY."


Assert-True `
    ($WorkerHealth.executionAuthorized -eq $false) `
    "Worker unexpectedly authorized execution."


Write-Host "PASS"


Write-Host "[3/7] API readiness..."

$ApiReady =
    Invoke-RestMethod `
        -Uri "$ApiBase/ready" `
        -Method Get


Assert-True `
    ($ApiReady.ready -eq $true) `
    "API is not ready."


Assert-True `
    ($ApiReady.dependencies.postgres -eq $true) `
    "API cannot reach PostgreSQL."


Assert-True `
    ($ApiReady.dependencies.redis -eq $true) `
    "API cannot reach Redis."


Assert-True `
    ($ApiReady.dependencies.rabbitmq -eq $true) `
    "API cannot reach RabbitMQ."


Write-Host "PASS"


Write-Host "[4/7] Worker readiness..."

$WorkerReady =
    Invoke-RestMethod `
        -Uri "$WorkerBase/ready" `
        -Method Get


Assert-True `
    ($WorkerReady.ready -eq $true) `
    "Worker is not ready."


Assert-True `
    ($WorkerReady.workerConsuming -eq $true) `
    "Worker is not consuming RabbitMQ messages."


Write-Host "PASS"


Write-Host "[5/7] Create deterministic order..."

$Body =
    @{
        description =
            "AIRA Phase 21 Batch 3 certification order"
    } |
    ConvertTo-Json


$Order =
    Invoke-RestMethod `
        -Uri "$ApiBase/orders" `
        -Method Post `
        -ContentType "application/json" `
        -Body $Body


Assert-True `
    (-not [string]::IsNullOrWhiteSpace($Order.id)) `
    "Order ID was not returned."


Assert-True `
    ($Order.status -eq "CREATED") `
    "Order was not created."


Assert-True `
    ($Order.executionAuthorized -eq $false) `
    "Order response unexpectedly authorized execution."


Write-Host "PASS"
Write-Host "Order ID: $($Order.id)"


Write-Host "[6/7] Wait for worker processing..."

$Processed =
    $false


for ($Attempt = 1; $Attempt -le 20; $Attempt++) {

    Start-Sleep `
        -Seconds 1


    $CurrentOrder =
        Invoke-RestMethod `
            -Uri "$ApiBase/orders/$($Order.id)" `
            -Method Get


    if ($CurrentOrder.status -eq "PROCESSED") {

        $Processed =
            $true

        break
    }
}


Assert-True `
    $Processed `
    "Worker did not process the order within the expected time."


Write-Host "PASS"


Write-Host "[7/7] Metrics exposure..."

$ApiMetrics =
    Invoke-WebRequest `
        -Uri "$ApiBase/metrics" `
        -UseBasicParsing


$WorkerMetrics =
    Invoke-WebRequest `
        -Uri "$WorkerBase/metrics" `
        -UseBasicParsing


Assert-True `
    ($ApiMetrics.Content -match "aira_lab_orders_created_total") `
    "API metrics do not contain order creation metric."


Assert-True `
    ($WorkerMetrics.Content -match "aira_lab_orders_processed_total") `
    "Worker metrics do not contain order processing metric."


Write-Host "PASS"


Write-Host ""
Write-Host "==============================================="
Write-Host " PHASE 21 BATCH-3 SMOKE TEST PASSED"
Write-Host "==============================================="
Write-Host ""
Write-Host "Verified:"
Write-Host " - LAB_ONLY safety classification"
Write-Host " - executionAuthorized=false"
Write-Host " - PostgreSQL connectivity"
Write-Host " - Redis connectivity"
Write-Host " - RabbitMQ connectivity"
Write-Host " - API -> queue -> worker flow"
Write-Host " - deterministic persisted order state"
Write-Host " - Prometheus metric exposure"
Write-Host ""