"use strict";

const {
  LAB_ENVIRONMENT_KIND,
} =
  require(
    "../../constants/reliabilityLab"
  );


const OBSERVABILITY_BASELINE_VERSION =
  "21.7-v1";


const BASELINE_MEASUREMENT_STATUS =
  Object.freeze({
    OBSERVED:
      "OBSERVED",

    NOT_APPLICABLE:
      "NOT_APPLICABLE",

    UNAVAILABLE:
      "UNAVAILABLE",
  });


const BASELINE_SIGNAL =
  Object.freeze({
    CPU:
      "CPU",

    MEMORY:
      "MEMORY",

    LATENCY:
      "LATENCY",

    ERROR_RATE:
      "ERROR_RATE",

    POD_STATE:
      "POD_STATE",

    RESTART_COUNT:
      "RESTART_COUNT",

    DB_CONNECTIONS:
      "DB_CONNECTIONS",

    QUEUE_DEPTH:
      "QUEUE_DEPTH",

    DEPENDENCY_HEALTH:
      "DEPENDENCY_HEALTH",

    HEALTH:
      "HEALTH",

    READINESS:
      "READINESS",
  });


const REQUIRED_BASELINE_SIGNALS =
  Object.freeze([
    BASELINE_SIGNAL.CPU,
    BASELINE_SIGNAL.MEMORY,
    BASELINE_SIGNAL.LATENCY,
    BASELINE_SIGNAL.ERROR_RATE,
    BASELINE_SIGNAL.POD_STATE,
    BASELINE_SIGNAL.RESTART_COUNT,
    BASELINE_SIGNAL.DB_CONNECTIONS,
    BASELINE_SIGNAL.QUEUE_DEPTH,
    BASELINE_SIGNAL.DEPENDENCY_HEALTH,
    BASELINE_SIGNAL.HEALTH,
    BASELINE_SIGNAL.READINESS,
  ]);


class ObservabilityBaselineService {
  constructor(
    options =
      {}
  ) {
    this.now =
      options.now ||
      (() =>
        new Date());


    this.lifecycleService =
      options.lifecycleService ||
      null;
  }


  buildBaseline({
    labEnvironmentId,

    labKind,

    measurements,

    sourceReferences =
      [],

    metadata =
      {},
  } = {}) {
    requireString(
      labEnvironmentId,
      "labEnvironmentId"
    );


    requireLabKind(
      labKind
    );


    const normalizedMeasurements =
      normalizeMeasurements({
        labKind,

        measurements:
          measurements ||
          {},
      });


    const health =
      evaluateBaselineHealth({
        labKind,

        measurements:
          normalizedMeasurements,
      });


    return Object.freeze({
      baselineVersion:
        OBSERVABILITY_BASELINE_VERSION,

      phase:
        21,

      labEnvironmentId,

      labKind,

      capturedAt:
        this
          .now()
          .toISOString(),

      healthy:
        health.healthy,

      healthReasons:
        Object.freeze([
          ...health.reasons,
        ]),

      measurements:
        deepFreeze(
          normalizedMeasurements
        ),

      sourceReferences:
        deepFreeze(
          normalizeSourceReferences(
            sourceReferences
          )
        ),

      metadata:
        deepFreeze(
          sanitizeMetadata(
            metadata
          )
        ),

      bulkTelemetryStored:
        false,

      canonicalTelemetryAuthority:
        "OBSERVABILITY_SYSTEMS",

      executionAuthorized:
        false,
    });
  }


