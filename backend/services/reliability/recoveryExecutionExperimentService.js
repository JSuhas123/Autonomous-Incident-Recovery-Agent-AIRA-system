"use strict";

/**
 * AIRA Phase 21.15 + 21.16
 * Recovery Selection + Execution Authorization Experiment Service
 *
 * Responsibilities:
 *
 * - consume an already-produced canonical diagnosis
 * - invoke the existing RecoveryDecisionEngine
 * - normalize its canonical recovery decision
 * - invoke ExecutionAuthorizationEngine only when a selected candidate/playbook exists
 * - never fabricate approval
 * - never fabricate authorization
 * - never execute infrastructure
 * - evaluate selection / authorization safety through Phase 21 evaluator
 *
 * IMPORTANT:
 *
 * This service DOES NOT execute the recovery plan.
 *
 * Phase 21.16 first certifies the authorization boundary itself.
 * Real controlled execution is wired after this service passes.
 */

const recoveryDecisionEngine =
  require(
    "../recovery/recoveryDecisionEngine"
  );

const executionAuthorizationEngine =
  require(
    "../execution/executionAuthorizationEngine"
  );

const {
  RecoveryExecutionCorrectnessEvaluator,
} =
  require(
    "./recoveryExecutionCorrectnessEvaluator"
  );


const SERVICE_VERSION =
  "21.15-16-v1";


const EXECUTABLE_RECOVERY_DECISIONS =
  new Set([
    "RECOMMEND_PLAYBOOK",
    "REQUIRE_APPROVAL",
  ]);


