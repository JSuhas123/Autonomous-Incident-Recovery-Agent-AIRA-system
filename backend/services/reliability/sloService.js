"use strict";

/**
 * ============================================================================
 * PHASE 11.13 — SLO / RELIABILITY SERVICE
 * ============================================================================
 *
 * PURPOSE
 *
 * Tracks bounded rolling reliability observations for AIRA and evaluates:
 *
 * - availability
 * - success rate
 * - latency objective compliance
 * - allowed failures
 * - error budget consumption
 * - error budget remaining
 * - burn rate
 * - reliability state
 *
 * IMPORTANT SAFETY BOUNDARY
 *
 * Reliability observation NEVER grants infrastructure execution authority.
 *
 * systemHealthService answers:
 *
 *   "Can this instance safely operate right now?"
 *
 * SloService answers:
 *
 *   "Is AIRA meeting its reliability objective over time?"
 *
 * Execution authorization remains a separate policy/safety decision.
 */

const RELIABILITY_STATE =
  Object.freeze({
    HEALTHY:
      "HEALTHY",

    AT_RISK:
      "AT_RISK",

    BURNING:
      "BURNING",

    EXHAUSTED:
      "EXHAUSTED",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });


const DEFAULT_SLOS =
  Object.freeze({
    api: {
      target:
        0.999,

      latencyTargetMs:
        1000,

      latencyComplianceTarget:
        0.99,

      windowMs:
        60 *
        60 *
        1000,

      minimumSamples:
        20,
    },


    decision: {
      target:
        0.995,

      latencyTargetMs:
        2000,

      latencyComplianceTarget:
        0.99,

      windowMs:
        60 *
        60 *
        1000,

      minimumSamples:
        20,
    },


    execution: {
      target:
        0.99,

      latencyTargetMs:
        30000,

      latencyComplianceTarget:
        0.95,

      windowMs:
        60 *
        60 *
        1000,

      minimumSamples:
        10,
    },


    verification: {
      target:
        0.99,

      latencyTargetMs:
        10000,

      latencyComplianceTarget:
        0.95,

      windowMs:
        60 *
        60 *
        1000,

      minimumSamples:
        10,
    },


    queueDelivery: {
      target:
        0.999,

      latencyTargetMs:
        5000,

      latencyComplianceTarget:
        0.99,

      windowMs:
        60 *
        60 *
        1000,

      minimumSamples:
        20,
    },
  });


const MAX_OBSERVATIONS_PER_OBJECTIVE =
  10000;


function finiteNumber(
  value,
  fallback =
    0
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}


function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}


function normalizeObjectiveName(
  value
) {
  return String(
    value ||
    ""
  )
    .trim();
}


function normalizeBooleanSuccess(
  value
) {
  if (
    value ===
    true
  ) {
    return true;
  }


  if (
    value ===
    false
  ) {
    return false;
  }


  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  return [
    "success",
    "successful",
    "ok",
    "healthy",
    "available",
    "passed",
    "pass",
    "completed",
    "delivered",
  ]
    .includes(
      normalized
    );
}


class SloService {
  constructor(
    options = {}
  ) {
    this.now =
      typeof options.now ===
      "function"
        ? options.now
        : () =>
            Date.now();


    this.objectives =
      new Map();


    this.observations =
      new Map();


    this.lastEvaluationAt =
      null;


    this.evaluationCount =
      0;


    this.recordCount =
      0;


    this.invalidObservationCount =
      0;


    this.configureObjectives(
      options.objectives ||
      DEFAULT_SLOS
    );
  }


  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  configureObjectives(
    objectives
  ) {
    for (
      const [
        name,
        configuration,
      ]
      of Object.entries(
        objectives ||
        {}
      )
    ) {
      this.registerObjective(
        name,
        configuration
      );
    }


    return this
      .getObjectiveDefinitions();
  }


