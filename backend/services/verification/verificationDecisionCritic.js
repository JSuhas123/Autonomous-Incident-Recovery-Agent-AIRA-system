"use strict";

/**
 * AIRA Verification Decision Critic
 *
 * Phase 9.9
 *
 * Independently validates VerificationDecisionEngine output.
 *
 * Safety goals:
 *
 * - RECOVERED must be strongly supported
 * - required evidence must be complete
 * - no failed required checks
 * - no unresolved conflicts
 * - confidence must match evidence quality
 * - plan / execution identity must remain consistent
 *
 * DOES NOT:
 *
 * - close incidents
 * - retry recovery
 * - execute rollback
 * - authorize execution
 */

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "./verificationContracts"
  );

const VERIFICATION_CRITIC_DECISION =
  Object.freeze({
    ACCEPT:
      "ACCEPT",

    REJECT:
      "REJECT",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",
  });

const VERIFICATION_CRITIC_VERSION =
  "phase9.9-v1";

class VerificationDecisionCritic {
  constructor(
    options = {}
  ) {
    this.minimumRecoveredCompleteness =
      finiteOrDefault(
        options.minimumRecoveredCompleteness,
        0.9
      );

    this.minimumRecoveredCoverage =
      finiteOrDefault(
        options.minimumRecoveredCoverage,
        0.9
      );
  }

