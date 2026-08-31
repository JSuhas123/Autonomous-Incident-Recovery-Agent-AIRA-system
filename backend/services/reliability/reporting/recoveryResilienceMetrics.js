"use strict";


const METRIC_VERSION =
  "21.10D-metrics-v1";


const MEASUREMENT_STATUS =
  Object.freeze({
    MEASURED:
      "MEASURED",

    DERIVED:
      "DERIVED",

    NOT_MEASURED:
      "NOT_MEASURED",

    NOT_APPLICABLE:
      "NOT_APPLICABLE",
  });


// ============================================================================
// PUBLIC API
// ============================================================================

function deriveRecoveryMetrics(
  evidence = {}
) {
  return {
    metricVersion:
      METRIC_VERSION,

    timing:
      deriveTimingMetrics(
        evidence.timing
      ),

    resilience:
      deriveResilienceMetrics(
        evidence.resilience
      ),

    capacity:
      deriveCapacityMetrics(
        evidence.capacity
      ),

    tenancy:
      deriveTenancyMetrics(
        evidence.tenancy
      ),

    authority:
      nonAuthorizingAuthority(),
  };
}


// ============================================================================
// TIMING
// ============================================================================

function deriveTimingMetrics(
  timing = {}
) {
  return {
    ttdMs:
      durationMetric(
        timing.failureInjectedAt,
        timing.detectedAt,
        "TTD"
      ),

    ttcMs:
      durationMetric(
        timing.detectedAt,
        timing.correlatedAt,
        "TTC"
      ),

    ttDiagnoseMs:
      durationMetric(
        timing.correlatedAt,
        timing.diagnosedAt,
        "TTDiagnose"
      ),

    ttDecisionMs:
      durationMetric(
        timing.diagnosedAt,
        timing.decisionAt,
        "TTDecision"
      ),

    ttExecuteMs:
      durationMetric(
        timing.executionStartedAt,
        timing.executionCompletedAt,
        "TTExecute"
      ),

    ttvMs:
      durationMetric(
        timing.executionCompletedAt,
        timing.verifiedAt,
        "TTV"
      ),

    mttrMs:
      durationMetric(
        timing.failureInjectedAt,
        timing.verifiedAt,
        "MTTR"
      ),

    infrastructureRecoveryMs:
      durationMetric(
        timing.infrastructureFailureAt,
        timing.infrastructureRecoveredAt,
        "Infrastructure Recovery Time"
      ),

    queueDrainMs:
      durationMetric(
        timing.queueDrainStartedAt,
        timing.queueDrainCompletedAt,
        "Queue Drain Time"
      ),

    baselineRestorationMs:
      durationMetric(
        timing.baselineLostAt,
        timing.baselineRestoredAt,
        "Baseline Restoration Time"
      ),
  };
}


// ============================================================================
// RESILIENCE
// ============================================================================

function deriveResilienceMetrics(
  resilience = {}
) {
  const baseline =
    normalizeSnapshot(
      resilience.baseline
    );


  const degraded =
    normalizeSnapshot(
      resilience.degraded
    );


  const recovered =
    normalizeSnapshot(
      resilience.recovered
    );


  return {
    degradationFactor:
      calculateDegradationFactor(
        baseline,
        degraded
      ),

    recoveryEfficiency:
      calculateRecoveryEfficiency(
        baseline,
        recovered
      ),

    recoveryAmplification:
      calculateRecoveryAmplification(
        resilience
          .failureWorkUnits,
        resilience
          .recoveryWorkUnits
      ),

    baselineRestored:
      booleanMetric(
        resilience.baselineRestored,
        "Baseline Restored"
      ),

    dataLoss:
      countMetric(
        resilience.dataLossCount,
        "Data Loss Count"
      ),

    duplicateProcessingRate:
      ratioMetric(
        resilience
          .duplicateProcessingCount,
        resilience
          .processedCount,
        "Duplicate Processing Rate"
      ),

    recoveryOutcome:
      enumMetric(
        resilience.recoveryOutcome,
        [
          "IMPROVED",
          "RESTORED",
          "UNCHANGED",
          "WORSENED",
          "FAILED",
          "INCONCLUSIVE",
        ],
        "Recovery Outcome"
      ),
  };
}


// ============================================================================
// CAPACITY
// ============================================================================

function deriveCapacityMetrics(
  capacity = {}
) {
  const providers =
    Array.isArray(
      capacity.providers
    )
      ? capacity.providers
      : [];


  return {
    providers:
      providers.map(
        normalizeProviderCapacity
      ),

    providerCount:
      providers.length,

    allProvidersRecovered:
      providers.length >
        0
        ? providers.every(
            (
              provider
            ) =>
              provider
                ?.recoveryPassed ===
              true
          )
        : null,

    claims:
      {
        measuredEnvelopeNotMaximum:
          true,

        productionSloClaimed:
          false,

        universalMaximumClaimed:
          false,

        externalProviderLimitClaimed:
          false,
      },
  };
}