  registerObjective(
    name,
    configuration =
      {}
  ) {
    const normalizedName =
      normalizeObjectiveName(
        name
      );


    if (
      !normalizedName
    ) {
      throw Object.assign(
        new Error(
          "SLO objective name is required"
        ),
        {
          code:
            "SLO_OBJECTIVE_NAME_REQUIRED",

          executionAuthorized:
            false,
        }
      );
    }


    const target =
      clamp(
        finiteNumber(
          configuration.target,
          0.99
        ),
        0.5,
        0.999999
      );


    const latencyComplianceTarget =
      clamp(
        finiteNumber(
          configuration
            .latencyComplianceTarget,
          0.95
        ),
        0.5,
        1
      );


    const objective = {
      name:
        normalizedName,

      target,

      latencyTargetMs:
        Math.max(
          1,
          Math.floor(
            finiteNumber(
              configuration
                .latencyTargetMs,
              1000
            )
          )
        ),

      latencyComplianceTarget,

      windowMs:
        Math.max(
          60000,
          Math.floor(
            finiteNumber(
              configuration
                .windowMs,
              60 *
                60 *
                1000
            )
          )
        ),

      minimumSamples:
        Math.max(
          1,
          Math.floor(
            finiteNumber(
              configuration
                .minimumSamples,
              10
            )
          )
        ),
    };


    this.objectives
      .set(
        normalizedName,
        objective
      );


    if (
      !this.observations
        .has(
          normalizedName
        )
    ) {
      this.observations
        .set(
          normalizedName,
          []
        );
    }


    return {
      ...objective,

      executionAuthorized:
        false,
    };
  }


  getObjectiveDefinitions() {
    return Object.fromEntries(
      Array.from(
        this.objectives
          .entries()
      )
        .map(
          (
            [
              name,
              objective,
            ]
          ) => [
            name,
            {
              ...objective,
            },
          ]
        )
    );
  }


  // ==========================================================================
  // RECORD OBSERVATION
  // ==========================================================================

  recordObservation(
    objectiveName,
    observation =
      {}
  ) {
    const name =
      normalizeObjectiveName(
        objectiveName
      );


    const objective =
      this.objectives
        .get(
          name
        );


    if (
      !objective
    ) {
      this.invalidObservationCount +=
        1;


      throw Object.assign(
        new Error(
          `Unknown SLO objective: ${name}`
        ),
        {
          code:
            "SLO_OBJECTIVE_NOT_REGISTERED",

          objective:
            name,

          executionAuthorized:
            false,
        }
      );
    }


    const timestamp =
      finiteNumber(
        observation.timestamp,
        this.now()
      );


    const latencyMs =
      Math.max(
        0,
        finiteNumber(
          observation.latencyMs,
          0
        )
      );


    const success =
      normalizeBooleanSuccess(
        observation.success
      );


    const entry = {
      timestamp,

      success,

      latencyMs,
    };


    const records =
      this.observations
        .get(
          name
        );


    records.push(
      entry
    );


    this.recordCount +=
      1;


    /*
     * Bound memory even if pruning is delayed.
     */
    if (
      records.length >
      MAX_OBSERVATIONS_PER_OBJECTIVE
    ) {
      records.splice(
        0,
        records.length -
          MAX_OBSERVATIONS_PER_OBJECTIVE
      );
    }


    this.pruneObjective(
      name
    );


    return {
      recorded:
        true,

      objective:
        name,

      success,

      latencyMs,

      executionAuthorized:
        false,
    };
  }


  recordApi(
    success,
    latencyMs
  ) {
    return this
      .recordObservation(
        "api",
        {
          success,

          latencyMs,
        }
      );
  }


  recordDecision(
    success,
    latencyMs
  ) {
    return this
      .recordObservation(
        "decision",
        {
          success,

          latencyMs,
        }
      );
  }


  recordExecution(
    success,
    latencyMs
  ) {
    return this
      .recordObservation(
        "execution",
        {
          success,

          latencyMs,
        }
      );
  }


  recordVerification(
    success,
    latencyMs
  ) {
    return this
      .recordObservation(
        "verification",
        {
          success,

          latencyMs,
        }
      );
  }


  recordQueueDelivery(
    success,
    latencyMs
  ) {
    return this
      .recordObservation(
        "queueDelivery",
        {
          success,

          latencyMs,
        }
      );
  }


