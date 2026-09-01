"use strict";

const {
  ObservabilityBaselineService,
} =
  require(
    "./observabilityBaselineService"
  );


const LIVE_WIRING_VERSION =
  "21.11-12-live-wiring-v1";


class ReliabilityBaselineProviderAdapter {
  constructor(
    options = {}
  ) {
    this.lifecycleService =
      options.lifecycleService ||
      null;


    this.baselineService =
      options.baselineService ||
      new ObservabilityBaselineService({
        lifecycleService:
          this.lifecycleService,

        now:
          options.now,
      });


    this.collect =
      options.collect ||
      null;


    this.sourceReferences =
      options.sourceReferences ||
      [];


    this.metadata =
      options.metadata ||
      {};
  }


  async capture(
    input = {}
  ) {
    requireFunction(
      this.collect,
      "baseline collect"
    );


    requireString(
      input.organizationId,
      "organizationId"
    );


    requireString(
      input.environmentId,
      "environmentId"
    );


    requireString(
      input.labEnvironmentId,
      "labEnvironmentId"
    );


    const scope = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      labEnvironmentId:
        input.labEnvironmentId,
    };


    const environment =
      await this
        .lifecycleService
        .requireEnvironment(
          scope
        );


    const measurements =
      await this.collect({
        ...input,

        scope,

        environment,

        executionAuthorized:
          false,
      });


    assertNonAuthorizing(
      measurements,
      "baseline collector"
    );


    const baseline =
      this.baselineService
        .buildBaseline({
          labEnvironmentId:
            input.labEnvironmentId,

          labKind:
            environment.kind,

          measurements,

          sourceReferences:
            this.sourceReferences,

          metadata: {
            ...this.metadata,

            phase:
              "21.11",

            liveWiringVersion:
              LIVE_WIRING_VERSION,

            experimentRunId:
              input.experimentRunId ||
              null,

            executionAuthorized:
              false,
          },
        });


    if (
      baseline.healthy !==
      true
    ) {
      throw wiringError(
        "PHASE21_LIVE_BASELINE_UNHEALTHY",
        `Live Reliability Lab baseline is unhealthy: ${
          baseline.healthReasons.join(
            ", "
          )
        }`
      );
    }


    return {
      ...baseline,

      executionAuthorized:
        false,
    };
  }
}


class ReliabilityFailureInjectorAdapter {
  constructor(
    options = {}
  ) {
    /*
     * Deliberately explicit.
     *
     * We do NOT dynamically fall back to shell commands,
     * kubectl, Docker, exec(), or arbitrary functions.
     *
     * The caller must bind the already-certified Phase 21.9
     * FailureInjectionEngine through invoke.
     */
    this.invoke =
      options.invoke ||
      null;
  }


