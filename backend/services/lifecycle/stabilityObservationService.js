"use strict";

/**
 * AIRA Stability Observation Service
 *
 * Phase 10.8
 *
 * Evaluates whether a verified recovery remains stable
 * across a bounded observation window.
 *
 * SAFETY:
 *
 * - does not close incidents
 * - does not execute rollback
 * - does not trigger retry
 * - does not authorize execution
 */

const {
  STABILITY_RESULT,
} =
  require(
    "./incidentLifecycleContracts"
  );

class StabilityObservationService {
  constructor(
    options = {}
  ) {
    this.defaultMinimumSamples =
      normalizePositiveInteger(
        options.defaultMinimumSamples,
        3
      );

    this.defaultMaximumFailureRatio =
      normalizeRatio(
        options.defaultMaximumFailureRatio,
        0
      );

    this.defaultWindowMs =
      normalizePositiveInteger(
        options.defaultWindowMs,
        300000
      );
  }

  evaluate(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const samples =
      Array.isArray(
        input.samples
      )
        ? input.samples
        : [];

    const minimumSamples =
      normalizePositiveInteger(
        input.minimumSamples,
        this.defaultMinimumSamples
      );

    const maximumFailureRatio =
      normalizeRatio(
        input.maximumFailureRatio,
        this.defaultMaximumFailureRatio
      );

    const windowMs =
      normalizePositiveInteger(
        input.windowMs,
        this.defaultWindowMs
      );

    const startedAt =
      normalizeDate(
        input.startedAt
      );

    const now =
      normalizeDate(
        input.now
      ) ||
      new Date();

    const windowElapsed =
      startedAt
        ? (
            now.getTime() -
            startedAt.getTime()
          ) >=
          windowMs
        : false;

    const normalizedSamples =
      samples.map(
        (
          sample,
          index
        ) =>
          this.normalizeSample(
            sample,
            index
          )
      );

    const usableSamples =
      normalizedSamples.filter(
        (
          sample
        ) =>
          sample.usable ===
          true
      );

    const healthySamples =
      usableSamples.filter(
        (
          sample
        ) =>
          sample.healthy ===
          true
      );

    const unhealthySamples =
      usableSamples.filter(
        (
          sample
        ) =>
          sample.healthy ===
          false
      );

    const inconclusiveSamples =
      normalizedSamples.filter(
        (
          sample
        ) =>
          sample.usable !==
          true
      );

    const sampleCount =
      usableSamples.length;

    const failureRatio =
      sampleCount ===
        0
        ? null
        : unhealthySamples.length /
          sampleCount;

    // ========================================================================
    // 1. ANY EXPLICIT REGRESSION
    // ========================================================================

    const regressionDetected =
      normalizedSamples.some(
        (
          sample
        ) =>
          sample.regressionDetected ===
          true
      );

    if (
      regressionDetected
    ) {
      return this.result({
        result:
          STABILITY_RESULT
            .UNSTABLE,

        completed:
          true,

        stable:
          false,

        reason:
          "Regression was detected during stability observation.",

        sampleCount,

        healthyCount:
          healthySamples.length,

        unhealthyCount:
          unhealthySamples.length,

        inconclusiveCount:
          inconclusiveSamples.length,

        failureRatio,

        minimumSamples,

        maximumFailureRatio,

        windowMs,

        windowElapsed,

        samples:
          normalizedSamples,
      });
    }

    // ========================================================================
    // 2. FAILURE RATIO EXCEEDED
    // ========================================================================

    if (
      failureRatio !==
        null &&
      failureRatio >
        maximumFailureRatio
    ) {
      return this.result({
        result:
          STABILITY_RESULT
            .UNSTABLE,

        completed:
          true,

        stable:
          false,

        reason:
          "Observed failure ratio exceeded the allowed stability threshold.",

        sampleCount,

        healthyCount:
          healthySamples.length,

        unhealthyCount:
          unhealthySamples.length,

        inconclusiveCount:
          inconclusiveSamples.length,

        failureRatio,

        minimumSamples,

        maximumFailureRatio,

        windowMs,

        windowElapsed,

        samples:
          normalizedSamples,
      });
    }

    // ========================================================================
    // 3. NOT ENOUGH SAMPLES
    // ========================================================================

    if (
      sampleCount <
      minimumSamples
    ) {
      if (
        windowElapsed
      ) {
        return this.result({
          result:
            STABILITY_RESULT
              .EXPIRED,

          completed:
            true,

          stable:
            false,

          reason:
            "Stability window expired before enough usable samples were collected.",

          sampleCount,

          healthyCount:
            healthySamples.length,

          unhealthyCount:
            unhealthySamples.length,

          inconclusiveCount:
            inconclusiveSamples.length,

          failureRatio,

          minimumSamples,

          maximumFailureRatio,

          windowMs,

          windowElapsed,

          samples:
            normalizedSamples,
        });
      }

      return this.result({
        result:
          STABILITY_RESULT
            .INCONCLUSIVE,

        completed:
          false,

        stable:
          false,

        reason:
          "Not enough stability samples have been collected yet.",

        sampleCount,

        healthyCount:
          healthySamples.length,

        unhealthyCount:
          unhealthySamples.length,

        inconclusiveCount:
          inconclusiveSamples.length,

        failureRatio,

        minimumSamples,

        maximumFailureRatio,

        windowMs,

        windowElapsed,

        samples:
          normalizedSamples,
      });
    }

    // ========================================================================
    // 4. ENOUGH HEALTHY SAMPLES BUT WINDOW STILL ACTIVE
    // ========================================================================

    if (
      !windowElapsed
    ) {
      return this.result({
        result:
          STABILITY_RESULT
            .INCONCLUSIVE,

        completed:
          false,

        stable:
          false,

        reason:
          "Minimum healthy samples were collected, but the stability window is still active.",

        sampleCount,

        healthyCount:
          healthySamples.length,

        unhealthyCount:
          unhealthySamples.length,

        inconclusiveCount:
          inconclusiveSamples.length,

        failureRatio,

        minimumSamples,

        maximumFailureRatio,

        windowMs,

        windowElapsed,

        samples:
          normalizedSamples,
      });
    }

    // ========================================================================
    // 5. STABLE
    // ========================================================================

    return this.result({
      result:
        STABILITY_RESULT
          .STABLE,

      completed:
        true,

      stable:
        true,

      reason:
        "Recovery remained healthy throughout the stability observation window.",

      sampleCount,

      healthyCount:
        healthySamples.length,

      unhealthyCount:
        unhealthySamples.length,

      inconclusiveCount:
        inconclusiveSamples.length,

      failureRatio,

      minimumSamples,

      maximumFailureRatio,

      windowMs,

      windowElapsed,

      samples:
        normalizedSamples,
    });
  }

