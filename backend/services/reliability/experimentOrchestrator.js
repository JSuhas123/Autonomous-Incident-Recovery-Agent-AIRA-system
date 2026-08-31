"use strict";

const crypto =
  require(
    "node:crypto"
  );


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
  AiraCorrelationHarness,
} =
  require(
    "./airaCorrelationHarness"
  );


const {
  EXPERIMENT_RUN_STATUS,
} =
  require(
    "../../constants/reliabilityLab"
  );


const ORCHESTRATOR_VERSION =
  "21.11-v1";


class ExperimentOrchestrator {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresReliabilityLabRepository(
        options
      );


    this.lifecycle =
      options.lifecycle ||
      new LabEnvironmentLifecycleService({
        ...options,

        repository:
          this.repository,
      });


    this.correlationHarness =
      options.correlationHarness ||
      new AiraCorrelationHarness({
        ...options,

        repository:
          this.repository,
      });


    /*
     * Deliberately injected.
     *
     * Phase 21.11 does not create a competing baseline provider
     * or failure injector. The live wiring will use the already
     * existing Phase 21.7 and Phase 21.9 components.
     */
    this.baselineProvider =
      options.baselineProvider ||
      null;


    this.failureInjector =
      options.failureInjector ||
      null;


    this.now =
      options.now ||
      (() =>
        new Date());
  }


  /**
   * ==========================================================================
   * RUN THROUGH CORRELATION
   * ==========================================================================
   *
   * Phase 21.11 + 21.12 scope:
   *
   * definition
   *   -> runnable lab
   *   -> create run
   *   -> baseline
   *   -> begin experiment
   *   -> inject controlled failure
   *   -> expose observable symptoms
   *   -> canonical AIRA ingestion/correlation
   *   -> stop at WAITING_FOR_DIAGNOSIS
   *
   * Diagnosis/recovery are intentionally NOT evaluated here.
   * ==========================================================================
   */
  async runToCorrelation(
    input
  ) {
    validateRunInput(
      input
    );


    this.requireDependencies();


    const scope = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      labEnvironmentId:
        input.labEnvironmentId,
    };


    const definition =
      await this.repository
        .getExperimentDefinition({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentKey:
            input.experimentKey,

          version:
            input.experimentVersion,
        });


    if (
      !definition
    ) {
      throw orchestratorError(
        "PHASE21_EXPERIMENT_DEFINITION_NOT_FOUND",
        "Reliability experiment definition was not found"
      );
    }


    if (
      definition.enabled ===
        false
    ) {
      throw orchestratorError(
        "PHASE21_EXPERIMENT_DEFINITION_DISABLED",
        "Reliability experiment definition is disabled"
      );
    }


    /*
     * Ground truth is intentionally retained here only as evaluator-owned
     * definition data.
     *
     * It is NEVER passed to correlationHarness.observe().
     */
    const evaluatorGroundTruth =
      definition.groundTruth ||
      null;


    const runnable =
      await this.lifecycle
        .assertRunnable(
          scope
        );


    if (
      runnable
        ?.environment
        ?.production ===
        true
    ) {
      throw orchestratorError(
        "PHASE21_PRODUCTION_ENVIRONMENT_FORBIDDEN",
        "Reliability experiment cannot target production"
      );
    }


    const correlationId =
      input.correlationId ||
      `phase21:${crypto.randomUUID()}`;


    const run =
      await this.repository
        .createExperimentRun({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          labEnvironmentId:
            input.labEnvironmentId,

          experimentKey:
            definition.experimentKey,

          experimentVersion:
            definition.version,

          correlationId,

          metadata: {
            phase:
              "21.11",

            orchestratorVersion:
              ORCHESTRATOR_VERSION,

            safetyClass:
              "LAB_ONLY",

            evaluatorGroundTruthStoredSeparately:
              true,

            executionAuthorized:
              false,

            ...sanitizeMetadata(
              input.metadata
            ),
          },
        });


    const runContext = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      tenantId:
        input.tenantId,

      labEnvironmentId:
        input.labEnvironmentId,

      experimentRunId:
        run.publicId,

      experimentKey:
        definition.experimentKey,

      experimentVersion:
        definition.version,

      correlationId,
    };


    try {
      // ======================================================================
      // PREPARING
      // ======================================================================

      await this.updateRun(
        runContext,
        EXPERIMENT_RUN_STATUS
          .PREPARING,
        {
          startedAt:
            this.now(),
        }
      );


      // ======================================================================
      // BASELINING
      // ======================================================================

      await this.updateRun(
        runContext,
        EXPERIMENT_RUN_STATUS
          .BASELINING
      );


      const baseline =
        await this
          .baselineProvider
          .capture({
            ...runContext,

            definition:
              publicDefinition(
                definition
              ),

            evaluatorGroundTruth:
              undefined,

            executionAuthorized:
              false,
          });


      assertNonAuthorizingResult(
        baseline,
        "baseline"
      );


      await this.repository
        .appendObservation({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentRunId:
            run.publicId,

          observationType:
            "BASELINE_CAPTURED",

          source:
            "PHASE21_EXPERIMENT_ORCHESTRATOR",

          observedAt:
            this.now(),

          summary: {
            baseline:
              sanitizeEvidence(
                baseline
              ),

            executionAuthorized:
              false,
          },
        });


      await this.repository
        .updateExperimentRunState({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentRunId:
            run.publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .BASELINING,

          baselineSnapshot:
            sanitizeEvidence(
              baseline
            ),
        });


      // ======================================================================
      // ENTER RUNNING_EXPERIMENT
      // ======================================================================

      await this.lifecycle
        .beginExperiment(
          scope
        );


      // ======================================================================
      // INJECTION
      // ======================================================================

      await this.updateRun(
        runContext,
        EXPERIMENT_RUN_STATUS
          .INJECTING
      );


      const injection =
        await this
          .failureInjector
          .inject({
            ...runContext,

            failureKey:
              input.failureKey ||
              definition.experimentKey,

            target:
              input.target ||
              null,

            parameters:
              input.injectionParameters ||
              {},

            /*
             * The injector is allowed to know the injection definition.
             * AIRA reasoning is not.
             */
            evaluatorGroundTruth,

            safetyClass:
              "LAB_ONLY",

            executionAuthorized:
              false,
          });


      assertNonAuthorizingResult(
        injection,
        "failure injection"
      );


      await this.repository
        .updateExperimentRunState({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentRunId:
            run.publicId,

          status:
            EXPERIMENT_RUN_STATUS
              .FAILURE_ACTIVE,

          failureSummary: {
            injectionReference:
              firstNonEmpty(
                injection?.publicId,
                injection?.injectionId,
                injection?.id
              ),

            injectedAt:
              injection?.injectedAt ||
              toIso(
                this.now()
              ),

            safetyClass:
              "LAB_ONLY",

            /*
             * Never persist evaluator ground truth into the public
             * failure summary consumed by the reasoning harness.
             */
            groundTruthIncluded:
              false,

            executionAuthorized:
              false,
          },
        });


      // ======================================================================
      // WAITING FOR DETECTION / CORRELATION
      // ======================================================================

      await this.updateRun(
        runContext,
        EXPERIMENT_RUN_STATUS
          .WAITING_FOR_DETECTION
      );


      const observableSignal =
        await resolveObservableSignal({
          input,

          injection,

          runContext,

          definition,
        });


      /*
       * CRITICAL FIREWALL:
       *
       * evaluatorGroundTruth is deliberately NOT passed.
       */
      const correlation =
        await this
          .correlationHarness
          .observe({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            tenantId:
              input.tenantId,

            experimentRunId:
              run.publicId,

            correlationId,

            observableSignal,

            ingestionContext:
              input.ingestionContext ||
              {},

            ingestionOptions:
              input.ingestionOptions ||
              {},
          });


      assertNonAuthorizingResult(
        correlation,
        "AIRA correlation"
      );


      await this.updateRun(
        runContext,
        EXPERIMENT_RUN_STATUS
          .WAITING_FOR_DIAGNOSIS
      );


      return {
        orchestratorVersion:
          ORCHESTRATOR_VERSION,

        experimentRunId:
          run.publicId,

        experimentKey:
          definition.experimentKey,

        experimentVersion:
          definition.version,

        correlationId,

        status:
          EXPERIMENT_RUN_STATUS
            .WAITING_FOR_DIAGNOSIS,

        baseline:
          sanitizeEvidence(
            baseline
          ),

        injection: {
          referenceId:
            firstNonEmpty(
              injection?.publicId,
              injection?.injectionId,
              injection?.id
            ),

          injected:
            injection?.injected !==
            false,

          executionAuthorized:
            false,
        },

        correlation,

        evaluator: {
          groundTruthAvailable:
            evaluatorGroundTruth !==
            null,

          groundTruthPassedToAira:
            false,

          evaluationPerformed:
            false,
        },

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      await this
        .handleRunFailure(
          runContext,
          scope,
          error
        );


      throw error;
    }
  }


  /**
   * Explicit cleanup path for the foundation run.
   *
   * Until 21.13+ continue the experiment, callers may use this after
   * runToCorrelation() to return the lab to a known-good state.
   */
  async resetAfterPartialRun(
    {
      organizationId,

      environmentId,

      labEnvironmentId,

      experimentRunId,

      resetter,

      baselineProvider =
        this.baselineProvider,
    }
  ) {
    if (
      !resetter ||
      typeof resetter.reset !==
        "function"
    ) {
      throw orchestratorError(
        "PHASE21_RESETTER_REQUIRED",
        "A deterministic Reliability Lab resetter is required"
      );
    }


    const scope = {
      organizationId,

      environmentId,

      labEnvironmentId,
    };


    await this.repository
      .updateExperimentRunState({
        organizationId,

        environmentId,

        experimentRunId,

        status:
          EXPERIMENT_RUN_STATUS
            .RESETTING,
      });


    await this.lifecycle
      .beginReset(
        scope
      );


    try {
      const resetResult =
        await resetter
          .reset({
            organizationId,

            environmentId,

            labEnvironmentId,

            experimentRunId,

            safetyClass:
              "LAB_ONLY",

            executionAuthorized:
              false,
          });


      assertNonAuthorizingResult(
        resetResult,
        "reset"
      );


      const baseline =
        await baselineProvider
          .capture({
            organizationId,

            environmentId,

            labEnvironmentId,

            experimentRunId,

            safetyClass:
              "LAB_ONLY",

            executionAuthorized:
              false,
          });


      assertNonAuthorizingResult(
        baseline,
        "post-reset baseline"
      );


      await this.lifecycle
        .completeReset(
          scope,
          sanitizeEvidence(
            baseline
          )
        );


      await this.repository
        .updateExperimentRunState({
          organizationId,

          environmentId,

          experimentRunId,

          status:
            EXPERIMENT_RUN_STATUS
              .ABORTED,

          outcome:
            "ABORTED",

          completedAt:
            this.now(),

          resetSummary: {
            resetSucceeded:
              true,

            baselineRestored:
              true,

            executionAuthorized:
              false,
          },
        });


      return {
        resetSucceeded:
          true,

        baselineRestored:
          true,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      try {
        await this.lifecycle
          .failReset(
            scope,
            error.message
          );
      } catch {
        try {
          await this.lifecycle
            .markDirty(
              scope,
              `Reset failed: ${error.message}`
            );
        } catch {
          // Preserve original reset failure.
        }
      }


      throw error;
    }
  }


  requireDependencies() {
    if (
      !this.baselineProvider ||
      typeof this
        .baselineProvider
        .capture !==
        "function"
    ) {
      throw orchestratorError(
        "PHASE21_BASELINE_PROVIDER_REQUIRED",
        "Phase 21.11 requires the existing Reliability Lab baseline provider"
      );
    }


    if (
      !this.failureInjector ||
      typeof this
        .failureInjector
        .inject !==
        "function"
    ) {
      throw orchestratorError(
        "PHASE21_FAILURE_INJECTOR_REQUIRED",
        "Phase 21.11 requires the existing Phase 21 failure injector"
      );
    }
  }


  async updateRun(
    context,
    status,
    extra =
      {}
  ) {
    return this.repository
      .updateExperimentRunState({
        organizationId:
          context.organizationId,

        environmentId:
          context.environmentId,

        experimentRunId:
          context.experimentRunId,

        status,

        ...extra,
      });
  }


  async handleRunFailure(
    runContext,
    scope,
    error
  ) {
    try {
      await this.repository
        .updateExperimentRunState({
          organizationId:
            runContext.organizationId,

          environmentId:
            runContext.environmentId,

          experimentRunId:
            runContext.experimentRunId,

          status:
            EXPERIMENT_RUN_STATUS
              .FAILED,

          completedAt:
            this.now(),

          failureSummary: {
            orchestrationFailed:
              true,

            errorCode:
              error?.code ||
              "PHASE21_ORCHESTRATION_FAILED",

            errorMessage:
              String(
                error?.message ||
                "Experiment orchestration failed"
              )
                .slice(
                  0,
                  2048
                ),

            executionAuthorized:
              false,
          },
        });
    } catch {
      // Preserve original orchestration error.
    }


    /*
     * Once an experiment has potentially modified the lab, failure must
     * never silently return it to AVAILABLE.
     */
    try {
      const environment =
        await this.lifecycle
          .requireEnvironment(
            scope
          );


      if (
        environment.status ===
          "RUNNING_EXPERIMENT"
      ) {
        await this.lifecycle
          .markDirty(
            scope,
            `Experiment failed before controlled reset: ${error.message}`
          );
      }
    } catch {
      // Preserve original orchestration error.
    }
  }
}


