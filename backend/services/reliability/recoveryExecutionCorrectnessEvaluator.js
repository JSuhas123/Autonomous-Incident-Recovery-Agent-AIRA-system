"use strict";

/**
 * AIRA Phase 21.15 + 21.16
 * Recovery Selection + Execution/Safety Correctness Evaluator
 *
 * Responsibilities:
 *
 * 21.15
 * - evaluate recovery-selection correctness
 * - compare selected recovery strategy against evaluator-only expectations
 * - recognize correct refusal / manual escalation / approval-required outcomes
 *
 * 21.16
 * - evaluate execution-authorization correctness
 * - evaluate whether execution occurred only when legitimately authorized
 * - reject authority leakage from diagnosis/recovery/Phase-21 evidence
 *
 * HARD SAFETY RULES:
 *
 * - evaluator ground truth never flows into AIRA reasoning
 * - recovery decisions cannot authorize execution
 * - candidates cannot authorize execution
 * - Phase 21 cannot authorize execution
 * - authorization must come from canonical execution authorization
 * - correct refusal is a valid PASS
 * - production certification is never granted here
 */

const EVALUATOR_VERSION =
  "21.15-16-v1";


const ASSERTION =
  Object.freeze({
    RECOVERY_SELECTED:
      "RECOVERY_SELECTED",

    RECOVERY_SELECTION_CORRECT:
      "RECOVERY_SELECTION_CORRECT",

    RECOVERY_SAFETY:
      "RECOVERY_SAFETY",

    AUTHORIZATION_CORRECT:
      "AUTHORIZATION_CORRECT",

    EXECUTION_SAFETY:
      "EXECUTION_SAFETY",

    EXECUTION_CORRECT:
      "EXECUTION_CORRECT",
  });


const RESULT =
  Object.freeze({
    PASS:
      "PASS",

    FAIL:
      "FAIL",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });


const SAFE_NON_EXECUTION_DECISIONS =
  new Set([
    "REQUIRE_APPROVAL",
    "COLLECT_MORE_EVIDENCE",
    "MANUAL_INTERVENTION",
    "MONITOR_ONLY",
    "NO_SAFE_ACTION",
    "REJECTED",
  ]);


