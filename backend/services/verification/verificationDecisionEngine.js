"use strict";

/**
 * AIRA Verification Decision Engine
 *
 * Phase 9.8
 *
 * Converts aggregated post-execution evidence into a canonical
 * recovery verification decision.
 *
 * Inputs:
 *
 * - recovery evidence package
 * - execution result
 * - optional previous verification result
 *
 * Outputs:
 *
 * - RECOVERED
 * - PARTIALLY_RECOVERED
 * - NOT_RECOVERED
 * - INCONCLUSIVE
 * - REGRESSED
 * - MANUAL_REVIEW
 *
 * DOES NOT:
 *
 * - close incidents
 * - retry recovery
 * - execute rollback
 * - authorize infrastructure execution
 */

const crypto =
  require(
    "node:crypto"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
  createVerificationResult,
  assertVerificationResult,
} =
  require(
    "./verificationContracts"
  );

const DECISION_ENGINE_VERSION =
  "phase9.8-v1";

class VerificationDecisionEngine {
  constructor(
    options = {}
  ) {
    this.recoveredMinimumScore =
      finiteOrDefault(
        options.recoveredMinimumScore,
        0.85
      );

    this.partialMinimumScore =
      finiteOrDefault(
        options.partialMinimumScore,
        0.5
      );

    this.highConfidenceCoverage =
      finiteOrDefault(
        options.highConfidenceCoverage,
        0.9
      );

    this.mediumConfidenceCoverage =
      finiteOrDefault(
        options.mediumConfidenceCoverage,
        0.7
      );
  }

  // ==========================================================================
  // MAIN
  // ==========================================================================