  async inject(
    input = {}
  ) {
    requireFunction(
      this.invoke,
      "failure injector invoke"
    );


    assertLabOnlyInput(
      input
    );


    const result =
      await this.invoke({
        ...input,

        safetyClass:
          "LAB_ONLY",

        executionAuthorized:
          false,
      });


    assertNonAuthorizing(
      result,
      "failure injector"
    );


    if (
      !result ||
      typeof result !==
        "object"
    ) {
      throw wiringError(
        "PHASE21_LIVE_INJECTION_RESULT_INVALID",
        "Phase 21 failure injector returned no structured result"
      );
    }


       const referenceId =
      firstNonEmpty(
        result.publicId,
        result.failureInjectionId,
        result.injectionId,
        result.id,
        result.evidence
          ?.publicId,
        result.evidence
          ?.public_id,
        result.evidence
          ?.id
      );


    if (
      !referenceId
    ) {
      throw wiringError(
        "PHASE21_LIVE_INJECTION_REFERENCE_REQUIRED",
        "Live failure injection result requires a persistent/reference ID"
      );
    }


    if (
      result.injected ===
        false ||
      result.success ===
        false
    ) {
      throw wiringError(
        "PHASE21_LIVE_INJECTION_FAILED",
        "The controlled Reliability Lab failure was not injected"
      );
    }


    return {
      ...clone(
        result
      ),

           publicId:
        firstNonEmpty(
          result.publicId,
          result.evidence
            ?.publicId,
          result.evidence
            ?.public_id,
          referenceId
        ),

      failureInjectionId:
        firstNonEmpty(
          result.failureInjectionId,
          result.evidence
            ?.publicId,
          result.evidence
            ?.public_id,
          referenceId
        ),

      injectionId:
        firstNonEmpty(
          result.injectionId,
          result.evidence
            ?.publicId,
          result.evidence
            ?.public_id,
          referenceId
        ),

      injected:
        true,

      safetyClass:
        "LAB_ONLY",

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// BASELINE COLLECTOR CONTRACT
// ============================================================================

function buildBaselineMeasurements({
  cpu,

  memory,

  latency,

  errorRate,

  podState,

  restartCount,

  dbConnections,

  queueDepth,

  dependencyHealthy,

  healthy,

  ready,

  source =
    "PHASE21_LIVE_LAB",
  observedAt =
    new Date()
      .toISOString(),
} = {}) {
  return {
    CPU:
      observedMeasurement(
        cpu,
        "ratio",
        source,
        observedAt
      ),

    MEMORY:
      observedMeasurement(
        memory,
        "ratio",
        source,
        observedAt
      ),

    LATENCY:
      observedMeasurement(
        latency,
        "ms",
        source,
        observedAt
      ),

    ERROR_RATE:
      observedMeasurement(
        errorRate,
        "ratio",
        source,
        observedAt
      ),

    POD_STATE:
      observedMeasurement(
        podState,
        null,
        source,
        observedAt
      ),

    RESTART_COUNT:
      observedMeasurement(
        restartCount,
        "count",
        source,
        observedAt
      ),

    DB_CONNECTIONS:
      observedMeasurement(
        dbConnections,
        "count",
        source,
        observedAt
      ),

    QUEUE_DEPTH:
      observedMeasurement(
        queueDepth,
        "count",
        source,
        observedAt
      ),

    DEPENDENCY_HEALTH:
      observedMeasurement(
        dependencyHealthy,
        "boolean",
        source,
        observedAt
      ),

    HEALTH:
      observedMeasurement(
        healthy,
        "boolean",
        source,
        observedAt
      ),

    READINESS:
      observedMeasurement(
        ready,
        "boolean",
        source,
        observedAt
      ),
  };
}


function observedMeasurement(
  value,
  unit,
  source,
  observedAt
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return {
      status:
        "UNAVAILABLE",

      value:
        null,

      unit:
        unit ||
        null,

      source,

      observedAt,

      executionAuthorized:
        false,
    };
  }


  return {
    status:
      "OBSERVED",

    value,

    unit:
      unit ||
      null,

    source,

    observedAt,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// FAILURE ENGINE BINDER
// ============================================================================

function bindFailureInjectionEngine({
  engine,

  invoke,
} = {}) {
  if (
    typeof invoke ===
      "function"
  ) {
    return new ReliabilityFailureInjectorAdapter({
      invoke,
    });
  }


  if (
    !engine ||
    typeof engine !==
      "object"
  ) {
    throw wiringError(
      "PHASE21_FAILURE_ENGINE_REQUIRED",
      "Existing Phase 21 FailureInjectionEngine instance is required"
    );
  }


  /*
   * Intentionally only accept an explicit canonical inject() API here.
   *
   * Do not guess execute(), run(), command(), runtime.execute(), etc.
   * If the current certified engine exposes another API, the live
   * certification script must bind it explicitly through invoke.
   */
  if (
    typeof engine.inject !==
      "function"
  ) {
    throw wiringError(
      "PHASE21_FAILURE_ENGINE_BINDING_REQUIRED",
      "FailureInjectionEngine does not expose inject(); bind its certified API explicitly through invoke"
    );
  }


  return new ReliabilityFailureInjectorAdapter({
    invoke:
      (
        input
      ) =>
        engine.inject(
          input
        ),
  });
}


// ============================================================================
// SAFETY
// ============================================================================

function assertLabOnlyInput(
  input
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw wiringError(
      "PHASE21_LIVE_INJECTION_INPUT_REQUIRED",
      "Failure injection input is required"
    );
  }


  if (
    input.production ===
      true ||
    input.safetyClass ===
      "PRODUCTION" ||
    input.environmentType ===
      "PRODUCTION"
  ) {
    throw wiringError(
      "PHASE21_PRODUCTION_TARGET_FORBIDDEN",
      "Live Reliability Lab adapter refuses production targets"
    );
  }


  if (
    input.executionAuthorized ===
      true
  ) {
    throw wiringError(
      "PHASE21_AUTHORITY_VIOLATION",
      "Phase 21 failure injection cannot grant execution authorization"
    );
  }


  requireString(
    input.organizationId,
    "organizationId"
  );


  requireString(
    input.environmentId,
    "environmentId"
  );


  requireString(
    input.labEnvironmentId,
    "labEnvironmentId"
  );


  requireString(
    input.experimentRunId,
    "experimentRunId"
  );


  return true;
}


function assertNonAuthorizing(
  value,
  label
) {
  if (
    containsTrueAuthorityField(
      value
    )
  ) {
    throw wiringError(
      "PHASE21_AUTHORITY_VIOLATION",
      `${label} returned forbidden execution/production authority`
    );
  }


  return true;
}


function containsTrueAuthorityField(
  value,
  seen =
    new Set()
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    seen.has(
      value
    )
  ) {
    return false;
  }


  seen.add(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    return value.some(
      (
        child
      ) =>
        containsTrueAuthorityField(
          child,
          seen
        )
    );
  }


  const forbiddenTrueKeys =
    new Set([
      "executionAuthorized",
      "productionCertified",
      "canGrantExecutionAuthorization",
      "canGrantAutonomy",
      "canModifyProductionAuthority",
    ]);


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      forbiddenTrueKeys.has(
        key
      ) &&
      child ===
        true
    ) {
      return true;
    }


    if (
      containsTrueAuthorityField(
        child,
        seen
      )
    ) {
      return true;
    }
  }


  return false;
}


// ============================================================================
// HELPERS
// ============================================================================

function requireFunction(
  value,
  field
) {
  if (
    typeof value !==
      "function"
  ) {
    throw wiringError(
      "PHASE21_LIVE_WIRING_FUNCTION_REQUIRED",
      `${field} function is required`
    );
  }
}


function requireString(
  value,
  field
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value
    )
      .trim() ===
      ""
  ) {
    throw wiringError(
      "PHASE21_LIVE_WIRING_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function firstNonEmpty(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !==
        null &&
      value !==
        undefined &&
      String(
        value
      )
        .trim() !==
        ""
    ) {
      return String(
        value
      );
    }
  }


  return null;
}


function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function wiringError(
  code,
  message,
  extra = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase21LiveExperimentWiringError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  LIVE_WIRING_VERSION,

  ReliabilityBaselineProviderAdapter,

  ReliabilityFailureInjectorAdapter,

  buildBaselineMeasurements,

  bindFailureInjectionEngine,

  assertLabOnlyInput,

  assertNonAuthorizing,

  containsTrueAuthorityField,
};