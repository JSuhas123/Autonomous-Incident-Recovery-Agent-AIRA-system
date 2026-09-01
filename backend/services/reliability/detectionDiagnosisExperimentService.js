"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  ExperimentOrchestrator,
} =
  require(
    "./experimentOrchestrator"
  );


const {
  AiraDiagnosisHarness,
} =
  require(
    "./airaDiagnosisHarness"
  );


const {
  DetectionDiagnosisEvaluator,
} =
  require(
    "./detectionDiagnosisEvaluator"
  );


const DETECTION_DIAGNOSIS_EXPERIMENT_VERSION =
  "21.13-14-v1";


class DetectionDiagnosisExperimentService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresReliabilityLabRepository(
        options
      );


    this.orchestrator =
      options.orchestrator ||
      new ExperimentOrchestrator({
        ...options,

        repository:
          this.repository,
      });


    this.diagnosisHarness =
      options.diagnosisHarness ||
      new AiraDiagnosisHarness({
        ...options,

        repository:
          this.repository,
      });


    this.evaluator =
      options.evaluator ||
      new DetectionDiagnosisEvaluator({
        ...options,

        repository:
          this.repository,
      });
  }


  /**
   * ==========================================================================
   * RUN THROUGH DIAGNOSIS EVALUATION
   * ==========================================================================
   *
   * Batch 7 intentionally composes on top of the frozen Batch-6 path.
   *
   * Flow:
   *
   * ExperimentOrchestrator.runToCorrelation()
   *        ↓
   * actual canonical incident, if AIRA created one
   *        ↓
   * AiraDiagnosisHarness
   *        ↓
   * actual DiagnosisCoordinator output
   *        ↓
   * evaluator-owned ground truth loaded separately
   *        ↓
   * DetectionDiagnosisEvaluator
   *
   * Ground truth NEVER enters:
   *
   * - signal ingestion
   * - correlation harness
   * - incident creation
   * - diagnosis coordinator
   */
  async runThroughDiagnosis(
    input
  ) {
    validateInput(
      input
    );


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
      throw experimentError(
        "PHASE21_EXPERIMENT_DEFINITION_NOT_FOUND",
        "Reliability experiment definition was not found"
      );
    }


    if (
      !definition.groundTruth ||
      typeof definition.groundTruth !==
        "object"
    ) {
      throw experimentError(
        "PHASE21_EVALUATOR_GROUND_TRUTH_REQUIRED",
        "Batch-7 experiment definition contains no evaluator ground truth"
      );
    }


    /*
     * ================================================================
     * FROZEN BATCH-6 PIPELINE
     * ================================================================
     */
    const correlationResult =
      await this.orchestrator
        .runToCorrelation(
          input
        );


    assertNonAuthorizing(
      correlationResult,
      "Batch-6 correlation result"
    );


    const correlation =
      correlationResult
        .correlation;


    if (
      !correlation
    ) {
      throw experimentError(
        "PHASE21_CORRELATION_RESULT_REQUIRED",
        "Batch-7 received no AIRA correlation result"
      );
    }


    /*
     * Ground truth remains here in the evaluator boundary.
     *
     * It is NOT included in diagnosis dependencies.
     */
    const evaluatorGroundTruth =
      definition.groundTruth;


    // ======================================================================
    // CANONICAL EXPERIMENT RUN EVIDENCE
    // ======================================================================

    const experimentRun =
      await this.repository
        .getExperimentRun({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentRunId:
            correlationResult
              .experimentRunId,
        });


    if (
      !experimentRun
    ) {
      throw experimentError(
        "PHASE21_EXPERIMENT_RUN_NOT_FOUND",
        "Canonical PostgreSQL experiment run was not found after correlation"
      );
    }


    const failureInjectedAt =
      firstNonEmpty(
        experimentRun
          ?.failureSummary
          ?.injectedAt,

        correlationResult
          ?.injection
          ?.injectedAt
      );


    const firstObservableAt =
      firstNonEmpty(
        input.firstObservableAt,

        correlation
          ?.startedAt
      );


    // ======================================================================
    // ACTUAL AIRA DIAGNOSIS
    // ======================================================================

    let diagnosisObservation =
      null;


    if (
      correlation.incidentId
    ) {
      diagnosisObservation =
        await this
          .diagnosisHarness
          .observe({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            tenantId:
              input.tenantId,

            experimentRunId:
              correlationResult
                .experimentRunId,

            correlationId:
              correlationResult
                .correlationId,

            incidentId:
              correlation.incidentId,

            /*
             * Absolutely no evaluator data here.
             */
            diagnosisDependencies:
              sanitizeDiagnosisDependencies(
                input
                  .diagnosisDependencies
              ),
          });


      assertNonAuthorizing(
        diagnosisObservation,
        "AIRA diagnosis observation"
      );
    }


    // ======================================================================
    // EVALUATOR
    // ======================================================================

    const evaluation =
      await this.evaluator
        .evaluate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          experimentRunId:
            correlationResult
              .experimentRunId,

          /*
           * Evaluator ONLY.
           */
          groundTruth:
            evaluatorGroundTruth,

          /*
           * Actual AIRA outputs.
           */
          correlation,

          diagnosisObservation,

          failureInjectedAt,

          firstObservableAt,

          incidentCreatedAt:
            firstNonEmpty(
              input.incidentCreatedAt,

              diagnosisObservation
                ?.startedAt
            ),
        });


    assertNonAuthorizing(
      evaluation,
      "Batch-7 evaluation"
    );


    return {
      experimentVersion:
        DETECTION_DIAGNOSIS_EXPERIMENT_VERSION,

      experimentRunId:
        correlationResult
          .experimentRunId,

      experimentKey:
        correlationResult
          .experimentKey,

      correlationId:
        correlationResult
          .correlationId,

      correlation,

      diagnosis:
        diagnosisObservation,

      evaluation,

      evaluator: {
        groundTruthAvailable:
          true,

        groundTruthUsedOnlyAfterAiraReasoning:
          true,

        groundTruthPassedToAira:
          false,
      },

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }
}