// ============================================================================
// OBSERVABLE SIGNAL
// ============================================================================

async function resolveObservableSignal({
  input,
  injection,
  runContext,
  definition,
}) {
  if (
    input.observableSignal
  ) {
    return sanitizeObservableSignal(
      input.observableSignal
    );
  }


  if (
    typeof input
      .observableSignalFactory ===
      "function"
  ) {
    const result =
      await input
        .observableSignalFactory({
          runContext,

          injection:
            sanitizeInjectionForObservation(
              injection
            ),

          /*
           * Public definition intentionally excludes groundTruth.
           */
          definition:
            publicDefinition(
              definition
            ),
        });


    return sanitizeObservableSignal(
      result
    );
  }


  if (
    injection
      ?.observableSignal
  ) {
    return sanitizeObservableSignal(
      injection.observableSignal
    );
  }


  throw orchestratorError(
    "PHASE21_OBSERVABLE_SIGNAL_UNAVAILABLE",
    "Failure was injected but no observable signal was supplied to the AIRA correlation path"
  );
}


function sanitizeObservableSignal(
  signal
) {
  if (
    !signal ||
    typeof signal !==
      "object" ||
    Array.isArray(
      signal
    )
  ) {
    throw orchestratorError(
      "PHASE21_OBSERVABLE_SIGNAL_INVALID",
      "Observable signal must be an object"
    );
  }


  const clone =
    deepClone(
      signal
    );


  /*
   * Fail closed rather than deleting secret evaluator fields.
   *
   * A silent delete could hide a test bug where ground truth was being
   * passed toward AIRA.
   */
  const forbidden =
    findForbiddenGroundTruthField(
      clone
    );


  if (
    forbidden
  ) {
    throw orchestratorError(
      "PHASE21_GROUND_TRUTH_LEAK_BLOCKED",
      `Observable signal contains evaluator-only field: ${forbidden}`
    );
  }


  return clone;
}