function normalizeProviderCapacity(
  provider = {}
) {
  return {
    provider:
      provider.provider ||
      null,

    operation:
      provider.operation ||
      null,

    pathClass:
      provider.pathClass ||
      null,

    highestTestedOfferedRatePerSecond:
      finiteOrNull(
        provider
          .highestTestedOfferedRatePerSecond
      ),

    highestObservedSuccessfulRatePerSecond:
      finiteOrNull(
        provider
          .highestObservedSuccessfulRatePerSecond
      ),

    safeSustainedRatePerSecond:
      finiteOrNull(
        provider
          .safeSustainedRatePerSecond
      ),

    degradationPoint:
      normalizeCapacityPoint(
        provider.degradationPoint
      ),

    saturationPoint:
      normalizeCapacityPoint(
        provider.saturationPoint
      ),

    breakingPoint:
      normalizeCapacityPoint(
        provider.breakingPoint
      ),

    loadGeneratorLimit:
      normalizeCapacityPoint(
        provider.loadGeneratorLimit
      ),

    highestHealthyStage:
      normalizeCapacityPoint(
        provider.highestHealthyStage
      ),

    recoveryPassed:
      provider.recoveryPassed ===
      true,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


function normalizeCapacityPoint(
  point
) {
  if (
    !point ||
    typeof point !==
      "object"
  ) {
    return null;
  }


  return {
    targetRatePerSecond:
      finiteOrNull(
        point.targetRatePerSecond
      ),

    achievedRatePerSecond:
      finiteOrNull(
        point.achievedRatePerSecond
      ),

    successfulRatePerSecond:
      finiteOrNull(
        point.successfulRatePerSecond
      ),

    state:
      point.state ||
      null,

    successRate:
      finiteOrNull(
        point.successRate
      ),

    errorRate:
      finiteOrNull(
        point.errorRate
      ),

    p50LatencyMs:
      finiteOrNull(
        point.p50LatencyMs
      ),

    p95LatencyMs:
      finiteOrNull(
        point.p95LatencyMs
      ),

    p99LatencyMs:
      finiteOrNull(
        point.p99LatencyMs
      ),

    failedRequests:
      finiteOrNull(
        point.failedRequests
      ),

    rejectedRequests:
      finiteOrNull(
        point.rejectedRequests
      ),

    timedOutRequests:
      finiteOrNull(
        point.timedOutRequests
      ),

    rateLimitedRequests:
      finiteOrNull(
        point.rateLimitedRequests
      ),

    generatorDroppedRequests:
      finiteOrNull(
        point.generatorDroppedRequests
      ),
  };
}


// ============================================================================
// TENANCY
// ============================================================================

function deriveTenancyMetrics(
  tenancy = {}
) {
  const scaleRuns =
    Array.isArray(
      tenancy.scaleRuns
    )
      ? tenancy.scaleRuns
      : [];


  const normalizedRuns =
    scaleRuns
      .map(
        normalizeTenantScaleRun
      )
      .sort(
        (
          left,
          right
        ) =>
          (
            left.tenantCount ||
            0
          ) -
          (
            right.tenantCount ||
            0
          )
      );


  const interferenceValues =
    normalizedRuns
      .map(
        (
          run
        ) =>
          run.tenantInterferenceFactor
      )
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            value
          )
      );


  return {
    tenantScales:
      normalizedRuns.map(
        (
          run
        ) =>
          run.tenantCount
      ),

    scaleRuns:
      normalizedRuns,

    maximumTenantInterferenceFactor:
      interferenceValues.length >
        0
        ? Math.max(
            ...interferenceValues
          )
        : null,

    boundaryViolations:
      finiteOrNull(
        tenancy.boundaryViolations
      ),

    redisIdempotencyCollisions:
      finiteOrNull(
        tenancy
          .redisIdempotencyCollisions
      ),

    rabbitMqEnvelopeLeaks:
      finiteOrNull(
        tenancy
          .rabbitMqEnvelopeLeaks
      ),

    starvedControlTenants:
      finiteOrNull(
        tenancy
          .starvedControlTenants
      ),

    recoveryPassed:
      tenancy.recoveryPassed ===
      true,

    productionCertified:
      false,

    executionAuthorized:
      false,
  };
}


