"use strict";


const {
  REALITY_ENVIRONMENT_REPLAY_VERSION,

  ENVIRONMENT_REPLAY_MODE,

  ENVIRONMENT_REPLAY_STAGE,

  ENVIRONMENT_REPLAY_AUTHORITY,

  isEnvironmentReplayMode,
} =
  require(
    "../../constants/realityEnvironmentReplay"
  );


const {
  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,

  LAB_SAFETY_CLASS,

  EXPERIMENT_RUN_STATUS,
} =
  require(
    "../../constants/reliabilityLab"
  );


const {
  LabEnvironmentLifecycleService,
} =
  require(
    "../reliability/labEnvironmentLifecycleService"
  );


function environmentReplayError(
  code,
  message,
  status =
    422,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      ...metadata,
    }
  );
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
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
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
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_OBJECT_REQUIRED",

      `${field} must be an object`
    );
  }


  return value;
}


function resolveReplayMode(
  labKind
) {
  switch (
    labKind
  ) {
    case LAB_ENVIRONMENT_KIND
      .DOCKER:

      return ENVIRONMENT_REPLAY_MODE
        .DOCKER;


    case LAB_ENVIRONMENT_KIND
      .KIND:

    case LAB_ENVIRONMENT_KIND
      .K3D:

    case LAB_ENVIRONMENT_KIND
      .KUBERNETES:

      return ENVIRONMENT_REPLAY_MODE
        .KUBERNETES;


    default:

      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_KIND_UNSUPPORTED",

        (
          "Unsupported Reliability Lab kind " +
          String(
            labKind
          )
        )
      );
  }
}


function sanitizeFailureInjectionResult(
  result
) {
  requireObject(
    result,
    "failureInjectionResult"
  );


  if (
    result.executionAuthorized ===
    true
  ) {
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_INJECTOR_AUTHORITY_VIOLATION",

      (
        "Phase 21 Failure Injection Engine " +
        "must never grant execution authority"
      ),

      500
    );
  }


  if (
    result.evaluatorGroundTruthIncluded ===
    true
  ) {
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",

      (
        "Failure injection result exposed " +
        "evaluator ground truth"
      ),

      500
    );
  }


  const plan =
    result.plan &&
    typeof result.plan ===
      "object"
      ? result.plan
      : {};


  if (
    plan.executionAuthorized ===
    true
  ) {
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_PLAN_AUTHORITY_VIOLATION",

      (
        "Failure injection plan must not " +
        "grant execution authority"
      ),

      500
    );
  }


  if (
    plan.evaluatorGroundTruthIncluded ===
    true
  ) {
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_PLAN_GROUND_TRUTH_LEAKAGE",

      (
        "Failure injection plan exposed " +
        "evaluator ground truth"
      ),

      500
    );
  }


  const runtimeResult =
    result.runtimeResult &&
    typeof result.runtimeResult ===
      "object"
      ? result.runtimeResult
      : null;


  if (
    runtimeResult
      ?.executionAuthorized ===
    true
  ) {
    throw environmentReplayError(
      "REALITY_ENVIRONMENT_REPLAY_RUNTIME_AUTHORITY_VIOLATION",

      (
        "Reliability Lab runtime must not " +
        "grant execution authority"
      ),

      500
    );
  }


  return Object.freeze({
    success:
      result.success ===
      true,

    state:
      result.state ||
      null,

    engineVersion:
      result.engineVersion ||
      null,

    operation:
      plan.operation ||
      null,

    failureDomain:
      plan.failureDomain ||
      null,

    failureType:
      plan.failureType ||
      null,

    labKind:
      plan.labKind ||
      null,

    target: {
      resourcePublicId:
        plan.target
          ?.resourcePublicId ||
        null,

      resourceType:
        plan.target
          ?.resourceType ||
        null,

      namespace:
        plan.target
          ?.namespace ||
        null,

      workloadName:
        plan.target
          ?.workloadName ||
        null,

      podName:
        plan.target
          ?.podName ||
        null,

      containerName:
        plan.target
          ?.containerName ||
        null,

      dependencyName:
        plan.target
          ?.dependencyName ||
        null,

      production:
        false,

      executionAuthorized:
        false,
    },

    runtimeResult:
      runtimeResult
        ? {
            success:
              runtimeResult.success ===
              true,

            operation:
              runtimeResult.operation ||
              null,

            changed:
              runtimeResult.changed ===
              true,

            reference:
              runtimeResult.reference ||
              null,

            provenance:
              runtimeResult.provenance
                ? {
                    ...runtimeResult.provenance,

                    executionAuthorized:
                      false,
                  }
                : {},

            executionAuthorized:
              false,
          }
        : null,

    evaluatorGroundTruthIncluded:
      false,

    executionAuthorized:
      false,
  });
}