  // ==========================================================================
  // WINDOW PRUNING
  // ==========================================================================

  pruneObjective(
    objectiveName
  ) {
    const objective =
      this.objectives
        .get(
          objectiveName
        );


    const records =
      this.observations
        .get(
          objectiveName
        );


    if (
      !objective ||
      !records
    ) {
      return;
    }


    const cutoff =
      this.now() -
      objective
        .windowMs;


    let removeCount =
      0;


    while (
      removeCount <
        records.length &&
      records[
        removeCount
      ]
        .timestamp <
        cutoff
    ) {
      removeCount +=
        1;
    }


    if (
      removeCount >
      0
    ) {
      records.splice(
        0,
        removeCount
      );
    }
  }


  pruneAll() {
    for (
      const name
      of this.objectives
        .keys()
    ) {
      this.pruneObjective(
        name
      );
    }
  }


  // ==========================================================================
  // EVALUATION
  // ==========================================================================

  evaluateObjective(
    objectiveName
  ) {
    const objective =
      this.objectives
        .get(
          objectiveName
        );


    if (
      !objective
    ) {
      throw Object.assign(
        new Error(
          `Unknown SLO objective: ${objectiveName}`
        ),
        {
          code:
            "SLO_OBJECTIVE_NOT_REGISTERED",

          executionAuthorized:
            false,
        }
      );
    }


    this.pruneObjective(
      objectiveName
    );


    const records =
      this.observations
        .get(
          objectiveName
        ) ||
      [];


    const sampleCount =
      records.length;


    const successes =
      records
        .reduce(
          (
            count,
            observation
          ) =>
            count +
            (
              observation
                .success
                ? 1
                : 0
            ),
          0
        );


    const failures =
      sampleCount -
      successes;


    const availability =
      sampleCount >
        0
        ? successes /
          sampleCount
        : 1;


    const successfulLatencySamples =
      records
        .filter(
          (
            observation
          ) =>
            observation
              .success
        );


    const latencyCompliant =
      successfulLatencySamples
        .reduce(
          (
            count,
            observation
          ) =>
            count +
            (
              observation
                .latencyMs <=
              objective
                .latencyTargetMs
                ? 1
                : 0
            ),
          0
        );


    const latencyCompliance =
      successfulLatencySamples
        .length >
      0
        ? latencyCompliant /
          successfulLatencySamples
            .length
        : 1;


    /*
     * Error-budget fraction:
     *
     * target 99.9% =>
     * allowed error fraction = 0.001
     */
    const allowedErrorRate =
      1 -
      objective
        .target;


    const observedErrorRate =
      sampleCount >
        0
        ? failures /
          sampleCount
        : 0;


    /*
     * Burn rate:
     *
     * observed error rate / allowed error rate
     *
     * 1.0 = consuming budget at exactly sustainable rate.
     */
    const burnRate =
      allowedErrorRate >
        0
        ? observedErrorRate /
          allowedErrorRate
        : observedErrorRate >
            0
          ? Number.POSITIVE_INFINITY
          : 0;


    /*
     * For a finite sample window:
     *
     * allowedFailures = sampleCount × allowed error rate
     */
    const allowedFailures =
      sampleCount *
      allowedErrorRate;


    const budgetConsumedRatio =
      allowedFailures >
        0
        ? failures /
          allowedFailures
        : failures >
            0
          ? Number.POSITIVE_INFINITY
          : 0;


    const budgetRemainingRatio =
      Number.isFinite(
        budgetConsumedRatio
      )
        ? clamp(
            1 -
            budgetConsumedRatio,
            0,
            1
          )
        : 0;


    const sufficientSamples =
      sampleCount >=
      objective
        .minimumSamples;


    let state =
      RELIABILITY_STATE
        .INSUFFICIENT_DATA;


    if (
      sufficientSamples
    ) {
      if (
        budgetRemainingRatio <=
          0 ||
        availability <
          objective
            .target &&
        burnRate >=
          2
      ) {
        state =
          RELIABILITY_STATE
            .EXHAUSTED;
      } else if (
        burnRate >
          1 ||
        latencyCompliance <
          objective
            .latencyComplianceTarget
      ) {
        state =
          RELIABILITY_STATE
            .BURNING;
      } else if (
        budgetRemainingRatio <=
          0.25 ||
        burnRate >=
          0.75
      ) {
        state =
          RELIABILITY_STATE
            .AT_RISK;
      } else {
        state =
          RELIABILITY_STATE
            .HEALTHY;
      }
    }


    return {
      objective:
        objectiveName,

      state,

      target:
        objective
          .target,

      windowMs:
        objective
          .windowMs,

      minimumSamples:
        objective
          .minimumSamples,

      sufficientSamples,

      sampleCount,

      successes,

      failures,

      availability,

      observedErrorRate,

      allowedErrorRate,

      allowedFailures,

      budgetConsumedRatio:
        Number.isFinite(
          budgetConsumedRatio
        )
          ? budgetConsumedRatio
          : null,

      budgetRemainingRatio,

      burnRate:
        Number.isFinite(
          burnRate
        )
          ? burnRate
          : null,

      latencyTargetMs:
        objective
          .latencyTargetMs,

      latencyComplianceTarget:
        objective
          .latencyComplianceTarget,

      latencyCompliance,

      latencySamples:
        successfulLatencySamples
          .length,

      evaluatedAt:
        new Date(
          this.now()
        )
          .toISOString(),

      executionAuthorized:
        false,
    };
  }