  review(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const {
      decisionResult,
      evidencePackage,
    } =
      input;

    const violations =
      [];

    const warnings =
      [];

    // ========================================================================
    // 1. BASIC SAFETY
    // ========================================================================

    if (
      decisionResult
        .executionAuthorized ===
      true
    ) {
      violations.push(
        "Verification decision must never authorize execution."
      );
    }

    // ========================================================================
    // 2. SCOPE CONSISTENCY
    // ========================================================================

    this.checkField(
      "organizationId",
      decisionResult,
      evidencePackage,
      violations
    );

    this.checkField(
      "environmentId",
      decisionResult,
      evidencePackage,
      violations
    );

    this.checkField(
      "incidentId",
      decisionResult,
      evidencePackage,
      violations
    );

    this.checkField(
      "executionRequestId",
      decisionResult,
      evidencePackage,
      violations
    );

    // ========================================================================
    // 3. RECOVERED INVARIANTS
    // ========================================================================

    if (
      decisionResult.decision ===
      VERIFICATION_DECISION
        .RECOVERED
    ) {
      if (
        evidencePackage
          .required
          ?.failed >
        0
      ) {
        violations.push(
          "RECOVERED decision contains failed required checks."
        );
      }

      if (
        evidencePackage
          .required
          ?.missing >
        0
      ) {
        violations.push(
          "RECOVERED decision contains missing required checks."
        );
      }

      if (
        evidencePackage
          .required
          ?.inconclusive >
        0
      ) {
        violations.push(
          "RECOVERED decision contains inconclusive required checks."
        );
      }

      if (
        evidencePackage
          .requiredSuccessRate !==
        1
      ) {
        violations.push(
          "RECOVERED decision does not have full required-check success."
        );
      }

      if (
        evidencePackage
          .completeness <
        this
          .minimumRecoveredCompleteness
      ) {
        violations.push(
          "RECOVERED decision has insufficient evidence completeness."
        );
      }

      if (
        evidencePackage
          .requiredCoverage <
        this
          .minimumRecoveredCoverage
      ) {
        violations.push(
          "RECOVERED decision has insufficient required-check coverage."
        );
      }

      if (
        evidencePackage
          .hasConflicts ===
        true
      ) {
        violations.push(
          "RECOVERED decision contains conflicting verification signals."
        );
      }

      if (
        decisionResult
          .confidence !==
        VERIFICATION_CONFIDENCE
          .HIGH
      ) {
        violations.push(
          "RECOVERED decision must have HIGH verification confidence."
        );
      }

      if (
        decisionResult
          .nextAction !==
        VERIFICATION_NEXT_ACTION
          .CLOSE_INCIDENT
      ) {
        violations.push(
          "RECOVERED decision must recommend CLOSE_INCIDENT."
        );
      }
    }

   // ========================================================================
// 4. NOT RECOVERED CONSISTENCY
// ========================================================================

if (
  decisionResult.decision ===
  VERIFICATION_DECISION
    .NOT_RECOVERED
) {
  const evidenceShowsFailure =
    Number(
      evidencePackage
        .required
        ?.failed ||
      0
    ) >
      0 ||
    Number(
      evidencePackage
        .totals
        ?.failed ||
      0
    ) >
      0;

  /*
   * An execution that itself failed is sufficient reason for
   * NOT_RECOVERED even when post-execution telemetry happens
   * to appear healthy.
   *
   * Example:
   *
   * step 1 changed infrastructure
   * step 2 failed
   * rollbackRequired = true
   *
   * We must not reinterpret that state as successful recovery
   * merely because health/metrics probes currently pass.
   */
  const executionFailed =
    decisionResult
      ?.metadata
      ?.executionSuccess ===
    false;

  if (
    !evidenceShowsFailure &&
    !executionFailed
  ) {
    warnings.push(
      "NOT_RECOVERED decision has no explicit failed verification checks or failed execution evidence."
    );
  }

  /*
   * Failed execution requiring rollback should remain a
   * deterministic machine-action route, not manual review.
   */
  if (
    executionFailed &&
    decisionResult.nextAction ===
      VERIFICATION_NEXT_ACTION
        .ROLLBACK
  ) {
    // Valid NOT_RECOVERED outcome.
    // No warning is generated.
  }
}
    // ========================================================================
    // 5. PARTIAL RECOVERY CONSISTENCY
    // ========================================================================

    if (
      decisionResult.decision ===
      VERIFICATION_DECISION
        .PARTIALLY_RECOVERED
    ) {
      if (
        Number(
          evidencePackage
            .required
            ?.failed ||
          0
        ) >
        0
      ) {
        violations.push(
          "PARTIALLY_RECOVERED cannot contain failed required checks."
        );
      }

      if (
        Number(
          evidencePackage
            .required
            ?.missing ||
          0
        ) >
          0 ||
        Number(
          evidencePackage
            .required
            ?.inconclusive ||
          0
        ) >
          0
      ) {
        violations.push(
          "PARTIALLY_RECOVERED requires complete conclusive required evidence."
        );
      }

      if (
        Number(
          evidencePackage
            .totals
            ?.passed ||
          0
        ) ===
          0 ||
        Number(
          evidencePackage
            .totals
            ?.failed ||
          0
        ) ===
          0
      ) {
        violations.push(
          "PARTIALLY_RECOVERED requires both passing and failing signals."
        );
      }
    }

    // ========================================================================
    // 6. INCONCLUSIVE CONSISTENCY
    // ========================================================================

    if (
      decisionResult.decision ===
      VERIFICATION_DECISION
        .INCONCLUSIVE
    ) {
      const incomplete =
        Number(
          evidencePackage
            .required
            ?.missing ||
          0
        ) >
          0 ||
        Number(
          evidencePackage
            .required
            ?.inconclusive ||
          0
        ) >
          0 ||
        evidencePackage
          .complete !==
          true;

      if (
        !incomplete
      ) {
        warnings.push(
          "INCONCLUSIVE decision was produced despite complete verification evidence."
        );
      }
    }

    // ========================================================================
    // 7. MANUAL REVIEW
    // ========================================================================

    if (
      decisionResult.decision ===
      VERIFICATION_DECISION
        .MANUAL_REVIEW
    ) {
      if (
        evidencePackage
          .hasConflicts !==
          true
      ) {
        warnings.push(
          "MANUAL_REVIEW decision has no explicit evidence conflict."
        );
      }

      if (
        decisionResult
          .nextAction !==
        VERIFICATION_NEXT_ACTION
          .MANUAL_INTERVENTION
      ) {
        violations.push(
          "MANUAL_REVIEW must recommend MANUAL_INTERVENTION."
        );
      }
    }

    // ========================================================================
    // 8. REGRESSED
    // ========================================================================

    if (
      decisionResult.decision ===
      VERIFICATION_DECISION
        .REGRESSED
    ) {
      if (
        decisionResult
          .nextAction !==
        VERIFICATION_NEXT_ACTION
          .ROLLBACK
      ) {
        violations.push(
          "REGRESSED verification must recommend ROLLBACK."
        );
      }
    }

    // ========================================================================
    // 9. SCORE CONSISTENCY
    // ========================================================================

    if (
      Number.isFinite(
        Number(
          decisionResult
            .overallScore
        )
      ) &&
      Number.isFinite(
        Number(
          evidencePackage
            .averageScore
        )
      )
    ) {
      const difference =
        Math.abs(
          Number(
            decisionResult
              .overallScore
          ) -
          Number(
            evidencePackage
              .averageScore
          )
        );

      if (
        difference >
        0.0001
      ) {
        violations.push(
          "Verification decision score does not match aggregated evidence score."
        );
      }
    }

    // ========================================================================
    // 10. PLAN IDENTITY
    // ========================================================================

    const expectedPlanId =
      evidencePackage
        .verificationPlanId ||
      null;

    const decisionPlanId =
      decisionResult
        ?.metadata
        ?.verificationPlanId ||
      null;

    if (
      expectedPlanId &&
      decisionPlanId &&
      String(
        expectedPlanId
      ) !==
      String(
        decisionPlanId
      )
    ) {
      violations.push(
        "Verification decision references a different verification plan."
      );
    }

    const expectedPlanHash =
      evidencePackage
        .verificationPlanHash ||
      null;

    const decisionPlanHash =
      decisionResult
        ?.metadata
        ?.verificationPlanHash ||
      null;

    if (
      expectedPlanHash &&
      decisionPlanHash &&
      String(
        expectedPlanHash
      ) !==
      String(
        decisionPlanHash
      )
    ) {
      violations.push(
        "Verification decision references a different verification plan hash."
      );
    }

    // ========================================================================
    // FINAL
    // ========================================================================

    let criticDecision =
      VERIFICATION_CRITIC_DECISION
        .ACCEPT;

    if (
      violations.length >
      0
    ) {
      criticDecision =
        VERIFICATION_CRITIC_DECISION
          .REJECT;
    } else if (
      warnings.length >
      0
    ) {
      criticDecision =
        VERIFICATION_CRITIC_DECISION
          .MANUAL_REVIEW;
    }

    return {
      criticDecision,

      accepted:
        criticDecision ===
        VERIFICATION_CRITIC_DECISION
          .ACCEPT,

      rejected:
        criticDecision ===
        VERIFICATION_CRITIC_DECISION
          .REJECT,

      requiresManualReview:
        criticDecision ===
        VERIFICATION_CRITIC_DECISION
          .MANUAL_REVIEW,

      verificationId:
        decisionResult
          .verificationId ||
        null,

      recoveryConfirmed:
        decisionResult
          .decision ===
          VERIFICATION_DECISION
            .RECOVERED &&
        criticDecision ===
          VERIFICATION_CRITIC_DECISION
            .ACCEPT,

      violations:
        uniqueStrings(
          violations
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      reviewedAt:
        new Date(),

      executionAuthorized:
        false,

      criticVersion:
        VERIFICATION_CRITIC_VERSION,
    };
  }

  checkField(
    field,
    decisionResult,
    evidencePackage,
    violations
  ) {
    if (
      decisionResult[
        field
      ] &&
      evidencePackage[
        field
      ] &&
      String(
        decisionResult[
          field
        ]
      ) !==
      String(
        evidencePackage[
          field
        ]
      )
    ) {
      violations.push(
        `Verification ${field} does not match recovery evidence scope.`
      );
    }
  }

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
          "Verification critic input is required"
        ),
        {
          code:
            "VERIFICATION_CRITIC_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.decisionResult
    ) {
      throw Object.assign(
        new Error(
          "Verification critic requires verification decision result"
        ),
        {
          code:
            "VERIFICATION_CRITIC_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.evidencePackage
    ) {
      throw Object.assign(
        new Error(
          "Verification critic requires recovery evidence package"
        ),
        {
          code:
            "VERIFICATION_CRITIC_EVIDENCE_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification critic cannot authorize execution"
        ),
        {
          code:
            "VERIFICATION_CRITIC_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ==========================================================================

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

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
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

// ============================================================================
// EXPORT
// ==========================================================================

module.exports =
  new VerificationDecisionCritic();

module.exports
  .VerificationDecisionCritic =
  VerificationDecisionCritic;

module.exports
  .VERIFICATION_CRITIC_DECISION =
  VERIFICATION_CRITIC_DECISION;

module.exports
  .VERIFICATION_CRITIC_VERSION =
  VERIFICATION_CRITIC_VERSION;