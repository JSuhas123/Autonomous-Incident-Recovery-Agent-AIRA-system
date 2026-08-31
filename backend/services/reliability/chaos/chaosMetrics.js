"use strict";


const CHAOS_METRICS_VERSION =
  "21.10A-v1";


function calculateStageMetrics({
  stage,

  targetRatePerSecond,

  durationMs,

  samples,
} = {}) {
  if (
    !Array.isArray(
      samples
    )
  ) {
    throw metricError(
      "CHAOS_METRIC_SAMPLES_REQUIRED",
      "samples must be an array"
    );
  }


  const total =
    samples.length;


  const successful =
    samples.filter(
      (
        sample
      ) =>
        sample.success ===
        true
    );


  const failed =
    total -
    successful.length;


  const rejected =
    samples.filter(
      (
        sample
      ) =>
        sample.rejected ===
        true
    ).length;


  const timedOut =
    samples.filter(
      (
        sample
      ) =>
        sample.timedOut ===
        true
    ).length;


  const rateLimited =
    samples.filter(
      (
        sample
      ) =>
        sample.rateLimited ===
        true
    ).length;


  const latencies =
    successful
      .map(
        (
          sample
        ) =>
          Number(
            sample.latencyMs
          )
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      );


  const durationSeconds =
    Math.max(
      Number(
        durationMs
      ) /
        1000,

      0.001
    );


  return Object.freeze({
    metricsVersion:
      CHAOS_METRICS_VERSION,

    stage,

    targetRatePerSecond,

    durationMs,

    totalRequests:
      total,

    successfulRequests:
      successful.length,

    failedRequests:
      failed,

    rejectedRequests:
      rejected,

    timedOutRequests:
      timedOut,

    rateLimitedRequests:
      rateLimited,

    achievedRatePerSecond:
      round(
        total /
        durationSeconds
      ),

    successfulRatePerSecond:
      round(
        successful.length /
        durationSeconds
      ),

    successRate:
      total > 0
        ? round(
            successful.length /
            total
          )
        : 0,

    errorRate:
      total > 0
        ? round(
            failed /
            total
          )
        : 0,

    p50LatencyMs:
      percentile(
        latencies,
        50
      ),

    p95LatencyMs:
      percentile(
        latencies,
        95
      ),

    p99LatencyMs:
      percentile(
        latencies,
        99
      ),

    minLatencyMs:
      latencies.length
        ? latencies[0]
        : null,

    maxLatencyMs:
      latencies.length
        ? latencies[
            latencies.length -
            1
          ]
        : null,

    executionAuthorized:
      false,
  });
}


function calculateDegradation({
  baseline,

  current,
} = {}) {
  requireMetrics(
    baseline,
    "baseline"
  );


  requireMetrics(
    current,
    "current"
  );


  const baselineP95 =
    Number(
      baseline.p95LatencyMs
    );


  const currentP95 =
    Number(
      current.p95LatencyMs
    );


  const latencyFactor =
    Number.isFinite(
      baselineP95
    ) &&
    baselineP95 >
      0 &&
    Number.isFinite(
      currentP95
    )
      ? round(
          currentP95 /
          baselineP95
        )
      : null;


  const throughputFactor =
    baseline
      .successfulRatePerSecond >
      0
      ? round(
          current
            .successfulRatePerSecond /
          baseline
            .successfulRatePerSecond
        )
      : null;


  return Object.freeze({
    latencyDegradationFactor:
      latencyFactor,

    throughputFactor,

    successRateDelta:
      round(
        current.successRate -
        baseline.successRate
      ),

    errorRateDelta:
      round(
        current.errorRate -
        baseline.errorRate
      ),

    executionAuthorized:
      false,
  });
}


function calculateRecovery({
  baseline,

  recovery,

  recoveryDurationMs,
} = {}) {
  requireMetrics(
    baseline,
    "baseline"
  );


  requireMetrics(
    recovery,
    "recovery"
  );


  /*
   * A recovery comparison is only meaningful when the experiment started
   * from a genuinely healthy baseline.
   *
   * A broken baseline followed by an equally broken recovery state must
   * never be interpreted as "recovered".
   */
  const baselineHealthy =
    Number(
      baseline.successRate
    ) >=
      0.99 &&

    Number(
      baseline.errorRate ||
      0
    ) <=
      0.01 &&

    Number(
      baseline.timedOutRequests ||
      0
    ) ===
      0;


  const latencyRestored =
    baselineHealthy &&
    (
      baseline.p95LatencyMs ===
        null
        ? false
        : (
            recovery.p95LatencyMs !==
              null &&

            recovery.p95LatencyMs <=
              Math.max(
                baseline.p95LatencyMs *
                  1.25,

                baseline.p95LatencyMs +
                  10
              )
          )
    );


  const successRateRestored =
    baselineHealthy &&

    recovery.successRate >=
      Math.max(
        0,

        baseline.successRate -
          0.01
      );


  const recoveryHealthy =
    Number(
      recovery.successRate
    ) >=
      0.99 &&

    Number(
      recovery.errorRate ||
      0
    ) <=
      0.01 &&

    Number(
      recovery.timedOutRequests ||
      0
    ) ===
      0;


  return Object.freeze({
    recovered:
      baselineHealthy &&
      recoveryHealthy &&
      latencyRestored &&
      successRateRestored,

    baselineHealthy,

    recoveryHealthy,

    latencyRestored,

    successRateRestored,

    recoveryDurationMs:
      Number.isFinite(
        recoveryDurationMs
      )
        ? recoveryDurationMs
        : null,

    baselineP95LatencyMs:
      baseline.p95LatencyMs,

    recoveryP95LatencyMs:
      recovery.p95LatencyMs,

    baselineSuccessRate:
      baseline.successRate,

    recoverySuccessRate:
      recovery.successRate,

    executionAuthorized:
      false,
  });
}


function percentile(
  sortedValues,
  requestedPercentile
) {
  if (
    !sortedValues.length
  ) {
    return null;
  }


  if (
    sortedValues.length ===
      1
  ) {
    return round(
      sortedValues[0]
    );
  }


  const rank =
    (
      requestedPercentile /
      100
    ) *
    (
      sortedValues.length -
      1
    );


  const lower =
    Math.floor(
      rank
    );


  const upper =
    Math.ceil(
      rank
    );


  if (
    lower ===
    upper
  ) {
    return round(
      sortedValues[
        lower
      ]
    );
  }


  const weight =
    rank -
    lower;


  return round(
    sortedValues[
      lower
    ] *
      (
        1 -
        weight
      ) +

    sortedValues[
      upper
    ] *
      weight
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
    throw metricError(
      "CHAOS_METRICS_REQUIRED",
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


function metricError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityChaosMetricError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CHAOS_METRICS_VERSION,

  calculateStageMetrics,

  calculateDegradation,

  calculateRecovery,

  percentile,

  metricError,
};