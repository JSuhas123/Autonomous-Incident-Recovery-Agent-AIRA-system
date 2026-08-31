"use strict";

require("dotenv").config();


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  LiveIntegrationCapacityCertification,
} =
  require(
    "../services/reliability/chaos/liveIntegrationCapacityCertification"
  );


// ============================================================================
// CONFIGURATION
// ============================================================================

const ORGANIZATION_ID =
  process.env
    .PHASE21_CERT_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .PHASE21_CERT_ENVIRONMENT_ID ||
  "env_aira_development";


const TENANT_ID =
  process.env
    .PHASE21_OTEL_TENANT_ID ||
  ORGANIZATION_ID;


const OTEL_INTEGRATION_ID =
  nullableString(
    process.env
      .PHASE21_OTEL_INTEGRATION_ID
  );


const STAGE_DURATION_SECONDS =
  positiveInteger(
    process.env
      .PHASE21_CAPACITY_STAGE_SECONDS,

    10
  );


const MAX_CONCURRENCY =
  positiveInteger(
    process.env
      .PHASE21_CAPACITY_MAX_CONCURRENCY,

    256
  );


const BASELINE_RATE =
  positiveNumber(
    process.env
      .PHASE21_CAPACITY_BASELINE_RATE,

    5
  );


const RATES =
  parseNumberList(
    process.env
      .PHASE21_CAPACITY_RATES ||
    "25,50,100,250,500"
  );


const PROVIDERS =
  parseStringList(
    process.env
      .PHASE21_CAPACITY_PROVIDERS ||
    "webhook_incoming,prometheus_alertmanager,grafana_alerting,opentelemetry"
  );


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printHeader();


  validateConfiguration();


  const certification =
    new LiveIntegrationCapacityCertification({
      stageDurationSeconds:
        STAGE_DURATION_SECONDS,

      baselineRatePerSecond:
        BASELINE_RATE,

      maxConcurrency:
        MAX_CONCURRENCY,
    });


  const startedAt =
    new Date();


  const started =
    Date.now();


  const context = {
    organizationId:
      ORGANIZATION_ID,

    environmentId:
      ENVIRONMENT_ID,

    tenantId:
      TENANT_ID,

    reliabilityLab:
      true,

    safetyClass:
      "LAB_ONLY",

    production:
      false,

    executionAuthorized:
      false,

    integrationIds: {
      ...(OTEL_INTEGRATION_ID
        ? {
            opentelemetry:
              OTEL_INTEGRATION_ID,
          }
        : {}),
    },
  };


  const result =
    await certification.run({
      providers:
        PROVIDERS,

      rates:
        RATES,

      context,
    });


  const durationMs =
    Date.now() -
    started;


  printResults(
    result
  );


  const artifact =
    buildArtifact({
      result,

      startedAt,

      durationMs,
    });


  const artifactPath =
    writeArtifact(
      artifact
    );


  validateCertificationResult(
    result
  );


  console.log(
    "\n=============================================================="
  );

  console.log(
    "SUMMARY"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Providers tested:            ${result.summary.providerCount}`
  );

  console.log(
    `No degradation observed:     ${result.summary.providersWithoutObservedDegradation}`
  );

  console.log(
    `Degradation observed:        ${result.summary.providersWithObservedDegradation}`
  );

  console.log(
    `Breaking point observed:     ${result.summary.providersWithObservedBreakingPoint}`
  );

  console.log(
    `Recovered to baseline:       ${result.summary.providersRecoveredToBaseline}`
  );

  console.log(
    "Execution authorized:        false"
  );

  console.log(
    "Production certification:    false"
  );

  console.log(
    "External provider capacity:  NOT CLAIMED"
  );

  console.log(
    "=============================================================="
  );


  console.log(
    `\nCapacity artifact: ${artifactPath}`
  );


  console.log(
    "\nPHASE 21.10B LIVE CAPACITY RESULT: PASS"
  );

  console.log(
    "All tested providers had a healthy baseline and returned to baseline.\n"
  );
}


// ============================================================================
// VALIDATION
// ============================================================================

function validateConfiguration() {
  if (
    !ORGANIZATION_ID
  ) {
    throw scriptError(
      "PHASE21_ORGANIZATION_REQUIRED",

      "PHASE21_CERT_ORGANIZATION_ID is required"
    );
  }


  if (
    !ENVIRONMENT_ID
  ) {
    throw scriptError(
      "PHASE21_ENVIRONMENT_REQUIRED",

      "PHASE21_CERT_ENVIRONMENT_ID is required"
    );
  }


  if (
    PROVIDERS.includes(
      "opentelemetry"
    ) &&
    !OTEL_INTEGRATION_ID
  ) {
    throw scriptError(
      "PHASE21_OTEL_INTEGRATION_REQUIRED",

      "OpenTelemetry is selected but PHASE21_OTEL_INTEGRATION_ID is not configured. Run bootstrap-phase21-otel-lab-integration.js first."
    );
  }


  if (
    !Array.isArray(
      RATES
    ) ||
    RATES.length ===
      0
  ) {
    throw scriptError(
      "PHASE21_CAPACITY_RATES_REQUIRED",

      "At least one capacity rate is required"
    );
  }


  if (
    !Array.isArray(
      PROVIDERS
    ) ||
    PROVIDERS.length ===
      0
  ) {
    throw scriptError(
      "PHASE21_CAPACITY_PROVIDERS_REQUIRED",

      "At least one capacity provider is required"
    );
  }
}


function validateCertificationResult(
  result
) {
  if (
    !result ||
    !Array.isArray(
      result.providers
    )
  ) {
    throw scriptError(
      "PHASE21_CAPACITY_RESULT_INVALID",

      "Capacity certification returned an invalid result"
    );
  }


  for (
    const providerResult
    of result.providers
  ) {
    const baseline =
      providerResult
        ?.result
        ?.baseline;


    if (
      !baseline
    ) {
      throw scriptError(
        "PHASE21_CAPACITY_BASELINE_MISSING",

        `${providerResult.provider} did not produce baseline evidence`
      );
    }


    if (
      Number(
        baseline.successRate
      ) <
        0.99 ||
      Number(
        baseline.errorRate
      ) >
        0.01 ||
      Number(
        baseline.timedOutRequests ||
        0
      ) >
        0
    ) {
      throw scriptError(
        "PHASE21_CAPACITY_BASELINE_UNHEALTHY",

        `${providerResult.provider} did not begin from a healthy baseline`
      );
    }


    const recovery =
      providerResult
        ?.result
        ?.recovery
        ?.evaluation;


    if (
      !recovery ||
      recovery.recovered !==
        true
    ) {
      throw scriptError(
        "PHASE21_CAPACITY_RECOVERY_FAILED",

        `${providerResult.provider} failed to return to its healthy baseline`
      );
    }


    if (
      recovery
        .baselineHealthy ===
        false
    ) {
      throw scriptError(
        "PHASE21_CAPACITY_FALSE_RECOVERY",

        `${providerResult.provider} recovery was evaluated against an unhealthy baseline`
      );
    }
  }
}


// ============================================================================
// OUTPUT
// ============================================================================

function printHeader() {
  console.log(
    "\n=============================================================="
  );

  console.log(
    "AIRA PHASE 21.10B LIVE INTEGRATION CAPACITY CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Organization:      ${ORGANIZATION_ID}`
  );

  console.log(
    `Environment:       ${ENVIRONMENT_ID}`
  );

  console.log(
    `Providers:         ${PROVIDERS.join(
      ", "
    )}`
  );

  console.log(
    `Rates:             ${RATES.join(
      ", "
    )} req/s`
  );

  console.log(
    `Baseline:          ${BASELINE_RATE} req/s`
  );

  console.log(
    `Stage duration:    ${STAGE_DURATION_SECONDS}s`
  );

  console.log(
    `Max concurrency:   ${MAX_CONCURRENCY}`
  );

  console.log(
    "Safety class:      LAB_ONLY"
  );

  console.log(
    "Production target: false"
  );

  console.log(
    "Execution auth:    false"
  );


  if (
    PROVIDERS.includes(
      "opentelemetry"
    )
  ) {
    console.log(
      `OTel integration:  ${OTEL_INTEGRATION_ID || "NOT CONFIGURED"}`
    );

    console.log(
      `OTel tenant:       ${TENANT_ID}`
    );
  }


  console.log(
    "==============================================================\n"
  );
}