class RecoveryExecutionExperimentService {
  constructor(
    options = {}
  ) {
    this.recoveryDecisionEngine =
      options
        .recoveryDecisionEngine ||
      recoveryDecisionEngine;

    this.executionAuthorizationEngine =
      options
        .executionAuthorizationEngine ||
      executionAuthorizationEngine;

    this.repository =
      options.repository ||
      null;

    this.evaluator =
      options.evaluator ||
      new RecoveryExecutionCorrectnessEvaluator({
        repository:
          this.repository,
      });
  }


  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async run({
    experimentRunId,

    organizationId,

    environmentId,

    tenantId,

    incident,

    diagnosis,

    diagnosisContext = null,

    recoveryDependencies = {},

    authorizationDependencies = {},

    groundTruth,

    playbookResolver = null,
  } = {}) {
    this.assertInput({
      experimentRunId,
      organizationId,
      environmentId,
      incident,
      diagnosis,
      groundTruth,
    });


    this.assertNoGroundTruthLeak(
      diagnosis,
      "diagnosis"
    );

    this.assertNoGroundTruthLeak(
      diagnosisContext,
      "diagnosisContext"
    );


    const incidentId =
      String(
        incident._id ||
        incident.incidentId
      );


    const recoveryInput = {
      organizationId,

      environmentId,

      tenantId:
        tenantId ||
        organizationId,

      incidentId,

      diagnosisId:
        diagnosis
          .diagnosisId ||
        diagnosis
          .runId ||
        null,

      diagnosisRevision:
        diagnosis
          .revision ??
        null,

      diagnosis,

      safetyGate:
        diagnosis
          .safetyGate ||
        diagnosisContext
          ?.safetyGate ||
        null,

      context: {
        ...(
          diagnosisContext ||
          {}
        ),

        organizationId,

        environmentId,

        tenantId:
          tenantId ||
          organizationId,

        incidentId,

        incident,

        diagnosis,

        safetyGate:
          diagnosis
            .safetyGate ||
          diagnosisContext
            ?.safetyGate ||
          null,

        executionAuthorized:
          false,
      },

      executionAuthorized:
        false,
    };


    // ========================================================================
    // 1. CANONICAL RECOVERY DECISION
    // ========================================================================

   let recoveryEngineResult =
  null;

let recoveryDecision =
  null;

let selectedCandidate =
  null;

let recoveryBoundary =
  null;


try {
  recoveryEngineResult =
    await this
      .recoveryDecisionEngine
      .decide(
        recoveryInput,
        recoveryDependencies
      );


  this.assertRecoveryEngineResult(
    recoveryEngineResult
  );


  recoveryDecision =
    recoveryEngineResult
      .decision;


  selectedCandidate =
    recoveryEngineResult
      .selectedCandidate ||
    null;
} catch (
  error
) {
  /*
   * These two failures are not infrastructure/runtime failures.
   *
   * They are the canonical Phase-6 → Phase-7 safety boundary refusing
   * recovery evaluation.
   *
   * Phase 21 must measure that refusal rather than converting it into a
   * failed experiment.
   */
  const canonicalSafetyRefusal =
    [
      "RECOVERY_DECISION_DIAGNOSIS_NOT_ELIGIBLE",
      "RECOVERY_DECISION_NEXT_STEP_INVALID",
    ].includes(
      error.code
    );


  if (
    !canonicalSafetyRefusal
  ) {
    throw error;
  }


  recoveryBoundary =
    this.buildRecoveryBoundaryRefusal({
      incidentId,

      diagnosis,

      error,
    });


  recoveryDecision =
    recoveryBoundary;

  selectedCandidate =
    null;
}


    const recoveryDecisionType =
      normalizeString(
        recoveryDecision
          ?.decision
      );


    // ========================================================================
    // 2. AUTHORIZATION ATTEMPT ELIGIBILITY
    // ========================================================================

    const authorizationEligibility =
      this.determineAuthorizationEligibility({
        recoveryDecision,
        selectedCandidate,
      });


    let authorizationResult =
      null;

    let playbook =
      null;


    if (
      authorizationEligibility
        .eligible
    ) {
      playbook =
        await this.resolvePlaybook({
          recoveryDecision,
          selectedCandidate,
          recoveryDependencies,
          playbookResolver,
        });


      if (
        !playbook
      ) {
        throw Object.assign(
          new Error(
            `Selected playbook could not be resolved: ${recoveryDecision.selectedPlaybookId}`
          ),
          {
            code:
              "PHASE21_SELECTED_PLAYBOOK_NOT_RESOLVED",
          }
        );
      }


      const authorizationInput = {
        organizationId,

        environmentId,

        tenantId:
          tenantId ||
          organizationId,

        incidentId,

        diagnosisId:
          diagnosis
            .diagnosisId ||
          diagnosis
            .runId ||
          null,

        diagnosisRevision:
          diagnosis
            .revision ??
          null,

        recoveryDecisionId:
          recoveryDecision
            .decisionId,

        recoveryDecisionRevision:
          recoveryDecision
            .revision ??
          1,

        selectedCandidateId:
          recoveryDecision
            .selectedCandidateId,

        selectedPlaybookId:
          recoveryDecision
            .selectedPlaybookId,

        recoveryDecision,

        selectedCandidate,

        playbook,

        /*
         * Critical safety invariant:
         *
         * Phase 21 does not pass upstream authorization.
         */
        executionAuthorized:
          false,
      };


      authorizationResult =
        await this
          .executionAuthorizationEngine
          .authorize(
            authorizationInput,
            authorizationDependencies
          );


      this.assertAuthorizationEngineResult(
        authorizationResult
      );
    }


    // ========================================================================
    // 3. PHASE-21 EVALUATION
    // ========================================================================

    const evaluation =
  await this
    .evaluator
    .evaluate({
      organizationId,

      environmentId,

      experimentRunId,

          recoveryDecision,

          authorizationResult,

          /*
           * No execution occurs in this orchestration layer yet.
           *
           * Real lab execution is added after selection + authorization
           * correctness passes.
           */
          executionResult:
            null,

          groundTruth,
        });


    return Object.freeze({
      serviceVersion:
        SERVICE_VERSION,

      experimentRunId:
        String(
          experimentRunId
        ),

      incidentId,

      diagnosisId:
        diagnosis
          .diagnosisId ||
        diagnosis
          .runId ||
        null,

      recoveryEngineResult,

      recoveryDecision,

      selectedCandidate,

      selectedPlaybook:
        playbook,

        recoveryBoundary,

recoverySelectionStarted:
  recoveryEngineResult !==
  null,

recoveryBoundaryRefused:
  recoveryBoundary !==
  null,
  
      authorizationEligibility,

      authorizationResult,

      evaluation,

      recoveryDecisionType,

      executionObserved:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    });
  }