function normalizeTenantScaleRun(
  run = {}
) {
  return {
    tenantCount:
      finiteOrNull(
        run.tenantCount
      ),

    pass:
      run.pass ===
      true,

    boundaryViolations:
      finiteOrZero(
        run.boundaryViolations
      ),

    starvedControls:
      finiteOrZero(
        run.starvedControls
      ),

    tenantInterferenceFactor:
      firstFinite(
        run
          .tenantInterferenceFactor,
        run
          .maxInterference,
        run
          .maximumInterference
      ),

    recoveryPassed:
      run.recoveryPassed ===
      true,
  };
}


// ============================================================================
// DERIVED FORMULAS
// ============================================================================

function calculateDegradationFactor(
  baseline,
  degraded
) {
  if (
    !baseline ||
    !degraded
  ) {
    return notMeasured(
      "Degradation Factor",
      "Baseline and degraded snapshots are required"
    );
  }


  if (
    positiveFinite(
      baseline.p95LatencyMs
    ) &&
    positiveFinite(
      degraded.p95LatencyMs
    )
  ) {
    return derivedMetric(
      degraded.p95LatencyMs /
        baseline.p95LatencyMs,

      "Degradation Factor",

      "degraded_p95_latency / baseline_p95_latency"
    );
  }


  if (
    positiveFinite(
      baseline.successfulRatePerSecond
    ) &&
    nonNegativeFinite(
      degraded.successfulRatePerSecond
    )
  ) {
    return derivedMetric(
      baseline.successfulRatePerSecond /
        Math.max(
          degraded
            .successfulRatePerSecond,
          Number.EPSILON
        ),

      "Degradation Factor",

      "baseline_successful_rate / degraded_successful_rate"
    );
  }


  return notMeasured(
    "Degradation Factor",
    "Comparable baseline/degraded latency or throughput was not recorded"
  );
}


function calculateRecoveryEfficiency(
  baseline,
  recovered
) {
  if (
    !baseline ||
    !recovered
  ) {
    return notMeasured(
      "Recovery Efficiency",
      "Baseline and recovered snapshots are required"
    );
  }


  if (
    positiveFinite(
      baseline.successfulRatePerSecond
    ) &&
    nonNegativeFinite(
      recovered.successfulRatePerSecond
    )
  ) {
    return derivedMetric(
      recovered.successfulRatePerSecond /
        baseline.successfulRatePerSecond,

      "Recovery Efficiency",

      "recovered_successful_rate / baseline_successful_rate"
    );
  }


  if (
    positiveFinite(
      baseline.p95LatencyMs
    ) &&
    positiveFinite(
      recovered.p95LatencyMs
    )
  ) {
    return derivedMetric(
      baseline.p95LatencyMs /
        recovered.p95LatencyMs,

      "Recovery Efficiency",

      "baseline_p95_latency / recovered_p95_latency"
    );
  }


  return notMeasured(
    "Recovery Efficiency",
    "Comparable baseline/recovered throughput or latency was not recorded"
  );
}


function calculateRecoveryAmplification(
  failureWorkUnits,
  recoveryWorkUnits
) {
  if (
    !positiveFinite(
      failureWorkUnits
    ) ||
    !nonNegativeFinite(
      recoveryWorkUnits
    )
  ) {
    return notMeasured(
      "Recovery Amplification",
      "Failure-work and recovery-work measurements are required"
    );
  }


  return derivedMetric(
    recoveryWorkUnits /
      failureWorkUnits,

    "Recovery Amplification",

    "recovery_work_units / failure_work_units"
  );
}


// ============================================================================
// SNAPSHOTS
// ============================================================================

function normalizeSnapshot(
  snapshot
) {
  if (
    !snapshot ||
    typeof snapshot !==
      "object"
  ) {
    return null;
  }


  return {
    successfulRatePerSecond:
      firstFinite(
        snapshot
          .successfulRatePerSecond,
        snapshot
          .throughputPerSecond
      ),

    p50LatencyMs:
      firstFinite(
        snapshot.p50LatencyMs
      ),

    p95LatencyMs:
      firstFinite(
        snapshot.p95LatencyMs
      ),

    p99LatencyMs:
      firstFinite(
        snapshot.p99LatencyMs
      ),

    errorRate:
      firstFinite(
        snapshot.errorRate
      ),
  };
}


// ============================================================================
// METRIC BUILDERS
// ============================================================================

function durationMetric(
  start,
  end,
  name
) {
  const startMs =
    timestampToMs(
      start
    );


  const endMs =
    timestampToMs(
      end
    );


  if (
    startMs ===
      null ||
    endMs ===
      null ||
    endMs <
      startMs
  ) {
    return notMeasured(
      name,
      "Required timestamps were not recorded"
    );
  }


  return {
    name,

    status:
      MEASUREMENT_STATUS
        .MEASURED,

    value:
      endMs -
      startMs,

    unit:
      "ms",
  };
}