  decide(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const evidence =
      input.evidencePackage;

    const reasons =
      [];

    const warnings =
      [];

    let decision =
      VERIFICATION_DECISION
        .INCONCLUSIVE;

    let nextAction =
      VERIFICATION_NEXT_ACTION
        .COLLECT_MORE_EVIDENCE;

    // ========================================================================
    // 1. EXECUTION FAILED BEFORE VERIFICATION
    // ========================================================================

    if (
      input.executionResult &&
      input.executionResult
        .success ===
        false &&
      input.executionResult
        .rollbackRequired ===
        true
    ) {
      reasons.push(
        "Execution failed after changing infrastructure and rollback is required."
      );

      decision =
        VERIFICATION_DECISION
          .NOT_RECOVERED;

      nextAction =
        VERIFICATION_NEXT_ACTION
          .ROLLBACK;
    }

    // ========================================================================
    // 2. REGRESSION DETECTION
    // ========================================================================

    const regressed =
      this.detectRegression(
        input
      );

    if (
      regressed.detected ===
      true
    ) {
      decision =
        VERIFICATION_DECISION
          .REGRESSED;

      nextAction =
        VERIFICATION_NEXT_ACTION
          .ROLLBACK;

      reasons.push(
        ...regressed.reasons
      );
    }

    // ========================================================================
    // 3. REQUIRED CHECK FAILURE
    // ========================================================================

    if (
      decision !==
        VERIFICATION_DECISION
          .REGRESSED &&
      evidence.required
        ?.failed >
        0
    ) {
      decision =
        VERIFICATION_DECISION
          .NOT_RECOVERED;

      nextAction =
        this.chooseFailureAction(
          input
        );

      reasons.push(
        `${evidence.required.failed} required verification check(s) failed.`
      );
    }

    // ========================================================================
    // 4. CONFLICTING SIGNALS
    // ========================================================================

    if (
      evidence.hasConflicts ===
        true &&
      decision !==
        VERIFICATION_DECISION
          .REGRESSED &&
      decision !==
        VERIFICATION_DECISION
          .NOT_RECOVERED
    ) {
      decision =
        VERIFICATION_DECISION
          .MANUAL_REVIEW;

      nextAction =
        VERIFICATION_NEXT_ACTION
          .MANUAL_INTERVENTION;

      reasons.push(
        "Post-execution evidence contains conflicting recovery signals."
      );

      warnings.push(
        ...normalizeArray(
          evidence.conflicts
        )
          .map(
            (
              conflict
            ) =>
              conflict.message ||
              conflict.type
          )
      );
    }

    // ========================================================================
    // 5. MISSING REQUIRED EVIDENCE
    // ========================================================================

    if (
      decision ===
        VERIFICATION_DECISION
          .INCONCLUSIVE &&
      (
        evidence.required
          ?.missing >
          0 ||
        evidence.required
          ?.inconclusive >
          0
      )
    ) {
      decision =
        VERIFICATION_DECISION
          .INCONCLUSIVE;

      nextAction =
        VERIFICATION_NEXT_ACTION
          .COLLECT_MORE_EVIDENCE;

      reasons.push(
        "Required verification evidence is incomplete or inconclusive."
      );
    }

    // ========================================================================
    // 6. COMPLETE SUCCESS
    // ========================================================================

    if (
      decision ===
        VERIFICATION_DECISION
          .INCONCLUSIVE &&
      evidence.complete ===
        true &&
      evidence.required
        ?.failed ===
        0 &&
      evidence.required
        ?.missing ===
        0 &&
      evidence.required
        ?.inconclusive ===
        0 &&
      evidence.requiredSuccessRate ===
        1 &&
      evidence.hasConflicts !==
        true
    ) {
      const score =
        this.getOverallScore(
          evidence
        );

      if (
        score ===
          null ||
        score >=
          this.recoveredMinimumScore
      ) {
        decision =
          VERIFICATION_DECISION
            .RECOVERED;

        nextAction =
          VERIFICATION_NEXT_ACTION
            .CLOSE_INCIDENT;

        reasons.push(
          "All required post-execution verification checks passed."
        );
      }
    }

    // ========================================================================
// 7. PARTIAL RECOVERY
// ========================================================================

if (
  decision ===
    VERIFICATION_DECISION
      .INCONCLUSIVE
) {
  const score =
    this.getOverallScore(
      evidence
    );

  const hasPassingChecks =
    Number(
      evidence.totals
        ?.passed ||
      0
    ) >
    0;

  const hasFailures =
    Number(
      evidence.totals
        ?.failed ||
      0
    ) >
    0;

  const requiredEvidenceComplete =
    Number(
      evidence.required
        ?.missing ||
      0
    ) ===
      0 &&
    Number(
      evidence.required
        ?.inconclusive ||
      0
    ) ===
      0;

  const noRequiredFailures =
    Number(
      evidence.required
        ?.failed ||
      0
    ) ===
      0;

  /*
   * PARTIALLY_RECOVERED is only valid when:
   *
   * - all required evidence was actually collected
   * - no required check failed
   * - at least one check passed
   * - some optional/non-critical signal still failed
   * - overall score still shows meaningful recovery
   *
   * Missing/inconclusive required evidence must remain INCONCLUSIVE.
   */
  if (
    requiredEvidenceComplete &&
    noRequiredFailures &&
    hasPassingChecks &&
    hasFailures &&
    score !==
      null &&
    score >=
      this.partialMinimumScore
  ) {
    decision =
      VERIFICATION_DECISION
        .PARTIALLY_RECOVERED;

    nextAction =
      VERIFICATION_NEXT_ACTION
        .CONTINUE_MONITORING;

    reasons.push(
      "Required recovery criteria passed, but optional verification signals still indicate incomplete recovery."
    );
  }
}
    // ========================================================================
    // 8. NO PASSING EVIDENCE
    // ========================================================================

    if (
      decision ===
        VERIFICATION_DECISION
          .INCONCLUSIVE &&
      Number(
        evidence.totals
          ?.failed ||
        0
      ) >
        0 &&
      Number(
        evidence.totals
          ?.passed ||
        0
      ) ===
        0
    ) {
      decision =
        VERIFICATION_DECISION
          .NOT_RECOVERED;

      nextAction =
        this.chooseFailureAction(
          input
        );

      reasons.push(
        "No verification dimension demonstrated successful recovery."
      );
    }

    // ========================================================================
    // 9. CONFIDENCE
    // ========================================================================

    const confidence =
      this.calculateConfidence({
        evidence,

        decision,
      });

    // ========================================================================
    // 10. BUILD RESULT
    // ========================================================================

    const result =
      createVerificationResult({
        verificationId:
          input.verificationId ||
          this.generateVerificationId(
            input
          ),

        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        incidentId:
          input.incidentId,

        executionRequestId:
          input.executionRequestId,

        authorizationId:
          input.authorizationId ||
          null,

        recoveryDecisionId:
          input.recoveryDecisionId ||
          null,

        planId:
          input.executionPlanId ||
          null,

        planHash:
          input.executionPlanHash ||
          null,

        decision,

        confidence,

        nextAction,

        checks:
          evidence.checks ||
          [],

        overallScore:
          this.getOverallScore(
            evidence
          ),

        reasons:
          uniqueStrings(
            reasons
          ),

        warnings:
          uniqueStrings([
            ...warnings,
            ...normalizeArray(
              evidence.warnings
            ),
          ]),

        startedAt:
          input.startedAt ||
          null,

        completedAt:
          new Date(),

        metadata: {
          decisionEngineVersion:
            DECISION_ENGINE_VERSION,

          verificationPlanId:
            evidence
              .verificationPlanId ||
            null,

          verificationPlanHash:
            evidence
              .verificationPlanHash ||
            null,

          completeness:
            evidence.completeness,

          requiredCoverage:
            evidence.requiredCoverage,

          requiredSuccessRate:
            evidence.requiredSuccessRate,

          hasConflicts:
            evidence.hasConflicts ===
            true,

          executionSuccess:
            input.executionResult
              ?.success ===
            true,
        },
      });

    assertVerificationResult(
      result
    );

    return result;
  }