  buildRecoveryBoundaryRefusal({
  incidentId,
  diagnosis,
  error,
}) {
  const safetyGateDecision =
    normalizeString(
      diagnosis
        ?.safetyGate
        ?.decision
    );


  const nextStep =
    normalizeString(
      diagnosis
        ?.recommendedNextStep
        ?.type
    );


  let decision =
    "NO_SAFE_ACTION";


  if (
    safetyGateDecision ===
      "HOLD_FOR_MORE_EVIDENCE" ||
    nextStep ===
      "COLLECT_MORE_EVIDENCE"
  ) {
    decision =
      "COLLECT_MORE_EVIDENCE";
  } else if (
    safetyGateDecision ===
      "MANUAL_REVIEW" ||
    safetyGateDecision ===
      "REJECT_DIAGNOSIS" ||
    nextStep ===
      "MANUAL_INVESTIGATION"
  ) {
    decision =
      "MANUAL_INTERVENTION";
  }


  return Object.freeze({
    /*
     * This is deliberately NOT a Phase-7 RecoveryDecision.
     *
     * It is a Phase-21 observation describing why canonical Phase 7
     * correctly refused to start.
     */
    decisionId:
      null,

    incidentId:
      String(
        incidentId
      ),

    diagnosisId:
      diagnosis
        ?.diagnosisId ||
      diagnosis
        ?.runId ||
      null,

    decision,

    selectedCandidateId:
      null,

    selectedPlaybookId:
      null,

    candidates:
      [],

    approvalRequired:
      false,

    approvalMode:
      "NONE",

    policyStatus:
      "NOT_EVALUATED",

    boundaryRefusal:
      true,

    canonicalErrorCode:
      error.code,

    canonicalErrorMessage:
      error.message,

    safetyGateDecision,

    recommendedNextStep:
      nextStep,

    source:
      "CANONICAL_DIAGNOSIS_RECOVERY_BOUNDARY",

    executionAuthorized:
      false,

    productionCertified:
      false,
  });
}

  // ==========================================================================
  // AUTHORIZATION ELIGIBILITY
  // ==========================================================================

  determineAuthorizationEligibility({
    recoveryDecision,
    selectedCandidate,
  }) {
    if (
      !recoveryDecision
    ) {
      return Object.freeze({
        eligible:
          false,

        reason:
          "RECOVERY_DECISION_NOT_AVAILABLE",
      });
    }


    const decision =
      normalizeString(
        recoveryDecision
          .decision
      );


    if (
      !EXECUTABLE_RECOVERY_DECISIONS
        .has(
          decision
        )
    ) {
      return Object.freeze({
        eligible:
          false,

        reason:
          "RECOVERY_DECISION_NON_EXECUTABLE",
      });
    }


    if (
      !recoveryDecision
        .selectedCandidateId ||
      !recoveryDecision
        .selectedPlaybookId ||
      !selectedCandidate
    ) {
      return Object.freeze({
        eligible:
          false,

        reason:
          "RECOVERY_SELECTION_INCOMPLETE",
      });
    }


    return Object.freeze({
      eligible:
        true,

      reason:
        "RECOVERY_SELECTION_COMPLETE",
    });
  }


  // ==========================================================================
  // PLAYBOOK RESOLUTION
  // ==========================================================================

  async resolvePlaybook({
    recoveryDecision,
    selectedCandidate,
    recoveryDependencies,
    playbookResolver,
  }) {
    if (
      typeof playbookResolver ===
      "function"
    ) {
      return playbookResolver({
        playbookId:
          recoveryDecision
            .selectedPlaybookId,

        candidate:
          selectedCandidate,

        recoveryDecision,
      });
    }


    if (
      selectedCandidate
        ?.playbook
    ) {
      return selectedCandidate
        .playbook;
    }


    if (
      recoveryDependencies
        ?.playbook
    ) {
      return recoveryDependencies
        .playbook;
    }


    if (
      typeof recoveryDependencies
        ?.resolvePlaybook ===
      "function"
    ) {
      return recoveryDependencies
        .resolvePlaybook({
          playbookId:
            recoveryDecision
              .selectedPlaybookId,

          candidate:
            selectedCandidate,

          recoveryDecision,
        });
    }


    return null;
  }


  // ==========================================================================
  // SAFETY
  // ==========================================================================