function booleanMetric(
  value,
  name
) {
  if (
    typeof value !==
      "boolean"
  ) {
    return notMeasured(
      name,
      "Boolean evidence was not recorded"
    );
  }


  return {
    name,

    status:
      MEASUREMENT_STATUS
        .MEASURED,

    value,

    unit:
      "boolean",
  };
}


function countMetric(
  value,
  name
) {
  if (
    !nonNegativeFinite(
      value
    )
  ) {
    return notMeasured(
      name,
      "Count evidence was not recorded"
    );
  }


  return {
    name,

    status:
      MEASUREMENT_STATUS
        .MEASURED,

    value:

      Number(
        value
      ),

    unit:
      "count",
  };
}


function ratioMetric(
  numerator,
  denominator,
  name
) {
  if (
    !nonNegativeFinite(
      numerator
    ) ||
    !positiveFinite(
      denominator
    )
  ) {
    return notMeasured(
      name,
      "Numerator and denominator were not both recorded"
    );
  }


  return derivedMetric(
    Number(
      numerator
    ) /
      Number(
        denominator
      ),

    name,

    "numerator / denominator"
  );
}


function enumMetric(
  value,
  allowed,
  name
) {
  if (
    typeof value !==
      "string" ||
    !allowed.includes(
      value
    )
  ) {
    return notMeasured(
      name,
      "Recognized recovery outcome was not recorded"
    );
  }


  return {
    name,

    status:
      MEASUREMENT_STATUS
        .MEASURED,

    value,

    unit:
      "enum",
  };
}


function derivedMetric(
  value,
  name,
  formula
) {
  if (
    !Number.isFinite(
      value
    )
  ) {
    return notMeasured(
      name,
      "Derived value was not finite"
    );
  }


  return {
    name,

    status:
      MEASUREMENT_STATUS
        .DERIVED,

    value,

    unit:
      "ratio",

    formula,
  };
}


function notMeasured(
  name,
  reason
) {
  return {
    name,

    status:
      MEASUREMENT_STATUS
        .NOT_MEASURED,

    value:
      null,

    unit:
      null,

    reason,
  };
}


// ============================================================================
// SAFETY
// ============================================================================

function nonAuthorizingAuthority() {
  return {
    productionCertified:
      false,

    executionAuthorized:
      false,

    canGrantExecutionAuthorization:
      false,

    canGrantAutonomy:
      false,

    canModifyProductionAuthority:
      false,

    phase21IsEvidenceOnly:
      true,

    phase22ConsumesEvidence:
      true,
  };
}


// ============================================================================
// PRIMITIVES
// ============================================================================

function timestampToMs(
  value
) {
  if (
    value instanceof Date
  ) {
    const ms =
      value.getTime();


    return Number.isFinite(
      ms
    )
      ? ms
      : null;
  }


  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }


  if (
    typeof value ===
      "string" &&
    value.trim() !==
      ""
  ) {
    const ms =
      Date.parse(
        value
      );


    return Number.isFinite(
      ms
    )
      ? ms
      : null;
  }


  return null;
}


function firstFinite(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      typeof value ===
        "number" &&
      Number.isFinite(
        value
      )
    ) {
      return value;
    }


    if (
      typeof value ===
        "string" &&
      value.trim() !==
        ""
    ) {
      const parsed =
        Number(
          value
        );


      if (
        Number.isFinite(
          parsed
        )
      ) {
        return parsed;
      }
    }
  }


  return null;
}


function finiteOrNull(
  value
) {
  return firstFinite(
    value
  );
}


function finiteOrZero(
  value
) {
  const result =
    firstFinite(
      value
    );


  return result ===
    null
    ? 0
    : result;
}


function positiveFinite(
  value
) {
  return (
    Number.isFinite(
      Number(
        value
      )
    ) &&
    Number(
      value
    ) >
      0
  );
}


function nonNegativeFinite(
  value
) {
  return (
    Number.isFinite(
      Number(
        value
      )
    ) &&
    Number(
      value
    ) >=
      0
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  METRIC_VERSION,

  MEASUREMENT_STATUS,

  deriveRecoveryMetrics,

  deriveTimingMetrics,

  deriveResilienceMetrics,

  deriveCapacityMetrics,

  deriveTenancyMetrics,

  calculateDegradationFactor,

  calculateRecoveryEfficiency,

  calculateRecoveryAmplification,

  durationMetric,

  normalizeProviderCapacity,

  normalizeTenantScaleRun,

  nonAuthorizingAuthority,
};