function printResults(
  result
) {
  for (
    const providerResult
    of result.providers
  ) {
    const provider =
      providerResult.provider;


    const mode =
      providerResult.mode;


    const run =
      providerResult.result;


    console.log(
      "\n--------------------------------------------------------------"
    );

    console.log(
      `${provider} (${mode})`
    );

    console.log(
      "--------------------------------------------------------------"
    );


    printBaseline(
      run.baseline
    );


    for (
      const stage
      of run.stages ||
      []
    ) {
      console.log(
        [
          `Target=${formatNumber(
            stage.targetRatePerSecond
          )}/s`,

          `Actual=${formatNumber(
            stage.achievedRatePerSecond
          )}/s`,

          `Success=${formatNumber(
            stage.successfulRatePerSecond
          )}/s`,

          `State=${stage.capacityState || "UNKNOWN"}`,

          `p95=${formatLatency(
            stage.p95LatencyMs
          )}`,

          `p99=${formatLatency(
            stage.p99LatencyMs
          )}`,

          `Errors=${formatPercent(
            stage.errorRate
          )}`,

          `Timeouts=${stage.timedOutRequests || 0}`,

          `Rejected=${stage.rejectedRequests || 0}`,

          `429=${stage.rateLimitedRequests || 0}`,
        ].join(
          " | "
        )
      );
    }


    console.log(
      `\nSafe sustained rate: ${formatNumber(
        run.safeSustainedRatePerSecond
      )}/s`
    );


    console.log(
      `Degradation point:   ${formatPoint(
        run.degradationPoint
      )}`
    );


    console.log(
      `Saturation point:    ${formatPoint(
        run.saturationPoint
      )}`
    );


    console.log(
      `Breaking point:      ${formatPoint(
        run.breakingPoint
      )}`
    );


    const recovery =
      run
        ?.recovery;


    console.log(
      `Recovery:            ${
        recovery
          ?.evaluation
          ?.recovered ===
        true
          ? "PASS"
          : "FAIL"
      }`
    );


    console.log(
      `Recovery p95:        ${formatLatency(
        recovery
          ?.metrics
          ?.p95LatencyMs
      )}`
    );
  }
}