// ============================================================================
// DEFINITION / EVIDENCE SANITIZATION
// ============================================================================

function publicDefinition(
  definition
) {
  return {
    publicId:
      definition.publicId,

    experimentKey:
      definition.experimentKey,

    version:
      definition.version,

    name:
      definition.name,

    description:
      definition.description,

    targetResourceType:
      definition.targetResourceType,

    configuration:
      sanitizeMetadata(
        definition.configuration
      ),

    executionAuthorized:
      false,
  };
}


function sanitizeInjectionForObservation(
  injection
) {
  return {
    publicId:
      firstNonEmpty(
        injection?.publicId,
        injection?.injectionId,
        injection?.id
      ),

    injectedAt:
      injection?.injectedAt ||
      null,

    target:
      sanitizeEvidence(
        injection?.target ||
        null
      ),

    observable:
      injection?.observable !==
      false,

    executionAuthorized:
      false,
  };
}


function sanitizeEvidence(
  value
) {
  if (
    value ===
      undefined
  ) {
    return null;
  }


  const clone =
    deepClone(
      value
    );


  removeAuthorityFields(
    clone
  );


  return clone;
}


function sanitizeMetadata(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }


  const clone =
    deepClone(
      value
    );


  removeAuthorityFields(
    clone
  );


  delete clone.groundTruth;
  delete clone.ground_truth;
  delete clone.expectedFailureMode;
  delete clone.expectedDiagnosis;


  return clone;
}


