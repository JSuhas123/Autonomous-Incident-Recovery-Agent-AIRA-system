"use strict";

const {
  AiraDiagnosisHarness,
} = require(
  "../reliability/airaDiagnosisHarness"
);

const {
  RealityEnvironmentReplayBindingService,
  ENVIRONMENT_REPLAY_RUN_STAGE,
} = require(
  "./realityEnvironmentReplayBindingService"
);

const REALITY_AIRA_INVESTIGATION_BRIDGE_VERSION =
  "23R.10E.0";

const FORBIDDEN_EVALUATOR_KEYS =
  Object.freeze(
    new Set([
      "groundTruth",
      "ground_truth",

      "evaluatorGroundTruth",
      "evaluator_ground_truth",

      "sealedEvaluation",
      "sealed_evaluation",

      "evaluationRubric",
      "evaluation_rubric",

      "knownFault",
      "known_fault",

      "expectedDiagnosis",
      "expected_diagnosis",

      "expectedFailureMode",
      "expected_failure_mode",

      "expectedFailureModeKey",
      "expected_failure_mode_key",

      "expectedRootCause",
      "expected_root_cause",

      "expectedRecovery",
      "expected_recovery",

      "expectedPlaybook",
      "expected_playbook",

      "expectedRunbook",
      "expected_runbook",
    ])
  );

const AUTHORITY_KEYS =
  Object.freeze(
    new Set([
      "executionAuthorized",
      "execution_authorized",

      "productionAuthorized",
      "production_authorized",
    ])
  );


function bridgeError(
  code,
  message,
  status = 422,
  metadata = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "RealityAiraInvestigationBridgeError",

      code,

      status,

      productionCertified:
        false,

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
    value.trim() ===
      ""
  ) {
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_FIELD_REQUIRED",
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
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_OBJECT_REQUIRED",
      `${field} must be an object`
    );
  }

  return value;
}


function findUnsafeField(
  value,
  path =
    ""
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      let index = 0;
      index <
        value.length;
      index += 1
    ) {
      const found =
        findUnsafeField(
          value[
            index
          ],
          `${path}[${index}]`
        );

      if (
        found
      ) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value !==
      "object"
  ) {
    return null;
  }

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
      FORBIDDEN_EVALUATOR_KEYS
        .has(
          key
        )
    ) {
      return {
        type:
          "GROUND_TRUTH",

        key,

        path:
          `${path}.${key}`,
      };
    }

    if (
      AUTHORITY_KEYS
        .has(
          key
        ) &&
      child ===
        true
    ) {
      return {
        type:
          "AUTHORITY",

        key,

        path:
          `${path}.${key}`,
      };
    }

    const found =
      findUnsafeField(
        child,
        `${path}.${key}`
      );

    if (
      found
    ) {
      return found;
    }
  }

  return null;
}


function assertSafeAgentInput(
  value,
  field
) {
  const unsafe =
    findUnsafeField(
      value
    );

  if (
    !unsafe
  ) {
    return true;
  }

  if (
    unsafe.type ===
      "AUTHORITY"
  ) {
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_AUTHORITY_FORBIDDEN",
      (
        `Authority field ${unsafe.key} ` +
        `was true in ${field}${unsafe.path}`
      )
    );
  }

  throw bridgeError(
    "REALITY_AIRA_INVESTIGATION_GROUND_TRUTH_FORBIDDEN",
    (
      `Evaluator-owned field ${unsafe.key} ` +
      `was present in ${field}${unsafe.path}`
    )
  );
}


function resolveIncidentId(
  input
) {
  const incidentId =
    input.incidentId ||
    input.correlation
      ?.incidentId ||
    input.replayResult
      ?.correlation
      ?.incidentId;

  return requireString(
    incidentId,
    "incidentId"
  );
}


function validateInvestigationInput(
  input
) {
  requireObject(
    input,
    "input"
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
    input.tenantId ||
      input.organizationId,
    "tenantId"
  );

  requireString(
    input.environmentReplayRunId,
    "environmentReplayRunId"
  );

  requireString(
    input.experimentRunId,
    "experimentRunId"
  );

  requireString(
    input.correlationId,
    "correlationId"
  );

  resolveIncidentId(
    input
  );

  assertSafeAgentInput(
    input.diagnosisDependencies ||
      {},
    "diagnosisDependencies"
  );

  if (
    input.production ===
      true ||
    input.executionAuthorized ===
      true ||
    input.productionAuthorized ===
      true
  ) {
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_AUTHORITY_FORBIDDEN",
      (
        "Phase 23R investigation cannot grant " +
        "production or execution authority"
      )
    );
  }

  if (
    input.groundTruth !==
      undefined ||
    input.evaluatorGroundTruth !==
      undefined ||
    input.sealedEvaluation !==
      undefined
  ) {
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_GROUND_TRUTH_FORBIDDEN",
      (
        "Evaluator ground truth must remain sealed " +
        "from AIRA investigation"
      )
    );
  }
}


