"use strict";


const CAPACITY_THRESHOLD_VERSION =
  "21.10B-v1";


const CAPACITY_STATE =
  Object.freeze({
    HEALTHY:
      "HEALTHY",

    DEGRADED:
      "DEGRADED",

    SATURATED:
      "SATURATED",

    BROKEN:
      "BROKEN",
  });


const DEFAULT_THRESHOLDS =
  Object.freeze({
    degraded: {
      minimumSuccessRate:
        0.99,

      maximumErrorRate:
        0.01,

      maximumLatencyFactor:
        2.0,

      minimumThroughputEfficiency:
        0.90,
    },


    saturated: {
      minimumSuccessRate:
        0.95,

      maximumErrorRate:
        0.05,

      maximumLatencyFactor:
        4.0,

      minimumThroughputEfficiency:
        0.75,
    },


    broken: {
      minimumSuccessRate:
        0.80,

      maximumErrorRate:
        0.20,

      maximumLatencyFactor:
        10.0,

      minimumThroughputEfficiency:
        0.50,
    },
  });


function evaluateCapacityStage({
  baseline,

  current,

  thresholds =
    DEFAULT_THRESHOLDS,
} = {}) {
  requireMetrics(
    baseline,
    "baseline"
  );


  requireMetrics(
    current,
    "current"
  );


  const latencyFactor =
    calculateLatencyFactor(
      baseline,
      current
    );


  const throughputEfficiency =
    calculateThroughputEfficiency(
      current
    );


  const signals = {
    successRate:
      Number(
        current.successRate
      ),

    errorRate:
      Number(
        current.errorRate
      ),

    latencyFactor,

    throughputEfficiency,

    timedOutRequests:
      Number(
        current.timedOutRequests ||
        0
      ),

    rejectedRequests:
      Number(
        current.rejectedRequests ||
        0
      ),

    rateLimitedRequests:
      Number(
        current.rateLimitedRequests ||
        0
      ),
  };


  let state =
    CAPACITY_STATE
      .HEALTHY;


  if (
    exceedsBrokenThreshold(
      signals,
      thresholds.broken
    )
  ) {
    state =
      CAPACITY_STATE
        .BROKEN;
  }
  else if (
    exceedsThreshold(
      signals,
      thresholds.saturated
    )
  ) {
    state =
      CAPACITY_STATE
        .SATURATED;
  }
  else if (
    exceedsThreshold(
      signals,
      thresholds.degraded
    )
  ) {
    state =
      CAPACITY_STATE
        .DEGRADED;
  }


  return Object.freeze({
    evaluatorVersion:
      CAPACITY_THRESHOLD_VERSION,

    state,

    signals:
      Object.freeze({
        ...signals,
      }),

    executionAuthorized:
      false,
  });
}


function exceedsThreshold(
  signals,
  threshold
) {
  if (
    signals.successRate <
    threshold.minimumSuccessRate
  ) {
    return true;
  }


  if (
    signals.errorRate >
    threshold.maximumErrorRate
  ) {
    return true;
  }


  if (
    signals.latencyFactor !==
      null &&

    signals.latencyFactor >
    threshold.maximumLatencyFactor
  ) {
    return true;
  }


  if (
    signals.throughputEfficiency <
    threshold.minimumThroughputEfficiency
  ) {
    return true;
  }


  return false;
}


function exceedsBrokenThreshold(
  signals,
  threshold
) {
  if (
    exceedsThreshold(
      signals,
      threshold
    )
  ) {
    return true;
  }


  if (
    signals.timedOutRequests >
    0
  ) {
    return true;
  }


  return false;
}


function calculateLatencyFactor(
  baseline,
  current
) {
  const baselineLatency =
    Number(
      baseline.p95LatencyMs
    );


  const currentLatency =
    Number(
      current.p95LatencyMs
    );


  if (
    !Number.isFinite(
      baselineLatency
    ) ||

    baselineLatency <=
      0 ||

    !Number.isFinite(
      currentLatency
    )
  ) {
    return null;
  }


  return round(
    currentLatency /
    baselineLatency
  );
}


function calculateThroughputEfficiency(
  current
) {
  const target =
    Number(
      current.targetRatePerSecond
    );


  const achieved =
    Number(
      current.successfulRatePerSecond
    );


  if (
    !Number.isFinite(
      target
    ) ||

    target <=
      0
  ) {
    return 0;
  }


  if (
    !Number.isFinite(
      achieved
    )
  ) {
    return 0;
  }


  return round(
    Math.min(
      achieved /
      target,
      1
    )
  );
}


function requireMetrics(
  value,
  field
) {
  if (
    !value ||

    typeof value !==
      "object"
  ) {
    throw thresholdError(
      "CAPACITY_METRICS_REQUIRED",
      `${field} metrics are required`
    );
  }
}


function round(
  value
) {
  return Number(
    Number(
      value
    ).toFixed(
      4
    )
  );
}


function thresholdError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityCapacityThresholdError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CAPACITY_THRESHOLD_VERSION,

  CAPACITY_STATE,

  DEFAULT_THRESHOLDS,

  evaluateCapacityStage,

  calculateLatencyFactor,

  calculateThroughputEfficiency,

  thresholdError,
};