function removeAuthorityFields(
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
    return;
  }


  seen.add(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const child
      of value
    ) {
      removeAuthorityFields(
        child,
        seen
      );
    }


    return;
  }


  value.executionAuthorized =
    false;


  for (
    const child
    of Object.values(
      value
    )
  ) {
    removeAuthorityFields(
      child,
      seen
    );
  }
}


// ============================================================================
// SAFETY
// ============================================================================

function assertNonAuthorizingResult(
  result,
  label
) {
  if (
    result
      ?.executionAuthorized ===
      true ||
    result
      ?.productionCertified ===
      true ||
    result
      ?.canGrantAutonomy ===
      true
  ) {
    throw orchestratorError(
      "PHASE21_AUTHORITY_VIOLATION",
      `${label} attempted to return forbidden authority`
    );
  }


  return true;
}


function findForbiddenGroundTruthField(
  value,
  path =
    "$",
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
    return null;
  }


  seen.add(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    for (
      let index =
        0;
      index <
        value.length;
      index +=
        1
    ) {
      const found =
        findForbiddenGroundTruthField(
          value[index],
          `${path}[${index}]`,
          seen
        );


      if (
        found
      ) {
        return found;
      }
    }


    return null;
  }


  const forbiddenKeys =
    new Set([
      "groundTruth",
      "ground_truth",

      "expectedFailureMode",
      "expected_failure_mode",

      "expectedDiagnosis",
      "expected_diagnosis",

      "expectedRootCause",
      "expected_root_cause",

      "expectedRecovery",
      "expected_recovery",

      "injectedFailureType",
      "injected_failure_type",
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
      forbiddenKeys.has(
        key
      )
    ) {
      return `${path}.${key}`;
    }


    const nested =
      findForbiddenGroundTruthField(
        child,
        `${path}.${key}`,
        seen
      );


    if (
      nested
    ) {
      return nested;
    }
  }


  return null;
}


