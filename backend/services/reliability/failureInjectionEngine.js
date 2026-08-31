"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  LabEnvironmentLifecycleService,
} =
  require(
    "./labEnvironmentLifecycleService"
  );


const {
  FailureScenarioRegistry,
} =
  require(
    "./failureScenarioRegistry"
  );


const {
  assertFailureInjectionAllowed,
} =
  require(
    "./failureInjectionSafetyBoundary"
  );


const {
  buildFailureInjectionPlan,

  FAILURE_INJECTION_PLAN_VERSION,
} =
  require(
    "./failureInjectionPlanFactory"
  );


const FAILURE_INJECTION_ENGINE_VERSION =
  "21.9-v1";


class FailureInjectionEngine {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||
      new PostgresReliabilityLabRepository(
        options
      );


    this.lifecycleService =
      options.lifecycleService ||
      new LabEnvironmentLifecycleService({
        ...options,

        repository:
          this.repository,
      });


    this.registry =
      options.registry ||
      new FailureScenarioRegistry(
        options
      );


    /*
     * Intentionally NO default runtime.
     *
     * Phase 21 failure injection must only execute through an explicitly
     * supplied Reliability Lab runtime.
     *
     * This prevents this service from becoming another production execution
     * path and prevents accidental shell/process execution from application
     * code.
     */
    this.runtime =
      options.runtime ||
      null;


    this.now =
      options.now ||
      (() =>
        new Date());
  }


  async inject({
    organizationId,

    environmentId,

    labEnvironmentId,

    experimentRun,

    failureKey,

    version =
      1,

    target,

    parameters =
      {},
  } = {}) {
    requireString(
      organizationId,
      "organizationId"
    );


    requireString(
      environmentId,
      "environmentId"
    );


    requireString(
      labEnvironmentId,
      "labEnvironmentId"
    );


    requireString(
      failureKey,
      "failureKey"
    );


    requireObject(
      experimentRun,
      "experimentRun"
    );


    requireObject(
      target,
      "target"
    );


    requireObject(
      parameters,
      "parameters"
    );


    /*
     * Hard fail instead of silently creating a local shell runtime.
     *
     * Actual Docker/kind mutations will be provided by the dedicated
     * Reliability Lab runtime adapter after this contract is certified.
     */
    if (
      !this.runtime ||

      typeof this
        .runtime
        .execute !==
        "function"
    ) {
      throw engineError(
        "FAILURE_INJECTION_RUNTIME_REQUIRED",

        "Failure Injection Engine requires an explicit Reliability Lab runtime"
      );
    }


    const environment =
      await this
        .lifecycleService
        .requireEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    /*
     * The injector key is evaluator-side infrastructure metadata.
     *
     * It is needed by Phase 21 itself to perform the controlled experiment,
     * but the returned injection plan explicitly strips evaluator ground
     * truth before anything can later be exposed to AIRA.
     */
    const scenario =
      this.registry
        .getEvaluatorScenario(
          failureKey,
          version
        );


    if (
      !scenario
    ) {
      throw engineError(
        "FAILURE_SCENARIO_NOT_FOUND",

        `Failure scenario ${failureKey}@${version} was not found`
      );
    }


    assertFailureInjectionAllowed({
      environment,

      scenario,

      experimentRun,

      target,
    });


    const plan =
      buildFailureInjectionPlan({
        scenario,

        environment,

        experimentRun,

        target,

        parameters,
      });


    const requestedAt =
      this.now();


    try {
      const runtimeResult =
        await this
          .runtime
          .execute(
            plan,

            {
              reliabilityLab:
                true,

              safetyClass:
                "LAB_ONLY",

              executionAuthorized:
                false,
            }
          );


      assertRuntimeResult(
        runtimeResult
      );


      const injectedAt =
        this.now();


      /*
       * Failure-injection provenance is deliberately separate from AIRA
       * recovery provenance.
       */
      const evidence =
        await this
          .repository
          .appendFailureInjection({
            organizationId,

            environmentId,

            experimentRunId:
              plan.experimentRunId,

            failureDomain:
              scenario.domain,

            failureType:
              scenario.failureType,

            targetResourceId:
              target.resourceId ||
              null,

            targetResourcePublicId:
              target.resourcePublicId ||
              null,

            targetResourceType:
              target.resourceType,

            injectorKey:
              scenario.injector,

            injectorVersion:
              FAILURE_INJECTION_PLAN_VERSION,

            state:
              "ACTIVE",

            injectionParameters:
              plan.parameters,

            provenance: {
              source:
                "AIRA_PHASE_21_FAILURE_INJECTION_ENGINE",

              engineVersion:
                FAILURE_INJECTION_ENGINE_VERSION,

              planVersion:
                FAILURE_INJECTION_PLAN_VERSION,

              experimentRunId:
                plan.experimentRunId,

              correlationId:
                plan.correlationId,

              labEnvironmentId,

              requestedAt:
                requestedAt
                  .toISOString(),

              injectedAt:
                injectedAt
                  .toISOString(),

              runtime:
                runtimeResult
                  .provenance ||
                {},

              recoveryProvenance:
                false,

              evaluatorGroundTruthIncluded:
                false,

              executionAuthorized:
                false,
            },
          });


      return Object.freeze({
        success:
          true,

        state:
          "ACTIVE",

        engineVersion:
          FAILURE_INJECTION_ENGINE_VERSION,

        plan,

        runtimeResult:
          sanitizeRuntimeResult(
            runtimeResult
          ),

        evidence,

        evaluatorGroundTruthIncluded:
          false,

        executionAuthorized:
          false,
      });
    } catch (
      error
    ) {
      await appendFailureEvidenceBestEffort({
        repository:
          this.repository,

        organizationId,

        environmentId,

        labEnvironmentId,

        experimentRunId:
          plan.experimentRunId,

        scenario,

        target,

        plan,

        requestedAt,

        failedAt:
          this.now(),

        error,
      });


      throw engineError(
        error.code ||
          "FAILURE_INJECTION_RUNTIME_FAILED",

        error.message ||
          "Reliability Lab failure injection failed",

        {
          cause:
            error,
        }
      );
    }
  }
}


