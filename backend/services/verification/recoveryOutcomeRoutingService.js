"use strict";

/**
 * AIRA Recovery Outcome Routing Service
 *
 * Phase 9.10
 *
 * Converts:
 *
 * VerificationDecisionEngine
 *        ↓
 * VerificationDecisionCritic
 *        ↓
 * Recovery Outcome Route
 *
 * Possible routes:
 *
 * - CLOSE_INCIDENT
 * - CONTINUE_MONITORING
 * - REQUEST_RETRY
 * - REQUEST_ROLLBACK
 * - ESCALATE
 * - MANUAL_INTERVENTION
 * - COLLECT_MORE_EVIDENCE
 *
 * SAFETY:
 *
 * - does not execute rollback
 * - does not start retry
 * - does not close incident directly
 * - does not authorize infrastructure execution
 */

const {
  VERIFICATION_DECISION,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "./verificationContracts"
  );

const RECOVERY_ROUTE =
  Object.freeze({
    CLOSE_INCIDENT:
      "CLOSE_INCIDENT",

    CONTINUE_MONITORING:
      "CONTINUE_MONITORING",

    REQUEST_RETRY:
      "REQUEST_RETRY",

    REQUEST_ROLLBACK:
      "REQUEST_ROLLBACK",

    ESCALATE:
      "ESCALATE",

    MANUAL_INTERVENTION:
      "MANUAL_INTERVENTION",

    COLLECT_MORE_EVIDENCE:
      "COLLECT_MORE_EVIDENCE",

    BLOCKED:
      "BLOCKED",
  });

const RECOVERY_ROUTE_STATUS =
  Object.freeze({
    READY:
      "READY",

    BLOCKED:
      "BLOCKED",

    REQUIRES_OPERATOR:
      "REQUIRES_OPERATOR",
  });