  async captureAndCommit({
    scope,

    labKind,

    collect,

    sourceReferences =
      [],

    metadata =
      {},
  } = {}) {
    if (
      !this.lifecycleService
    ) {
      throw baselineError(
        "BASELINE_LIFECYCLE_SERVICE_REQUIRED",
        "captureAndCommit requires a lifecycle service"
      );
    }


    if (
      typeof collect !==
        "function"
    ) {
      throw baselineError(
        "BASELINE_COLLECTOR_REQUIRED",
        "collect must be a function"
      );
    }


    if (
      !scope ||
      typeof scope !==
        "object"
    ) {
      throw baselineError(
        "BASELINE_SCOPE_REQUIRED",
        "Reliability Lab scope is required"
      );
    }


    const environment =
      await this
        .lifecycleService
        .requireEnvironment(
          scope
        );


    const resolvedKind =
      labKind ||
      environment.kind;


    requireLabKind(
      resolvedKind
    );


    const measurements =
      await collect({
        environment,

        scope,

        executionAuthorized:
          false,
      });


    const baseline =
      this.buildBaseline({
        labEnvironmentId:
          scope.labEnvironmentId,

        labKind:
          resolvedKind,

        measurements,

        sourceReferences,

        metadata,
      });


    if (
      baseline.healthy !==
      true
    ) {
      throw baselineError(
        "BASELINE_NOT_HEALTHY",
        "Reliability Lab baseline is not healthy",
        {
          healthReasons:
            baseline
              .healthReasons,
        }
      );
    }


    const updatedEnvironment =
      await this
        .lifecycleService
        .completeReset(
          scope,
          baseline
        );


    return {
      baseline,

      environment:
        updatedEnvironment,

      executionAuthorized:
        false,
    };
  }
}


function normalizeMeasurements({
  labKind,

  measurements,
}) {
  const normalized =
    {};


  for (
    const signal
    of REQUIRED_BASELINE_SIGNALS
  ) {
    const supplied =
      measurements[
        signal
      ];


    if (
      supplied ===
      undefined ||
      supplied ===
      null
    ) {
      if (
        isKubernetesOnlySignal(
          signal
        ) &&
        labKind ===
          LAB_ENVIRONMENT_KIND
            .DOCKER
      ) {
        normalized[
          signal
        ] =
          buildMeasurement({
            status:
              BASELINE_MEASUREMENT_STATUS
                .NOT_APPLICABLE,

            value:
              null,

            unit:
              null,

            source:
              "DOCKER_NOT_APPLICABLE",
          });


        continue;
      }


      normalized[
        signal
      ] =
        buildMeasurement({
          status:
            BASELINE_MEASUREMENT_STATUS
              .UNAVAILABLE,

          value:
            null,

          unit:
            null,

          source:
            null,
        });


      continue;
    }


    normalized[
      signal
    ] =
      normalizeMeasurement(
        supplied,
        signal
      );
  }


  return normalized;
}


function normalizeMeasurement(
  measurement,
  signal
) {
  if (
    typeof measurement !==
      "object" ||
    Array.isArray(
      measurement
    )
  ) {
    throw baselineError(
      "BASELINE_MEASUREMENT_INVALID",
      `${signal} measurement must be an object`,
      {
        signal,
      }
    );
  }


  const status =
    measurement.status ||
    BASELINE_MEASUREMENT_STATUS
      .OBSERVED;


  if (
    !Object.values(
      BASELINE_MEASUREMENT_STATUS
    ).includes(
      status
    )
  ) {
    throw baselineError(
      "BASELINE_MEASUREMENT_STATUS_INVALID",
      `${signal} measurement status is invalid`,
      {
        signal,

        status,
      }
    );
  }


  if (
    status ===
      BASELINE_MEASUREMENT_STATUS
        .OBSERVED &&
    measurement.value ===
      undefined
  ) {
    throw baselineError(
      "BASELINE_MEASUREMENT_VALUE_REQUIRED",
      `${signal} observed measurement requires value`,
      {
        signal,
      }
    );
  }


  return buildMeasurement({
    status,

    value:
      measurement.value ===
        undefined
        ? null
        : measurement.value,

    unit:
      measurement.unit ||
      null,

    source:
      measurement.source ||
      null,

    observedAt:
      measurement.observedAt ||
      null,

    metadata:
      measurement.metadata ||
      {},
  });
}


function buildMeasurement({
  status,

  value,

  unit,

  source,

  observedAt =
    null,

  metadata =
    {},
}) {
  return {
    status,

    value,

    unit,

    source,

    observedAt,

    metadata:
      sanitizeMetadata(
        metadata
      ),

    executionAuthorized:
      false,
  };
}