async function appendFailureEvidenceBestEffort({
  repository,

  organizationId,

  environmentId,

  labEnvironmentId,

  experimentRunId,

  scenario,

  target,

  plan,

  requestedAt,

  failedAt,

  error,
}) {
  try {
    await repository
      .appendFailureInjection({
        organizationId,

        environmentId,

        experimentRunId,

        failureDomain:
          scenario.domain,

        failureType:
          scenario.failureType,

        targetResourceId:
          target.resourceId ||
          null,

        targetResourcePublicId:
          target.resourcePublicId ||
          null,

        targetResourceType:
          target.resourceType,

        injectorKey:
          scenario.injector,

        injectorVersion:
          FAILURE_INJECTION_PLAN_VERSION,

        state:
          "FAILED",

        injectionParameters:
          plan.parameters,

        provenance: {
          source:
            "AIRA_PHASE_21_FAILURE_INJECTION_ENGINE",

          engineVersion:
            FAILURE_INJECTION_ENGINE_VERSION,

          planVersion:
            FAILURE_INJECTION_PLAN_VERSION,

          experimentRunId,

          correlationId:
            plan.correlationId,

          labEnvironmentId,

          requestedAt:
            requestedAt
              .toISOString(),

          failedAt:
            failedAt
              .toISOString(),

          errorCode:
            error.code ||
            "FAILURE_INJECTION_RUNTIME_FAILED",

          recoveryProvenance:
            false,

          evaluatorGroundTruthIncluded:
            false,

          executionAuthorized:
            false,
        },
      });
  } catch (
    _evidenceError
  ) {
    /*
     * Preserve the original injection failure.
     *
     * Evidence persistence failure must never transform a failed injection
     * into apparent success.
     */
  }
}


function assertRuntimeResult(
  result
) {
  if (
    !result ||

    typeof result !==
      "object" ||

    Array.isArray(
      result
    )
  ) {
    throw engineError(
      "FAILURE_INJECTION_RUNTIME_RESULT_INVALID",

      "Failure injection runtime must return an object"
    );
  }


  if (
    result.success !==
    true
  ) {
    throw engineError(
      result.code ||
        "FAILURE_INJECTION_RUNTIME_FAILED",

      result.message ||
        "Failure injection runtime did not report success"
    );
  }


  if (
    result.executionAuthorized ===
    true
  ) {
    throw engineError(
      "FAILURE_INJECTION_RUNTIME_CANNOT_AUTHORIZE",

      "Failure injection runtime cannot grant execution authorization"
    );
  }
}


function sanitizeRuntimeResult(
  result
) {
  return Object.freeze({
    success:
      true,

    operation:
      result.operation ||
      null,

    changed:
      result.changed !==
      false,

    reference:
      result.reference ||
      null,

    executionAuthorized:
      false,
  });
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
    throw engineError(
      "FAILURE_INJECTION_FIELD_REQUIRED",

      `${field} is required`
    );
  }
}


function requireObject(
  value,
  field
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Array.isArray(
      value
    )
  ) {
    throw engineError(
      "FAILURE_INJECTION_FIELD_REQUIRED",

      `${field} is required`
    );
  }
}


function engineError(
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
        "ReliabilityFailureInjectionEngineError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  FAILURE_INJECTION_ENGINE_VERSION,

  FailureInjectionEngine,

  assertRuntimeResult,

  engineError,
};