class RecoveryOutcomeRoutingService {
  route(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const {
      decisionResult,
      criticResult,
    } =
      input;

    const reasons =
      [];

    const warnings =
      [];

    // ========================================================================
    // 1. CRITIC REJECTION OVERRIDES EVERYTHING
    // ========================================================================

    if (
      criticResult
        .rejected ===
      true
    ) {
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .BLOCKED,

        status:
          RECOVERY_ROUTE_STATUS
            .BLOCKED,

        reasons: [
          "Verification decision was rejected by independent critic.",
          ...(
            criticResult
              .violations ||
            []
          ),
        ],

        warnings:
          criticResult
            .warnings ||
          [],
      });
    }

    // ========================================================================
    // 2. CRITIC MANUAL REVIEW
    // ========================================================================

    if (
      criticResult
        .requiresManualReview ===
      true
    ) {
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .MANUAL_INTERVENTION,

        status:
          RECOVERY_ROUTE_STATUS
            .REQUIRES_OPERATOR,

        reasons: [
          "Verification critic requires manual review.",
        ],

        warnings:
          criticResult
            .warnings ||
          [],
      });
    }

    // ========================================================================
    // 3. RECOVERED
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .RECOVERED
    ) {
      if (
        criticResult
          .recoveryConfirmed !==
        true
      ) {
        return this.buildResult({
          route:
            RECOVERY_ROUTE
              .BLOCKED,

          status:
            RECOVERY_ROUTE_STATUS
              .BLOCKED,

          reasons: [
            "Recovery was not independently confirmed.",
          ],
        });
      }

      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .CLOSE_INCIDENT,

        status:
          RECOVERY_ROUTE_STATUS
            .READY,

        reasons: [
          "Recovery was verified and independently confirmed.",
        ],
      });
    }

    // ========================================================================
    // 4. PARTIAL RECOVERY
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .PARTIALLY_RECOVERED
    ) {
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .CONTINUE_MONITORING,

        status:
          RECOVERY_ROUTE_STATUS
            .READY,

        reasons: [
          "System shows partial recovery and should remain under observation.",
        ],
      });
    }

    // ========================================================================
    // 5. REGRESSED
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .REGRESSED
    ) {
      if (
        input.rollbackAvailable !==
        true
      ) {
        return this.buildResult({
          route:
            RECOVERY_ROUTE
              .ESCALATE,

          status:
            RECOVERY_ROUTE_STATUS
              .REQUIRES_OPERATOR,

          reasons: [
            "Verification detected regression but no rollback path is available.",
          ],
        });
      }

      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .REQUEST_ROLLBACK,

        status:
          RECOVERY_ROUTE_STATUS
            .READY,

        reasons: [
          "Verification detected regression and predefined rollback is available.",
        ],
      });
    }

    // ========================================================================
    // 6. NOT RECOVERED
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .NOT_RECOVERED
    ) {
      const preferred =
        decisionResult
          .nextAction;

      if (
        preferred ===
          VERIFICATION_NEXT_ACTION
            .ROLLBACK &&
        input.rollbackAvailable ===
          true
      ) {
        return this.buildResult({
          route:
            RECOVERY_ROUTE
              .REQUEST_ROLLBACK,

          status:
            RECOVERY_ROUTE_STATUS
              .READY,

          reasons: [
            "Recovery verification failed and rollback was recommended.",
          ],
        });
      }

      if (
        preferred ===
          VERIFICATION_NEXT_ACTION
            .RETRY_RECOVERY
      ) {
        if (
          this.canRetry(
            input
          )
        ) {
          return this.buildResult({
            route:
              RECOVERY_ROUTE
                .REQUEST_RETRY,

            status:
              RECOVERY_ROUTE_STATUS
                .READY,

            reasons: [
              "Recovery verification failed and another recovery attempt is permitted.",
            ],
          });
        }

        return this.buildResult({
          route:
            RECOVERY_ROUTE
              .ESCALATE,

          status:
            RECOVERY_ROUTE_STATUS
              .REQUIRES_OPERATOR,

          reasons: [
            "Recovery retry was requested but retry limits or policy prevent another attempt.",
          ],
        });
      }

      if (
        preferred ===
          VERIFICATION_NEXT_ACTION
            .ESCALATE
      ) {
        return this.buildResult({
          route:
            RECOVERY_ROUTE
              .ESCALATE,

          status:
            RECOVERY_ROUTE_STATUS
              .REQUIRES_OPERATOR,

          reasons: [
            "Recovery verification failed and escalation was recommended.",
          ],
        });
      }

      // Conservative fallback.
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .ESCALATE,

        status:
          RECOVERY_ROUTE_STATUS
            .REQUIRES_OPERATOR,

        reasons: [
          "Recovery was not verified and no safe automated continuation was selected.",
        ],
      });
    }

    // ========================================================================
    // 7. INCONCLUSIVE
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .INCONCLUSIVE
    ) {
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .COLLECT_MORE_EVIDENCE,

        status:
          RECOVERY_ROUTE_STATUS
            .READY,

        reasons: [
          "Verification evidence is incomplete or inconclusive.",
        ],
      });
    }

    // ========================================================================
    // 8. MANUAL REVIEW
    // ========================================================================

    if (
      decisionResult
        .decision ===
        VERIFICATION_DECISION
          .MANUAL_REVIEW
    ) {
      return this.buildResult({
        route:
          RECOVERY_ROUTE
            .MANUAL_INTERVENTION,

        status:
          RECOVERY_ROUTE_STATUS
            .REQUIRES_OPERATOR,

        reasons: [
          "Recovery evidence requires manual operator review.",
        ],
      });
    }

    // ========================================================================
    // UNKNOWN FALLBACK
    // ========================================================================

    reasons.push(
      `Unsupported verification decision: ${decisionResult.decision}`
    );

    warnings.push(
      "Recovery outcome routing defaulted to BLOCKED."
    );

    return this.buildResult({
      route:
        RECOVERY_ROUTE
          .BLOCKED,

      status:
        RECOVERY_ROUTE_STATUS
          .BLOCKED,

      reasons,

      warnings,
    });
  }

  // ==========================================================================
  // RETRY
  // ==========================================================================

  canRetry(
    input
  ) {
    if (
      input.retryAllowed !==
      true
    ) {
      return false;
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
      !Number.isFinite(
        attempt
      ) ||
      !Number.isFinite(
        maxAttempts
      )
    ) {
      return false;
    }

    if (
      attempt >=
      maxAttempts
    ) {
      return false;
    }

    if (
      input.retryBlocked ===
      true
    ) {
      return false;
    }

    return true;
  }

  // ==========================================================================
  // RESULT
  // ==========================================================================

  buildResult({
    route,
    status,
    reasons = [],
    warnings = [],
  }) {
    return {
      route,

      status,

      ready:
        status ===
        RECOVERY_ROUTE_STATUS
          .READY,

      blocked:
        status ===
        RECOVERY_ROUTE_STATUS
          .BLOCKED,

      requiresOperator:
        status ===
        RECOVERY_ROUTE_STATUS
          .REQUIRES_OPERATOR,

      reasons:
        uniqueStrings(
          reasons
        ),

      warnings:
        uniqueStrings(
          warnings
        ),

      /*
       * These flags are intentionally false.
       *
       * Later queue/orchestrator layers may consume the route,
       * but this service itself performs no operational mutation.
       */
      incidentClosed:
        false,

      retryStarted:
        false,

      rollbackStarted:
        false,

      executionAuthorized:
        false,

      routedAt:
        new Date(),

      routingVersion:
        "phase9.10-v1",
    };
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
          "Recovery outcome routing input is required"
        ),
        {
          code:
            "RECOVERY_OUTCOME_ROUTING_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.decisionResult
    ) {
      throw Object.assign(
        new Error(
          "Recovery outcome routing requires verification decision"
        ),
        {
          code:
            "RECOVERY_OUTCOME_DECISION_REQUIRED",
        }
      );
    }

    if (
      !input.criticResult
    ) {
      throw Object.assign(
        new Error(
          "Recovery outcome routing requires verification critic result"
        ),
        {
          code:
            "RECOVERY_OUTCOME_CRITIC_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery outcome routing cannot authorize execution"
        ),
        {
          code:
            "RECOVERY_OUTCOME_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// HELPERS
// ==========================================================================

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
  new RecoveryOutcomeRoutingService();

module.exports
  .RecoveryOutcomeRoutingService =
  RecoveryOutcomeRoutingService;

module.exports
  .RECOVERY_ROUTE =
  RECOVERY_ROUTE;

module.exports
  .RECOVERY_ROUTE_STATUS =
  RECOVERY_ROUTE_STATUS;