function evaluateBaselineHealth({
  labKind,

  measurements,
}) {
  const reasons =
    [];


  for (
    const signal
    of REQUIRED_BASELINE_SIGNALS
  ) {
    const measurement =
      measurements[
        signal
      ];


    if (
      measurement.status ===
        BASELINE_MEASUREMENT_STATUS
          .UNAVAILABLE
    ) {
      reasons.push(
        `${signal}_UNAVAILABLE`
      );


      continue;
    }


    if (
      measurement.status ===
        BASELINE_MEASUREMENT_STATUS
          .NOT_APPLICABLE
    ) {
      if (
        !(
          labKind ===
            LAB_ENVIRONMENT_KIND
              .DOCKER &&
          isKubernetesOnlySignal(
            signal
          )
        )
      ) {
        reasons.push(
          `${signal}_UNEXPECTED_NOT_APPLICABLE`
        );
      }


      continue;
    }


    if (
      signal ===
        BASELINE_SIGNAL
          .HEALTH ||
      signal ===
        BASELINE_SIGNAL
          .READINESS ||
      signal ===
        BASELINE_SIGNAL
          .DEPENDENCY_HEALTH
    ) {
      if (
        measurement.value !==
          true
      ) {
        reasons.push(
          `${signal}_NOT_HEALTHY`
        );
      }
    }


    if (
      signal ===
        BASELINE_SIGNAL
          .ERROR_RATE &&
      typeof measurement.value ===
        "number" &&
      (
        measurement.value <
          0 ||
        measurement.value >
          1
      )
    ) {
      reasons.push(
        "ERROR_RATE_OUT_OF_RANGE"
      );
    }


    if (
      (
        signal ===
          BASELINE_SIGNAL
            .RESTART_COUNT ||
        signal ===
          BASELINE_SIGNAL
            .DB_CONNECTIONS ||
        signal ===
          BASELINE_SIGNAL
            .QUEUE_DEPTH
      ) &&
      typeof measurement.value ===
        "number" &&
      measurement.value <
        0
    ) {
      reasons.push(
        `${signal}_NEGATIVE`
      );
    }
  }


  return {
    healthy:
      reasons.length ===
      0,

    reasons,
  };
}


function isKubernetesOnlySignal(
  signal
) {
  return (
    signal ===
      BASELINE_SIGNAL
        .POD_STATE ||
    signal ===
      BASELINE_SIGNAL
        .RESTART_COUNT
  );
}


function normalizeSourceReferences(
  references
) {
  if (
    !Array.isArray(
      references
    )
  ) {
    throw baselineError(
      "BASELINE_SOURCE_REFERENCES_INVALID",
      "sourceReferences must be an array"
    );
  }


  return references.map(
    (
      reference
    ) => {
      if (
        !reference ||
        typeof reference !==
          "object"
      ) {
        throw baselineError(
          "BASELINE_SOURCE_REFERENCE_INVALID",
          "Baseline source reference must be an object"
        );
      }


      requireString(
        reference.type,
        "sourceReference.type"
      );


      requireString(
        reference.ref,
        "sourceReference.ref"
      );


      return {
        type:
          reference.type,

        ref:
          reference.ref,

        executionAuthorized:
          false,
      };
    }
  );
}


function sanitizeMetadata(
  metadata
) {
  if (
    !metadata ||
    typeof metadata !==
      "object" ||
    Array.isArray(
      metadata
    )
  ) {
    return {};
  }


  const copy =
    JSON.parse(
      JSON.stringify(
        metadata
      )
    );


  delete copy
    .executionAuthorized;


  return copy;
}


function requireLabKind(
  labKind
) {
  if (
    !Object.values(
      LAB_ENVIRONMENT_KIND
    ).includes(
      labKind
    )
  ) {
    throw baselineError(
      "BASELINE_LAB_KIND_INVALID",
      `Unsupported Reliability Lab kind ${labKind}`,
      {
        labKind,
      }
    );
  }
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw baselineError(
      "BASELINE_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function deepFreeze(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function baselineError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ReliabilityObservabilityBaselineError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  OBSERVABILITY_BASELINE_VERSION,

  BASELINE_MEASUREMENT_STATUS,

  BASELINE_SIGNAL,

  REQUIRED_BASELINE_SIGNALS,

  ObservabilityBaselineService,

  evaluateBaselineHealth,

  baselineError,
};