  assertRecoveryEngineResult(
    result
  ) {
    if (
      !result ||
      !result.decision
    ) {
      throw Object.assign(
        new Error(
          "Canonical RecoveryDecisionEngine result is required"
        ),
        {
          code:
            "PHASE21_RECOVERY_ENGINE_RESULT_REQUIRED",
        }
      );
    }


    if (
      result
        .executionAuthorized ===
        true ||
      result
        .decision
        ?.executionAuthorized ===
        true ||
      result
        .selectedCandidate
        ?.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Recovery layer attempted to authorize execution"
        ),
        {
          code:
            "PHASE21_RECOVERY_AUTHORITY_LEAK",
        }
      );
    }
  }


  assertAuthorizationEngineResult(
    result
  ) {
    if (
      !result ||
      !result.authorization
    ) {
      throw Object.assign(
        new Error(
          "Canonical ExecutionAuthorizationEngine result is required"
        ),
        {
          code:
            "PHASE21_AUTHORIZATION_RESULT_REQUIRED",
        }
      );
    }


    /*
     * The authorization engine may legitimately grant authority.
     *
     * However, it must never start execution itself.
     */
    if (
      result
        .executionStarted ===
      true
    ) {
      throw Object.assign(
        new Error(
          "ExecutionAuthorizationEngine started execution"
        ),
        {
          code:
            "PHASE21_AUTHORIZATION_EXECUTED",
        }
      );
    }
  }


  assertNoGroundTruthLeak(
    value,
    path
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return;
    }


    const forbiddenKeys =
      new Set([
        "groundTruth",
        "expectedDiagnosis",
        "expectedFailureMode",
        "expectedRecoveryDecision",
        "expectedPlaybookId",
        "expectedAuthorization",
        "expectedExecution",
      ]);


    const walk =
      (
        current,
        currentPath
      ) => {
        if (
          !current ||
          typeof current !==
            "object"
        ) {
          return;
        }


        for (
          const [
            key,
            child,
          ]
          of Object.entries(
            current
          )
        ) {
          if (
            forbiddenKeys.has(
              key
            )
          ) {
            throw Object.assign(
              new Error(
                `Evaluator ground truth leaked into ${currentPath}.${key}`
              ),
              {
                code:
                  "PHASE21_GROUND_TRUTH_LEAK",
              }
            );
          }


          if (
            child &&
            typeof child ===
              "object"
          ) {
            walk(
              child,
              `${currentPath}.${key}`
            );
          }
        }
      };


    walk(
      value,
      path
    );
  }


  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput({
    experimentRunId,
    organizationId,
    environmentId,
    incident,
    diagnosis,
    groundTruth,
  }) {
    if (
      !experimentRunId
    ) {
      throw Object.assign(
        new Error(
          "experimentRunId is required"
        ),
        {
          code:
            "PHASE21_EXPERIMENT_RUN_REQUIRED",
        }
      );
    }


    if (
      !organizationId ||
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "organizationId and environmentId are required"
        ),
        {
          code:
            "PHASE21_SCOPE_REQUIRED",
        }
      );
    }


    if (
      !incident ||
      !(
        incident._id ||
        incident.incidentId
      )
    ) {
      throw Object.assign(
        new Error(
          "Canonical incident is required"
        ),
        {
          code:
            "PHASE21_INCIDENT_REQUIRED",
        }
      );
    }


    if (
      !diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Canonical diagnosis is required"
        ),
        {
          code:
            "PHASE21_DIAGNOSIS_REQUIRED",
        }
      );
    }


    if (
      !groundTruth ||
      typeof groundTruth !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Evaluator ground truth is required"
        ),
        {
          code:
            "PHASE21_GROUND_TRUTH_REQUIRED",
        }
      );
    }


    if (
      groundTruth
        .executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Evaluator ground truth cannot authorize execution"
        ),
        {
          code:
            "PHASE21_GROUND_TRUTH_AUTHORITY_FORBIDDEN",
        }
      );
    }
  }
}


function normalizeString(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const normalized =
    String(
      value
    )
      .trim();


  return normalized ||
    null;
}


module.exports = {
  RecoveryExecutionExperimentService,

  SERVICE_VERSION,

  EXECUTABLE_RECOVERY_DECISIONS,
};