  evaluateAll() {
    this.pruneAll();


    const objectives =
      {};


    for (
      const name
      of this.objectives
        .keys()
    ) {
      objectives[
        name
      ] =
        this.evaluateObjective(
          name
        );
    }


    this.lastEvaluationAt =
      new Date(
        this.now()
      );


    this.evaluationCount +=
      1;


    const values =
      Object.values(
        objectives
      );


    const overallState =
      this.calculateOverallState(
        values
      );


    return {
      state:
        overallState,

      objectives,

      evaluatedAt:
        this.lastEvaluationAt
          .toISOString(),

      executionAuthorized:
        false,
    };
  }


  calculateOverallState(
    evaluations
  ) {
    const priority = {
      [
        RELIABILITY_STATE
          .INSUFFICIENT_DATA
      ]:
        0,

      [
        RELIABILITY_STATE
          .HEALTHY
      ]:
        1,

      [
        RELIABILITY_STATE
          .AT_RISK
      ]:
        2,

      [
        RELIABILITY_STATE
          .BURNING
      ]:
        3,

      [
        RELIABILITY_STATE
          .EXHAUSTED
      ]:
        4,
    };


    const sufficient =
      evaluations
        .filter(
          (
            evaluation
          ) =>
            evaluation
              .sufficientSamples
        );


    if (
      sufficient.length ===
      0
    ) {
      return RELIABILITY_STATE
        .INSUFFICIENT_DATA;
    }


    return sufficient
      .reduce(
        (
          worst,
          current
        ) =>
          priority[
            current.state
          ] >
          priority[
            worst
          ]
            ? current.state
            : worst,
        RELIABILITY_STATE
          .HEALTHY
      );
  }


  // ==========================================================================
  // READ-ONLY STATUS
  // ==========================================================================

  getStatus() {
    const evaluation =
      this.evaluateAll();


    return {
      ...evaluation,

      recordCount:
        this.recordCount,

      invalidObservationCount:
        this
          .invalidObservationCount,

      evaluationCount:
        this
          .evaluationCount,

      /*
       * Reliability does NOT grant execution authority.
       */
      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // RESET — TEST / CONTROLLED ADMIN USE
  // ==========================================================================

  reset() {
    for (
      const key
      of this.observations
        .keys()
    ) {
      this.observations
        .set(
          key,
          []
        );
    }


    this.lastEvaluationAt =
      null;


    this.evaluationCount =
      0;


    this.recordCount =
      0;


    this.invalidObservationCount =
      0;


    return {
      reset:
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new SloService();


module.exports
  .SloService =
  SloService;


module.exports
  .DEFAULT_SLOS =
  DEFAULT_SLOS;


module.exports
  .RELIABILITY_STATE =
  RELIABILITY_STATE;