function printBaseline(
  baseline
) {
  if (
    !baseline
  ) {
    console.log(
      "Baseline | MISSING"
    );

    return;
  }


  console.log(
    [
      "Baseline",

      `target=${formatNumber(
        baseline.targetRatePerSecond
      )}/s`,

      `actual=${formatNumber(
        baseline.achievedRatePerSecond
      )}/s`,

      `success=${formatNumber(
        baseline.successfulRatePerSecond
      )}/s`,

      `p95=${formatLatency(
        baseline.p95LatencyMs
      )}`,

      `p99=${formatLatency(
        baseline.p99LatencyMs
      )}`,

      `errors=${formatPercent(
        baseline.errorRate
      )}`,
    ].join(
      " | "
    )
  );
}


function formatPoint(
  point
) {
  if (
    !point
  ) {
    return "NOT OBSERVED";
  }


  return [
    `${formatNumber(
      point.targetRatePerSecond
    )}/s`,

    point.capacityState ||
      "UNKNOWN",

    `p95=${formatLatency(
      point.p95LatencyMs
    )}`,

    `success=${formatPercent(
      point.successRate
    )}`,
  ].join(
    " | "
  );
}


function formatLatency(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "n/a";
  }


  return `${formatNumber(
    value
  )}ms`;
}


function formatPercent(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "n/a";
  }


  return `${(
    Number(value) *
    100
  ).toFixed(
    2
  )}%`;
}


function formatNumber(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return "n/a";
  }


  return Number(
    Number(value)
      .toFixed(
        4
      )
  );
}


// ============================================================================
// ARTIFACT
// ============================================================================

function buildArtifact({
  result,

  startedAt,

  durationMs,
}) {
  return {
    phase:
      "21",

    subphase:
      "21.10B",

    certification:
      "LIVE_AIRA_SIDE_INTEGRATION_CAPACITY",

    generatedAt:
      new Date()
        .toISOString(),

    machineSpecific:
      true,

    interpretation: {
      capacityNumbersAreEnvironmentSpecific:
        true,

      externalProviderLimitsIncluded:
        false,

      thirdPartyProviderCapacityClaimed:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },

    configuration: {
      organizationId:
        ORGANIZATION_ID,

      environmentId:
        ENVIRONMENT_ID,

      tenantId:
        TENANT_ID,

      providers:
        PROVIDERS,

      rates:
        RATES,

      baselineRatePerSecond:
        BASELINE_RATE,

      stageDurationSeconds:
        STAGE_DURATION_SECONDS,

      maxConcurrency:
        MAX_CONCURRENCY,

      opentelemetryIntegrationConfigured:
        Boolean(
          OTEL_INTEGRATION_ID
        ),
    },

    startedAt:
      startedAt
        .toISOString(),

    durationMs,

    result,

    executionAuthorized:
      false,
  };
}


function writeArtifact(
  artifact
) {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  fs.mkdirSync(
    directory,

    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );


  const file =
    path.join(
      directory,

      `phase21-10b-live-capacity-${timestamp}.json`
    );


  fs.writeFileSync(
    file,

    JSON.stringify(
      artifact,
      null,
      2
    ),

    "utf8"
  );


  return file;
}


// ============================================================================
// PARSING
// ============================================================================

function parseStringList(
  value
) {
  return [
    ...new Set(
      String(
        value ||
        ""
      )
        .split(
          ","
        )
        .map(
          (
            item
          ) =>
            item
              .trim()
        )
        .filter(
          Boolean
        )
    ),
  ];
}


function parseNumberList(
  value
) {
  return [
    ...new Set(
      String(
        value ||
        ""
      )
        .split(
          ","
        )
        .map(
          (
            item
          ) =>
            Number(
              item.trim()
            )
        )
        .filter(
          (
            item
          ) =>
            Number.isFinite(
              item
            ) &&
            item >
              0
        )
    ),
  ];
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function positiveNumber(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}


function nullableString(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const normalized =
    String(
      value
    )
      .trim();


  return normalized ||
    null;
}


function scriptError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21CapacityCertificationScriptError",

      code,

      executionAuthorized:
        false,
    }
  );
}


// ============================================================================
// EXECUTION
// ============================================================================

main()
  .then(
    () => {
      process.exit(
        0
      );
    }
  )
  .catch(
    (
      error
    ) => {
      console.error(
        "\nPHASE 21.10B LIVE CAPACITY RESULT: FAIL"
      );

      console.error(
        error
      );


      process.exit(
        1
      );
    }
  );