function assertDiagnosisObservationSafe(
  observation
) {
  requireObject(
    observation,
    "diagnosisObservation"
  );

  if (
    observation.executionAuthorized ===
      true ||
    observation.productionCertified ===
      true ||
    observation.groundTruthConsumed ===
      true ||
    observation.evaluatorInfluencedReasoning ===
      true
  ) {
    throw bridgeError(
      "REALITY_AIRA_INVESTIGATION_RESULT_UNSAFE",
      (
        "AIRA diagnosis observation violated " +
        "Reality replay safety invariants"
      ),
      500
    );
  }

  assertSafeAgentInput(
    observation,
    "diagnosisObservation"
  );

  requireString(
    observation.incidentId,
    "diagnosisObservation.incidentId"
  );

  return true;
}


class RealityAiraInvestigationBridge {
  constructor(
    options = {}
  ) {
    this.bindingService =
      options.bindingService ||
      new RealityEnvironmentReplayBindingService(
        options
      );

    this.diagnosisHarness =
      options.diagnosisHarness ||
      new AiraDiagnosisHarness(
        options
      );
  }


  async investigate(
    input = {}
  ) {
    validateInvestigationInput(
      input
    );

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

    const tenantId =
      requireString(
        input.tenantId ||
          input.organizationId,
        "tenantId"
      );

    const environmentReplayRunId =
      requireString(
        input.environmentReplayRunId,
        "environmentReplayRunId"
      );

    const experimentRunId =
      requireString(
        input.experimentRunId,
        "experimentRunId"
      );

    const correlationId =
      requireString(
        input.correlationId,
        "correlationId"
      );

    const incidentId =
      resolveIncidentId(
        input
      );

    let investigating =
      false;

    try {
      await this
        .bindingService
        .transitionStage({
          organizationId,

          environmentId,

          environmentReplayRunId,

          stage:
            ENVIRONMENT_REPLAY_RUN_STAGE
              .INVESTIGATING,
        });

      investigating =
        true;

      /*
       * ================================================================
       * ACTUAL AIRA DIAGNOSIS
       * ================================================================
       *
       * This reuses the frozen Phase-21 diagnosis harness.
       *
       * No evaluator ground truth is provided here.
       */
      const diagnosisObservation =
        await this
          .diagnosisHarness
          .observe({
            organizationId,

            environmentId,

            tenantId,

            experimentRunId,

            correlationId,

            incidentId,

            diagnosisDependencies:
              input.diagnosisDependencies ||
              {},
          });

      assertDiagnosisObservationSafe(
        diagnosisObservation
      );

      /*
       * Diagnosis completed.
       *
       * Recovery has NOT been authorized here.
       * We merely record that the Reality replay is ready
       * for the existing recovery decision/authorization path.
       */
      const binding =
        await this
          .bindingService
          .transitionStage({
            organizationId,

            environmentId,

            environmentReplayRunId,

            stage:
              ENVIRONMENT_REPLAY_RUN_STAGE
                .RECOVERY_PENDING,
          });

      return {
        bridgeVersion:
          REALITY_AIRA_INVESTIGATION_BRIDGE_VERSION,

        replayRunId:
          input.replayRunId ||
          null,

        environmentReplayRunId,

        experimentRunId,

        correlationId,

        incidentId,

        stage:
          binding.stage,

        diagnosis:
          diagnosisObservation,

        diagnosisRunId:
          diagnosisObservation
            .diagnosisRunId ||
          null,

        selectedFailureMode:
          diagnosisObservation
            .selectedFailureMode ||
          null,

        primaryHypothesis:
          diagnosisObservation
            .primaryHypothesis ||
          null,

        diagnosisConfidence:
          diagnosisObservation
            .diagnosisConfidence ??
          null,

        evidenceCompleteness:
          diagnosisObservation
            .evidenceCompleteness ??
          null,

        evaluator: {
          groundTruthConsumed:
            false,

          evaluatorInfluencedReasoning:
            false,

          groundTruthPassedToAira:
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
      if (
        investigating
      ) {
        try {
          await this
            .bindingService
            .transitionStage({
              organizationId,

              environmentId,

              environmentReplayRunId,

              stage:
                ENVIRONMENT_REPLAY_RUN_STAGE
                  .FAILED,

              failureCode:
                error?.code ||
                "REALITY_AIRA_INVESTIGATION_FAILED",

              failureMessage:
                error?.message ||
                "AIRA investigation failed",
            });
        } catch (
          transitionError
        ) {
          error
            .environmentReplayFailureTransition =
            {
              code:
                transitionError?.code ||
                null,

              message:
                transitionError?.message ||
                String(
                  transitionError
                ),
            };
        }
      }

      throw error;
    }
  }
}


module.exports = {
  REALITY_AIRA_INVESTIGATION_BRIDGE_VERSION,

  FORBIDDEN_EVALUATOR_KEYS,

  AUTHORITY_KEYS,

  RealityAiraInvestigationBridge,

  validateInvestigationInput,

  resolveIncidentId,

  findUnsafeField,

  assertSafeAgentInput,

  assertDiagnosisObservationSafe,
};