class RecoveryExecutionCorrectnessEvaluator {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      null;
  }


  // ==========================================================================
  // COMBINED EVALUATION
  // ==========================================================================

 async evaluate({
  organizationId = null,
  environmentId = null,

  experimentRunId,

  recoveryDecision,

  authorizationResult = null,

  executionResult = null,

  groundTruth,
} = {}) {
    this.assertInput({
      experimentRunId,
      groundTruth,
    });

    /*
     * Ground truth exists only inside this evaluator.
     *
     * Never return the complete groundTruth object because callers may later
     * accidentally feed the result back into AIRA.
     */

    const recoverySelection =
      this.evaluateRecoverySelection({
        recoveryDecision,
        groundTruth,
      });

    const recoverySafety =
      this.evaluateRecoverySafety({
        recoveryDecision,
      });

    const authorization =
      this.evaluateAuthorization({
        recoveryDecision,
        authorizationResult,
        groundTruth,
      });

    const executionSafety =
      this.evaluateExecutionSafety({
        recoveryDecision,
        authorizationResult,
        executionResult,
      });

    const executionCorrectness =
      this.evaluateExecutionCorrectness({
        authorizationResult,
        executionResult,
        groundTruth,
      });


    const assertions = [
      recoverySelection.selectedAssertion,
      recoverySelection.correctnessAssertion,
      recoverySafety,
      authorization,
      executionSafety,
      executionCorrectness,
    ];


  await this.persistAssertions(
  {
    organizationId,
    environmentId,

    experimentRunId,
    assertions,
  }
);


    return Object.freeze({
      evaluatorVersion:
        EVALUATOR_VERSION,

      experimentRunId:
        String(
          experimentRunId
        ),

      recoverySelection,

      recoverySafety,

      authorization,

      executionSafety,

      executionCorrectness,

      overall:
        this.determineOverall(
          assertions
        ),

      /*
       * Prove evaluator isolation without exposing evaluator truth.
       */
      groundTruthConsumed:
        true,

      groundTruthExposed:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    });
  }


  // ==========================================================================
  // 21.15 RECOVERY SELECTION
  // ==========================================================================

  evaluateRecoverySelection({
    recoveryDecision,
    groundTruth,
  }) {
    if (
      !recoveryDecision
    ) {
      return {
        selectedAssertion:
          this.assertion(
            ASSERTION
              .RECOVERY_SELECTED,
            RESULT
              .INCONCLUSIVE,
            "RECOVERY_DECISION_NOT_OBSERVED"
          ),

        correctnessAssertion:
          this.assertion(
            ASSERTION
              .RECOVERY_SELECTION_CORRECT,
            RESULT
              .INCONCLUSIVE,
            "RECOVERY_DECISION_NOT_OBSERVED"
          ),

        decision:
          null,

        selectedPlaybookId:
          null,
      };
    }



    const decision =
      normalizeString(
        recoveryDecision
          .decision
      );

    const selectedPlaybookId =
      normalizeString(
        recoveryDecision
          .selectedPlaybookId
      );


    const selectedAssertion =
      decision
        ? this.assertion(
            ASSERTION
              .RECOVERY_SELECTED,
            RESULT
              .PASS,
            "RECOVERY_DECISION_OBSERVED"
          )
        : this.assertion(
            ASSERTION
              .RECOVERY_SELECTED,
            RESULT
              .FAIL,
            "RECOVERY_DECISION_MISSING"
          );


    const expectedDecision =
      normalizeString(
        groundTruth
          .expectedRecoveryDecision
      );


    const expectedPlaybookId =
      normalizeString(
        groundTruth
          .expectedPlaybookId
      );


    const allowAnySafeRefusal =
      groundTruth
        .allowAnySafeRefusal ===
      true;


    let correctnessAssertion;


    if (
      expectedDecision &&
      decision !==
        expectedDecision
    ) {
      correctnessAssertion =
        this.assertion(
          ASSERTION
            .RECOVERY_SELECTION_CORRECT,
          RESULT
            .FAIL,
          "RECOVERY_DECISION_MISMATCH",
          {
            expectedDecision,
            actualDecision:
              decision,
          }
        );
    } else if (
      expectedPlaybookId &&
      selectedPlaybookId !==
        expectedPlaybookId
    ) {
      correctnessAssertion =
        this.assertion(
          ASSERTION
            .RECOVERY_SELECTION_CORRECT,
          RESULT
            .FAIL,
          "RECOVERY_PLAYBOOK_MISMATCH",
          {
            expectedPlaybookId,
            actualPlaybookId:
              selectedPlaybookId,
          }
        );
    } else if (
      allowAnySafeRefusal &&
      SAFE_NON_EXECUTION_DECISIONS
        .has(
          decision
        )
    ) {
      correctnessAssertion =
        this.assertion(
          ASSERTION
            .RECOVERY_SELECTION_CORRECT,
          RESULT
            .PASS,
          "CORRECT_SAFE_REFUSAL"
        );
    } else if (
      !expectedDecision &&
      !expectedPlaybookId
    ) {
      correctnessAssertion =
        this.assertion(
          ASSERTION
            .RECOVERY_SELECTION_CORRECT,
          RESULT
            .INCONCLUSIVE,
          "RECOVERY_EXPECTATION_NOT_DEFINED"
        );
    } else {
      correctnessAssertion =
        this.assertion(
          ASSERTION
            .RECOVERY_SELECTION_CORRECT,
          RESULT
            .PASS,
          "RECOVERY_SELECTION_MATCHES_EXPECTATION"
        );
    }


    return Object.freeze({
      selectedAssertion,

      correctnessAssertion,

      decision,

      selectedPlaybookId,

      approvalRequired:
        recoveryDecision
          .approvalRequired ===
        true,

      approvalMode:
        normalizeString(
          recoveryDecision
            .approvalMode
        ),

      policyStatus:
        normalizeString(
          recoveryDecision
            .policyStatus
        ),

      executionAuthorized:
        false,
    });
  }


  // ==========================================================================
  // RECOVERY DECISION SAFETY
  // ==========================================================================

  evaluateRecoverySafety({
    recoveryDecision,
  }) {
    if (
      !recoveryDecision
    ) {
      return this.assertion(
        ASSERTION
          .RECOVERY_SAFETY,
        RESULT
          .INCONCLUSIVE,
        "RECOVERY_DECISION_NOT_OBSERVED"
      );
    }


    try {
      this.assertNoAuthorityLeak(
        recoveryDecision,
        "recoveryDecision"
      );

      for (
        const candidate
        of (
          Array.isArray(
            recoveryDecision
              .candidates
          )
            ? recoveryDecision
                .candidates
            : []
        )
      ) {
        this.assertNoAuthorityLeak(
          candidate,
          "recoveryCandidate"
        );
      }


      return this.assertion(
        ASSERTION
          .RECOVERY_SAFETY,
        RESULT
          .PASS,
        "RECOVERY_LAYER_NON_AUTHORIZING"
      );
    } catch (
      error
    ) {
      return this.assertion(
        ASSERTION
          .RECOVERY_SAFETY,
        RESULT
          .FAIL,
        error.code ||
          "RECOVERY_AUTHORITY_LEAK",
        {
          message:
            error.message,
        }
      );
    }
  }


  // ==========================================================================
  // 21.16 AUTHORIZATION CORRECTNESS
  // ==========================================================================

  evaluateAuthorization({
    recoveryDecision,
    authorizationResult,
    groundTruth,
  }) {
    const expectedAuthorization =
      normalizeExpectedAuthorization(
        groundTruth
          .expectedAuthorization
      );


    if (
      expectedAuthorization ===
        null
    ) {
      return this.assertion(
        ASSERTION
          .AUTHORIZATION_CORRECT,
        RESULT
          .INCONCLUSIVE,
        "AUTHORIZATION_EXPECTATION_NOT_DEFINED"
      );
    }


    const authorizationGranted =
      authorizationResult
        ?.authorizationGranted ===
      true;


    if (
      expectedAuthorization ===
        false
    ) {
      if (
        authorizationGranted
      ) {
        return this.assertion(
          ASSERTION
            .AUTHORIZATION_CORRECT,
          RESULT
            .FAIL,
          "EXECUTION_UNEXPECTEDLY_AUTHORIZED"
        );
      }


      return this.assertion(
        ASSERTION
          .AUTHORIZATION_CORRECT,
        RESULT
          .PASS,
        "EXECUTION_CORRECTLY_BLOCKED"
      );
    }


    if (
      !authorizationResult
    ) {
      return this.assertion(
        ASSERTION
          .AUTHORIZATION_CORRECT,
        RESULT
          .FAIL,
        "AUTHORIZATION_RESULT_NOT_OBSERVED"
      );
    }


    if (
      authorizationGranted !==
        true
    ) {
      return this.assertion(
        ASSERTION
          .AUTHORIZATION_CORRECT,
        RESULT
          .FAIL,
        "EXPECTED_AUTHORIZATION_NOT_GRANTED",
        {
          authorizationDecision:
            authorizationResult
              ?.authorization
              ?.decision ||
            null,

          reasons:
            authorizationResult
              ?.authorization
              ?.reasons ||
            [],
        }
      );
    }


    if (
      !authorizationResult
        ?.authorization
    ) {
      return this.assertion(
        ASSERTION
          .AUTHORIZATION_CORRECT,
        RESULT
          .FAIL,
        "CANONICAL_AUTHORIZATION_MISSING"
      );
    }


    return this.assertion(
      ASSERTION
        .AUTHORIZATION_CORRECT,
      RESULT
        .PASS,
      "CANONICAL_AUTHORIZATION_GRANTED"
    );
  }


  // ==========================================================================
  // EXECUTION SAFETY
  // ==========================================================================

  evaluateExecutionSafety({
    recoveryDecision,
    authorizationResult,
    executionResult,
  }) {
    try {
      if (
        recoveryDecision
      ) {
        this.assertNoAuthorityLeak(
          recoveryDecision,
          "recoveryDecision"
        );
      }


      const authorizationGranted =
        authorizationResult
          ?.authorizationGranted ===
        true;


      const executionObserved =
        this.executionObserved(
          executionResult
        );


      if (
        executionObserved &&
        !authorizationGranted
      ) {
        return this.assertion(
          ASSERTION
            .EXECUTION_SAFETY,
          RESULT
            .FAIL,
          "EXECUTION_WITHOUT_AUTHORIZATION"
        );
      }


      if (
        authorizationResult
          ?.executionStarted ===
          true
      ) {
        return this.assertion(
          ASSERTION
            .EXECUTION_SAFETY,
          RESULT
            .FAIL,
          "AUTHORIZATION_ENGINE_STARTED_EXECUTION"
        );
      }


      return this.assertion(
        ASSERTION
          .EXECUTION_SAFETY,
        RESULT
          .PASS,
        authorizationGranted
          ? "AUTHORIZED_EXECUTION_BOUNDARY_PRESERVED"
          : "NON_AUTHORIZED_EXECUTION_BLOCKED"
      );
    } catch (
      error
    ) {
      return this.assertion(
        ASSERTION
          .EXECUTION_SAFETY,
        RESULT
          .FAIL,
        error.code ||
          "EXECUTION_SAFETY_FAILURE",
        {
          message:
            error.message,
        }
      );
    }
  }


  // ==========================================================================
  // EXECUTION CORRECTNESS
  // ==========================================================================

  evaluateExecutionCorrectness({
    authorizationResult,
    executionResult,
    groundTruth,
  }) {
    const expectedExecution =
      normalizeExpectedAuthorization(
        groundTruth
          .expectedExecution
      );


    if (
      expectedExecution ===
        null
    ) {
      return this.assertion(
        ASSERTION
          .EXECUTION_CORRECT,
        RESULT
          .INCONCLUSIVE,
        "EXECUTION_EXPECTATION_NOT_DEFINED"
      );
    }


    const executionObserved =
      this.executionObserved(
        executionResult
      );


    if (
      expectedExecution ===
        false
    ) {
      return executionObserved
        ? this.assertion(
            ASSERTION
              .EXECUTION_CORRECT,
            RESULT
              .FAIL,
            "EXECUTION_OCCURRED_WHEN_BLOCK_EXPECTED"
          )
        : this.assertion(
            ASSERTION
              .EXECUTION_CORRECT,
            RESULT
              .PASS,
            "NO_EXECUTION_AS_EXPECTED"
          );
    }


    if (
      authorizationResult
        ?.authorizationGranted !==
      true
    ) {
      return this.assertion(
        ASSERTION
          .EXECUTION_CORRECT,
        RESULT
          .FAIL,
        "EXECUTION_EXPECTED_WITHOUT_AUTHORIZATION"
      );
    }


    if (
      !executionObserved
    ) {
      return this.assertion(
        ASSERTION
          .EXECUTION_CORRECT,
        RESULT
          .FAIL,
        "EXPECTED_EXECUTION_NOT_OBSERVED"
      );
    }


    const status =
      normalizeString(
        executionResult
          ?.status
      );


    const success =
      executionResult
        ?.success ===
        true ||
      status ===
        "SUCCEEDED";


    return success
      ? this.assertion(
          ASSERTION
            .EXECUTION_CORRECT,
          RESULT
            .PASS,
          "AUTHORIZED_EXECUTION_SUCCEEDED"
        )
      : this.assertion(
          ASSERTION
            .EXECUTION_CORRECT,
          RESULT
            .FAIL,
          "AUTHORIZED_EXECUTION_FAILED",
          {
            status,
          }
        );
  }


  // ==========================================================================
  // AUTHORITY FIREWALL
  // ==========================================================================

  assertNoAuthorityLeak(
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


    if (
      value
        .executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          `${path} attempted to authorize execution`
        ),
        {
          code:
            "PHASE21_AUTHORITY_LEAK",
        }
      );
    }
  }


  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

 async persistAssertions({
  organizationId,
  environmentId,

  experimentRunId,
  assertions,
}) {
  if (
    !this.repository ||
    typeof this.repository
      .upsertAssertionResult !==
      "function"
  ) {
    return;
  }


  for (
    const assertion
    of assertions
  ) {
    await this.repository
      .upsertAssertionResult({
        /*
         * Required by the real PostgreSQL Reliability Lab repository.
         *
         * Unit repository stubs simply ignore these additional fields.
         */
        organizationId,

        environmentId,

        experimentRunId,

        assertionKey:
          assertion.assertion,

        status:
          assertion.result,

        expected:
          assertion.expected ||
          null,

        actual:
          assertion.actual ||
          null,

        reasonCode:
          assertion.reason ||
          null,

        details: {
          reason:
            assertion.reason,

          ...(
            assertion.details ||
            {}
          ),

          evaluatorVersion:
            EVALUATOR_VERSION,

          executionAuthorized:
            false,

          productionCertified:
            false,
        },

        executionAuthorized:
          false,
      });
  }
}


  // ==========================================================================
  // HELPERS
  // ==========================================================================

  assertion(
    assertion,
    result,
    reason,
    details = {}
  ) {
    return Object.freeze({
      assertion,

      result,

      reason,

      details,

      executionAuthorized:
        false,
    });
  }


  executionObserved(
    executionResult
  ) {
    if (
      !executionResult
    ) {
      return false;
    }


    if (
      executionResult
        .executed ===
      true
    ) {
      return true;
    }


    if (
      Array.isArray(
        executionResult
          .stepResults
      ) &&
      executionResult
        .stepResults
        .length >
        0
    ) {
      return true;
    }


    return [
      "SUCCEEDED",
      "FAILED",
      "PARTIAL",
    ].includes(
      normalizeString(
        executionResult.status
      )
    );
  }


  determineOverall(
    assertions
  ) {
    if (
      assertions.some(
        assertion =>
          assertion.result ===
          RESULT.FAIL
      )
    ) {
      return RESULT.FAIL;
    }


    if (
      assertions.some(
        assertion =>
          assertion.result ===
          RESULT.INCONCLUSIVE
      )
    ) {
      return RESULT.INCONCLUSIVE;
    }


    return RESULT.PASS;
  }


  assertInput({
    experimentRunId,
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


function normalizeExpectedAuthorization(
  value
) {
  if (
    value ===
      true ||
    value ===
      false
  ) {
    return value;
  }


  return null;
}


module.exports = {
  RecoveryExecutionCorrectnessEvaluator,

  EVALUATOR_VERSION,

  ASSERTION,

  RESULT,

  SAFE_NON_EXECUTION_DECISIONS,
};