// ============================================================================
// INPUT
// ============================================================================

function validateRunInput(
  input
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw orchestratorError(
      "PHASE21_RUN_INPUT_REQUIRED",
      "Experiment run input is required"
    );
  }


  for (
    const field
    of [
      "organizationId",
      "environmentId",
      "tenantId",
      "labEnvironmentId",
      "experimentKey",
    ]
  ) {
    if (
      !firstNonEmpty(
        input[field]
      )
    ) {
      throw orchestratorError(
        "PHASE21_RUN_CONTEXT_REQUIRED",
        `${field} is required`,
        {
          field,
        }
      );
    }
  }


  if (
    input.production ===
      true ||
    input.safetyClass ===
      "PRODUCTION"
  ) {
    throw orchestratorError(
      "PHASE21_PRODUCTION_ENVIRONMENT_FORBIDDEN",
      "Reliability Lab cannot orchestrate production infrastructure"
    );
  }


  if (
    input.executionAuthorized ===
      true
  ) {
    throw orchestratorError(
      "PHASE21_AUTHORITY_VIOLATION",
      "Phase 21 cannot grant execution authorization"
    );
  }
}


// ============================================================================
// UTILITIES
// ============================================================================

function deepClone(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  return JSON.parse(
    JSON.stringify(
      value
    )
  );
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
      return value;
    }
  }


  return null;
}


function toIso(
  value
) {
  return value instanceof
    Date
    ? value.toISOString()
    : new Date(
        value
      )
        .toISOString();
}


function orchestratorError(
  code,
  message,
  extra =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ReliabilityExperimentOrchestratorError",

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
  ORCHESTRATOR_VERSION,

  ExperimentOrchestrator,

  validateRunInput,

  resolveObservableSignal,

  publicDefinition,

  sanitizeObservableSignal,

  assertNonAuthorizingResult,

  findForbiddenGroundTruthField,
};