  // ==========================================================================
  // FAILURE ACTION
  // ==========================================================================

  chooseFailureAction(
    input
  ) {
    const executionResult =
      input.executionResult ||
      {};

    if (
      executionResult
        .rollbackRequired ===
        true &&
      input.rollbackAvailable ===
        true
    ) {
      return VERIFICATION_NEXT_ACTION
        .ROLLBACK;
    }

    const attempt =
      Number(
        input.recoveryAttempt ||
        0
      );

    const maxAttempts =
      Number(
        input.maxRecoveryAttempts ||
        1
      );

    if (
      input.retryAllowed ===
        true &&
      attempt <
        maxAttempts
    ) {
      return VERIFICATION_NEXT_ACTION
        .RETRY_RECOVERY;
    }

    return VERIFICATION_NEXT_ACTION
      .ESCALATE;
  }

  // ==========================================================================
  // REGRESSION
  // ==========================================================================

  detectRegression(
    input
  ) {
    const reasons =
      [];

    const previous =
      input.previousVerificationResult;

    const evidence =
      input.evidencePackage;

    if (
      previous &&
      Number.isFinite(
        Number(
          previous.overallScore
        )
      ) &&
      Number.isFinite(
        Number(
          evidence.averageScore
        )
      )
    ) {
      const previousScore =
        Number(
          previous.overallScore
        );

      const currentScore =
        Number(
          evidence.averageScore
        );

      if (
        currentScore <
        previousScore -
          0.2
      ) {
        reasons.push(
          "Current post-execution recovery score materially regressed compared with prior verification."
        );
      }
    }

    const regressionConflict =
      normalizeArray(
        evidence.conflicts
      )
        .some(
          (
            conflict
          ) =>
            conflict.type ===
            "INFRASTRUCTURE_INCIDENT_CONFLICT"
        );

    if (
      regressionConflict &&
      Number(
        evidence.totals
          ?.failed ||
        0
      ) >
        Number(
          evidence.totals
            ?.passed ||
          0
        )
    ) {
      reasons.push(
        "System state shows post-execution regression despite partial infrastructure recovery."
      );
    }

    return {
      detected:
        reasons.length >
        0,

      reasons,
    };
  }