function sanitizeDiagnosisDependencies(
  input
) {
  if (
    input ===
      null ||
    input ===
      undefined
  ) {
    return {};
  }


  if (
    typeof input !==
      "object" ||
    Array.isArray(
      input
    )
  ) {
    throw experimentError(
      "PHASE21_DIAGNOSIS_DEPENDENCIES_INVALID",
      "diagnosisDependencies must be an object"
    );
  }


  const forbidden =
    [
      "groundTruth",
      "ground_truth",

      "expectedDiagnosis",
      "expected_diagnosis",

      "expectedFailureMode",
      "expected_failure_mode",

      "expectedFailureModeKey",

      "expectedRootCause",

      "expectedRecovery",

      "evaluatorGroundTruth",
    ];


  for (
    const key
    of forbidden
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          input,
          key
        )
    ) {
      throw experimentError(
        "PHASE21_GROUND_TRUTH_LEAK_BLOCKED",
        `Evaluator-owned field cannot enter diagnosis dependencies: ${key}`
      );
    }
  }


  return {
    ...input,
  };
}


function assertNonAuthorizing(
  value,
  label
) {
  if (
    value
      ?.executionAuthorized ===
    true
  ) {
    throw experimentError(
      "PHASE21_AUTHORITY_VIOLATION",
      `${label} unexpectedly authorizes execution`
    );
  }
}


function validateInput(
  input
) {
  if (
    !input ||
    typeof input !==
      "object"
  ) {
    throw experimentError(
      "PHASE21_BATCH7_INPUT_REQUIRED",
      "Batch-7 experiment input is required"
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
      "experimentVersion",
    ]
  ) {
    if (
      input[field] ===
        null ||
      input[field] ===
        undefined ||
      String(
        input[field]
      )
        .trim() ===
        ""
    ) {
      throw experimentError(
        "PHASE21_BATCH7_FIELD_REQUIRED",
        `${field} is required`,
        {
          field,
        }
      );
    }
  }


  if (
    input.executionAuthorized ===
    true
  ) {
    throw experimentError(
      "PHASE21_BATCH7_AUTHORITY_FORBIDDEN",
      "Batch-7 experiments cannot authorize execution"
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
      return value;
    }
  }


  return null;
}


function experimentError(
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
        "DetectionDiagnosisExperimentError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  DETECTION_DIAGNOSIS_EXPERIMENT_VERSION,

  DetectionDiagnosisExperimentService,

  sanitizeDiagnosisDependencies,

  experimentError,
};