  normalizeSample(
    sample,
    index
  ) {
    if (
      !sample ||
      typeof sample !==
        "object"
    ) {
      return {
        index,

        usable:
          false,

        healthy:
          null,

        regressionDetected:
          false,

        timestamp:
          null,
      };
    }

    const healthy =
      sample.healthy ===
        true
        ? true
        : sample.healthy ===
            false
          ? false
          : null;

    return {
      index,

      usable:
        healthy !==
        null,

      healthy,

      regressionDetected:
        sample.regressionDetected ===
        true,

      healthScore:
        normalizeScore(
          sample.healthScore
        ),

      verificationId:
        sample.verificationId ||
        null,

      timestamp:
        sample.timestamp ||
        null,

      evidence:
        Array.isArray(
          sample.evidence
        )
          ? sample.evidence
          : [],
    };
  }

  result(
    input
  ) {
    return {
      ...input,

      incidentClosed:
        false,

      rollbackStarted:
        false,

      retryStarted:
        false,

      executionAuthorized:
        false,

      evaluatedAt:
        new Date(),

      observationVersion:
        "phase10.8-v1",
    };
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Stability observation input is required"
        ),
        {
          code:
            "STABILITY_OBSERVATION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Stability observation requires organization, environment and incident scope"
        ),
        {
          code:
            "STABILITY_OBSERVATION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !Array.isArray(
        input.samples
      )
    ) {
      throw Object.assign(
        new Error(
          "Stability observation requires samples"
        ),
        {
          code:
            "STABILITY_OBSERVATION_SAMPLES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Stability observation cannot authorize execution"
        ),
        {
          code:
            "STABILITY_OBSERVATION_UNSAFE_INPUT",
        }
      );
    }
  }
}

function normalizePositiveInteger(
  value,
  fallback
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric <=
      0
  ) {
    return fallback;
  }

  return Math.floor(
    numeric
  );
}

function normalizeRatio(
  value,
  fallback
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric
    )
  );
}

function normalizeScore(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric
    )
  );
}

function normalizeDate(
  value
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

module.exports =
  new StabilityObservationService();

module.exports
  .StabilityObservationService =
  StabilityObservationService;