  // ==========================================================================
  // SCORE
  // ==========================================================================

  getOverallScore(
    evidence
  ) {
    if (
      Number.isFinite(
        Number(
          evidence.averageScore
        )
      )
    ) {
      return clamp01(
        Number(
          evidence.averageScore
        )
      );
    }

    const total =
      Number(
        evidence.totals
          ?.collected ||
        0
      );

    const passed =
      Number(
        evidence.totals
          ?.passed ||
        0
      );

    if (
      total <=
      0
    ) {
      return null;
    }

    return clamp01(
      passed /
      total
    );
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  calculateConfidence({
    evidence,
    decision,
  }) {
    if (
      evidence.hasConflicts ===
        true
    ) {
      return VERIFICATION_CONFIDENCE
        .LOW;
    }

    const completeness =
      Number(
        evidence.completeness ||
        0
      );

    const requiredCoverage =
      Number(
        evidence.requiredCoverage ||
        0
      );

    const requiredSuccessRate =
      Number(
        evidence.requiredSuccessRate ||
        0
      );

    if (
      decision ===
        VERIFICATION_DECISION
          .RECOVERED &&
      completeness >=
        this.highConfidenceCoverage &&
      requiredCoverage >=
        this.highConfidenceCoverage &&
      requiredSuccessRate ===
        1
    ) {
      return VERIFICATION_CONFIDENCE
        .HIGH;
    }

    if (
      decision ===
        VERIFICATION_DECISION
          .NOT_RECOVERED &&
      Number(
        evidence.required
          ?.failed ||
        0
      ) >
        0 &&
      requiredCoverage >=
        this.highConfidenceCoverage
    ) {
      return VERIFICATION_CONFIDENCE
        .HIGH;
    }

    if (
      completeness >=
        this.mediumConfidenceCoverage &&
      requiredCoverage >=
        this.mediumConfidenceCoverage
    ) {
      return VERIFICATION_CONFIDENCE
        .MEDIUM;
    }

    if (
      completeness >
        0 ||
      requiredCoverage >
        0
    ) {
      return VERIFICATION_CONFIDENCE
        .LOW;
    }

    return VERIFICATION_CONFIDENCE
      .UNKNOWN;
  }

  // ==========================================================================
  // ID
  // ==========================================================================

  generateVerificationId(
    input
  ) {
    return (
      "verification_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            input.organizationId,
            input.environmentId,
            input.incidentId,
            input.executionRequestId,
            Date.now(),
            crypto.randomUUID(),
          ]
            .join(
              ":"
            )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          24
        )
    );
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Verification decision input is required"
        ),
        {
          code:
            "VERIFICATION_DECISION_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.organizationId ||
      !input.environmentId ||
      !input.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Verification decision requires organization, environment and incident scope"
        ),
        {
          code:
            "VERIFICATION_DECISION_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.executionRequestId
    ) {
      throw Object.assign(
        new Error(
          "Verification decision requires executionRequestId"
        ),
        {
          code:
            "VERIFICATION_DECISION_EXECUTION_REQUEST_REQUIRED",
        }
      );
    }

    if (
      !input.evidencePackage ||
      typeof input.evidencePackage !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Verification decision requires recovery evidence package"
        ),
        {
          code:
            "VERIFICATION_DECISION_EVIDENCE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification decision engine cannot authorize execution"
        ),
        {
          code:
            "VERIFICATION_DECISION_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ==========================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
}

function clamp01(
  value
) {
  const numeric =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric
    )
  );
}

function finiteOrDefault(
  value,
  fallback
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return fallback;
  }

  const numeric =
    Number(
      value
    );

  return Number.isFinite(
    numeric
  )
    ? numeric
    : fallback;
}

// ============================================================================
// EXPORT
// ==========================================================================

module.exports =
  new VerificationDecisionEngine();

module.exports
  .VerificationDecisionEngine =
  VerificationDecisionEngine;

module.exports
  .DECISION_ENGINE_VERSION =
  DECISION_ENGINE_VERSION;