class RealityEnvironmentReplayService {
  constructor(
    options =
      {}
  ) {
    this.replayService =
      options.replayService ||
      null;


    this.failureInjectionEngine =
      options.failureInjectionEngine ||
      null;


    this.lifecycleService =
      options.lifecycleService ||

      new LabEnvironmentLifecycleService(
        options.reliability ||
        options
      );


    this.now =
      options.now ||
      (
        () =>
          new Date()
      );
  }


  requireDependencies() {
    if (
      !this.replayService ||

      typeof this
        .replayService
        .getRun !==
        "function"
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_REPLAY_SERVICE_REQUIRED",

        (
          "Environment Replay requires an explicit " +
          "Phase 23R Evidence Replay service"
        ),

        500
      );
    }


    if (
      !this.failureInjectionEngine ||

      typeof this
        .failureInjectionEngine
        .inject !==
        "function"
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_FAILURE_ENGINE_REQUIRED",

        (
          "Environment Replay requires an explicit " +
          "Phase 21 Failure Injection Engine"
        ),

        500
      );
    }


    if (
      !this.lifecycleService ||

      typeof this
        .lifecycleService
        .requireEnvironment !==
        "function" ||

      typeof this
        .lifecycleService
        .beginExperiment !==
        "function"
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LIFECYCLE_REQUIRED",

        (
          "Environment Replay requires the existing " +
          "Phase 21 Reliability Lab lifecycle service"
        ),

        500
      );
    }
  }


  async prepare(
    input =
      {}
  ) {
    this.requireDependencies();


    const organizationId =
      requireString(
        input.organizationId,

        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,

        "environmentId"
      );


    const replayRunId =
      requireString(
        input.replayRunId,

        "replayRunId"
      );


    const labEnvironmentId =
      requireString(
        input.labEnvironmentId,

        "labEnvironmentId"
      );


    const experimentRun =
      requireObject(
        input.experimentRun,

        "experimentRun"
      );


    const target =
      requireObject(
        input.target,

        "target"
      );


    const replayRun =
      await this.replayService
        .getRun({
          organizationId,

          environmentId,

          runId:
            replayRunId,
        });


    if (
      !replayRun
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_RUN_NOT_FOUND",

        "Phase 23R replay run was not found",

        404
      );
    }


    if (
      replayRun.executionAuthorized ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_REPLAY_AUTHORITY_VIOLATION",

        (
          "Evidence replay cannot authorize " +
          "environment execution"
        ),

        500
      );
    }


    if (
      replayRun
        .groundTruthAgentVisible ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",

        (
          "Environment replay cannot start from " +
          "a replay exposing ground truth"
        ),

        500
      );
    }


    const labEnvironment =
      await this.lifecycleService
        .requireEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    this.assertLabBoundary(
      labEnvironment
    );


    const mode =
      resolveReplayMode(
        labEnvironment.kind
      );


    if (
      input.mode !==
        undefined &&

      !isEnvironmentReplayMode(
        input.mode
      )
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_MODE_INVALID",

        (
          "Environment replay mode is invalid: " +
          String(
            input.mode
          )
        )
      );
    }


    if (
      input.mode &&
      input.mode !==
        mode
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_MODE_MISMATCH",

        (
          `Requested mode ${input.mode} does not ` +
          `match lab kind ${labEnvironment.kind}`
        )
      );
    }


    this.assertExperimentRun(
      experimentRun,

      labEnvironment
    );


    this.assertTarget(
      target
    );


    return Object.freeze({
      replayVersion:
        REALITY_ENVIRONMENT_REPLAY_VERSION,

      stage:
        ENVIRONMENT_REPLAY_STAGE
          .VALIDATING,

      replayRunId:
        replayRun.runId ||
        replayRunId,

      caseId:
        replayRun.caseId ||
        null,

      caseRevision:
        replayRun.caseRevision ??
        null,

      caseContentHash:
        replayRun.caseContentHash ||
        null,

      labEnvironmentId:
        labEnvironment.publicId ||
        labEnvironmentId,

      labEnvironmentKind:
        labEnvironment.kind,

      mode,

      experimentRunId:
        experimentRun.publicId ||
        experimentRun.experimentRunId ||
        null,

      experimentStatus:
        experimentRun.status,

      authorities: {
        replay:
          ENVIRONMENT_REPLAY_AUTHORITY
            .REALITY_REPLAY,

        labEnvironment:
          ENVIRONMENT_REPLAY_AUTHORITY
            .LAB_ENVIRONMENT,

        failureInjection:
          ENVIRONMENT_REPLAY_AUTHORITY
            .FAILURE_INJECTION,
      },

      preparedAt:
        this.now()
          .toISOString(),

      production:
        false,

      safetyClass:
        LAB_SAFETY_CLASS
          .LAB_ONLY,

      evaluatorGroundTruthIncluded:
        false,

      groundTruthAgentVisible:
        false,

      executionAuthorized:
        false,
    });
  }


  async injectFault(
    input =
      {}
  ) {
    const prepared =
      await this.prepare(
        input
      );


    const {
      organizationId,

      environmentId,

      labEnvironmentId,

      experimentRun,

      target,
    } =
      input;


    /*
     * The Reliability Lab environment must already be AVAILABLE before
     * environment replay begins. We reuse the Phase 21 lifecycle transition
     * instead of directly mutating lab status here.
     */
    const labBefore =
      await this.lifecycleService
        .requireEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    if (
      labBefore.status ===
      LAB_ENVIRONMENT_STATUS
        .AVAILABLE
    ) {
      await this.lifecycleService
        .beginExperiment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });
    } else if (
      labBefore.status !==
      LAB_ENVIRONMENT_STATUS
        .RUNNING_EXPERIMENT
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_NOT_AVAILABLE",

        (
          "Reliability Lab must be AVAILABLE or " +
          "RUNNING_EXPERIMENT before fault injection; " +
          `received ${labBefore.status}`
        ),

        409
      );
    }


    const labDuring =
      await this.lifecycleService
        .requireEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    if (
      labDuring.status !==
      LAB_ENVIRONMENT_STATUS
        .RUNNING_EXPERIMENT
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_RESERVATION_FAILED",

        (
          "Reliability Lab did not enter " +
          "RUNNING_EXPERIMENT"
        ),

        500
      );
    }


    try {
      const injection =
        await this
          .failureInjectionEngine
          .inject({
            organizationId,

            environmentId,

            labEnvironmentId,

            experimentRun,

            failureKey:
              requireString(
                input.failureKey,

                "failureKey"
              ),

            version:
              input.failureVersion ??
              1,

            target: {
              ...target,

              production:
                false,

              executionAuthorized:
                false,
            },

            parameters:
              input.parameters ||
              {},
          });


      const sanitized =
        sanitizeFailureInjectionResult(
          injection
        );


      return Object.freeze({
        replayVersion:
          REALITY_ENVIRONMENT_REPLAY_VERSION,

        stage:
          ENVIRONMENT_REPLAY_STAGE
            .FAULT_INJECTED,

        replayRunId:
          prepared.replayRunId,

        caseId:
          prepared.caseId,

        caseRevision:
          prepared.caseRevision,

        caseContentHash:
          prepared.caseContentHash,

        labEnvironmentId:
          prepared.labEnvironmentId,

        labEnvironmentKind:
          prepared.labEnvironmentKind,

        mode:
          prepared.mode,

        experimentRunId:
          prepared.experimentRunId,

        fault:
          sanitized,

        injectedAt:
          this.now()
            .toISOString(),

        production:
          false,

        safetyClass:
          LAB_SAFETY_CLASS
            .LAB_ONLY,

        evaluatorGroundTruthIncluded:
          false,

        groundTruthAgentVisible:
          false,

        executionAuthorized:
          false,
      });
    } catch (
      error
    ) {
      throw environmentReplayError(
        error.code ||
          "REALITY_ENVIRONMENT_REPLAY_INJECTION_FAILED",

        error.message ||
          "Environment replay failure injection failed",

        error.status ||
          500,

        {
          cause:
            error,
        }
      );
    }
  }


  assertLabBoundary(
    environment
  ) {
    requireObject(
      environment,
      "labEnvironment"
    );


    if (
      environment.production ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_FORBIDDEN",

        (
          "Environment replay can never target " +
          "a production environment"
        ),

        403
      );
    }


    if (
      environment.safetyClass !==
      LAB_SAFETY_CLASS
        .LAB_ONLY
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_ONLY_REQUIRED",

        (
          "Environment replay requires " +
          "LAB_ONLY safety class"
        ),

        403
      );
    }


    if (
      !Object.values(
        LAB_ENVIRONMENT_KIND
      ).includes(
        environment.kind
      )
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_KIND_INVALID",

        (
          "Environment replay received unsupported " +
          `lab kind ${environment.kind}`
        )
      );
    }


    if (
      environment.executionAuthorized ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_LAB_AUTHORITY_VIOLATION",

        (
          "Reliability Lab environment cannot " +
          "grant execution authority"
        ),

        500
      );
    }
  }


  assertExperimentRun(
    experimentRun,
    environment
  ) {
    if (
      experimentRun.executionAuthorized ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_EXPERIMENT_AUTHORITY_VIOLATION",

        (
          "Reliability experiment run cannot " +
          "grant execution authority"
        ),

        500
      );
    }


    if (
      experimentRun.status !==
      EXPERIMENT_RUN_STATUS
        .INJECTING
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_EXPERIMENT_NOT_INJECTING",

        (
          "Environment replay requires Phase 21 " +
          "experiment status INJECTING; received " +
          String(
            experimentRun.status
          )
        ),

        409
      );
    }


    if (
      experimentRun.labEnvironmentId
    ) {
      const belongsToLab =
        experimentRun.labEnvironmentId ===
          environment.id ||

        experimentRun.labEnvironmentId ===
          environment.publicId;


      if (
        !belongsToLab
      ) {
        throw environmentReplayError(
          "REALITY_ENVIRONMENT_REPLAY_LAB_MISMATCH",

          (
            "Experiment run belongs to a different " +
            "Reliability Lab environment"
          ),

          403
        );
      }
    }
  }


  assertTarget(
    target
  ) {
    if (
      target.production ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_TARGET_FORBIDDEN",

        (
          "Environment replay cannot target " +
          "a production resource"
        ),

        403
      );
    }


    if (
      target.executionAuthorized ===
      true
    ) {
      throw environmentReplayError(
        "REALITY_ENVIRONMENT_REPLAY_TARGET_AUTHORITY_VIOLATION",

        (
          "Environment replay target cannot " +
          "grant execution authority"
        ),

        403
      );
    }


    requireString(
      target.resourceType,

      "target.resourceType"
    );
  }
}


module.exports = {
  RealityEnvironmentReplayService,

  resolveReplayMode,

  sanitizeFailureInjectionResult,

  environmentReplayError,
};