"use strict";

/**
 * AIRA Closure Eligibility Guard
 *
 * Phase 10.3
 *
 * Determines whether an incident:
 *
 * - must remain open
 * - may enter stability observation
 * - is eligible for resolution/closure
 * - must be blocked from closure
 *
 * SAFETY:
 *
 * This service produces lifecycle eligibility only.
 * It does not mutate incidents or authorize execution.
 */

const {
  CLOSURE_DECISION,
  STABILITY_RESULT,
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "./incidentLifecycleContracts"
  );

class ClosureEligibilityGuard {
  evaluate(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const verification =
      input.verification;

    const critic =
      input.criticResult ||
      verification
        .criticResult ||
      {};

    const evidence =
      input.evidencePackage ||
      verification
        .evidencePackage ||
      {};

    const routing =
      input.routingResult ||
      verification
        .routingResult ||
      {};

    const stability =
      input.stabilityResult ||
      null;

    // ========================================================================
    // 1. VERIFICATION MUST EXPLICITLY CONFIRM RECOVERY
    // ========================================================================

    const verificationRecovered =
      verification.decision ===
        "RECOVERED" ||
      verification.recovered ===
        true;

    if (
      !verificationRecovered
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .NOT_ELIGIBLE,

        reason:
          "Recovery verification has not confirmed recovery.",

        nextState:
          null,
      });
    }

    // ========================================================================
    // 2. CRITIC MUST ACCEPT THE RECOVERY
    // ========================================================================

    if (
      critic.rejected ===
        true ||
      critic.accepted ===
        false
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          "Verification critic rejected the recovery decision.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .MANUAL_INTERVENTION,
      });
    }

    if (
      critic.requiresManualReview ===
      true
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          "Verification requires manual review.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .MANUAL_INTERVENTION,
      });
    }

    if (
      critic.recoveryConfirmed !==
      true
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .NOT_ELIGIBLE,

        reason:
          "Independent verification critic has not confirmed recovery.",

        nextState:
          null,
      });
    }

    // ========================================================================
    // 3. REQUIRED EVIDENCE MUST BE COMPLETE
    // ========================================================================

    const required =
      evidence.required ||
      {};

    if (
      Number(
        required.failed ||
        0
      ) >
      0
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          "Required recovery evidence contains failed checks.",

        nextState:
          null,
      });
    }

    if (
      Number(
        required.missing ||
        0
      ) >
        0 ||
      Number(
        required.inconclusive ||
        0
      ) >
        0
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .NOT_ELIGIBLE,

        reason:
          "Required recovery evidence is incomplete or inconclusive.",

        nextState:
          null,
      });
    }

    if (
      evidence.hasConflicts ===
      true
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          "Recovery evidence contains conflicting signals.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .MANUAL_INTERVENTION,
      });
    }

    // ========================================================================
    // 4. NO RETRY / ROLLBACK / ESCALATION MAY BE PENDING
    // ========================================================================

    const unsafeRoutes =
      new Set([
        "REQUEST_RETRY",
        "REQUEST_ROLLBACK",
        "ESCALATE",
        "MANUAL_INTERVENTION",
      ]);

    if (
      unsafeRoutes.has(
        routing.route
      )
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          `Lifecycle route ${routing.route} prevents incident closure.`,

        nextState:
          null,
      });
    }

    // ========================================================================
    // 5. NO STABILITY RESULT YET
    //
    // Recovery is confirmed, but closure still cannot happen immediately.
    // ========================================================================

    if (
      !stability
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .WAIT_FOR_STABILITY,

        reason:
          "Recovery is confirmed but stability observation is required before resolution.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .STABILITY_OBSERVATION,
      });
    }

    // ========================================================================
    // 6. STABILITY INCONCLUSIVE
    // ========================================================================

    if (
      stability.result ===
        STABILITY_RESULT
          .INCONCLUSIVE
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .WAIT_FOR_STABILITY,

        reason:
          "Stability observation is inconclusive.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .STABILITY_OBSERVATION,
      });
    }

    // ========================================================================
    // 7. STABILITY WINDOW NOT FINISHED
    // ========================================================================

    if (
      stability.completed ===
      false
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .WAIT_FOR_STABILITY,

        reason:
          "Stability observation window has not completed.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .STABILITY_OBSERVATION,
      });
    }

    // ========================================================================
    // 8. REGRESSION / UNSTABLE
    // ========================================================================

    if (
      stability.result ===
        STABILITY_RESULT
          .UNSTABLE
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .BLOCKED,

        reason:
          "Recovery regressed during the stability observation window.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .REGRESSED,
      });
    }

    // ========================================================================
    // 9. EXPIRED WINDOW WITHOUT PROOF OF STABILITY
    // ========================================================================

    if (
      stability.result ===
        STABILITY_RESULT
          .EXPIRED
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .NOT_ELIGIBLE,

        reason:
          "Stability observation expired without sufficient confirmation.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .MANUAL_INTERVENTION,
      });
    }

    // ========================================================================
    // 10. STABLE
    // ========================================================================

    if (
      stability.result ===
        STABILITY_RESULT
          .STABLE &&
      stability.completed ===
        true
    ) {
      return this.result({
        decision:
          CLOSURE_DECISION
            .ELIGIBLE,

        reason:
          "Recovery was independently verified and remained stable through the observation window.",

        nextState:
          INCIDENT_LIFECYCLE_STATE
            .RESOLVED,
      });
    }

    // ========================================================================
    // FAIL CLOSED
    // ========================================================================

    return this.result({
      decision:
        CLOSURE_DECISION
          .BLOCKED,

      reason:
        "Closure eligibility could not be established safely.",

      nextState:
        null,
    });
  }

  result({
    decision,
    reason,
    nextState,
  }) {
    return {
      decision,

      eligible:
        decision ===
        CLOSURE_DECISION
          .ELIGIBLE,

      waitForStability:
        decision ===
        CLOSURE_DECISION
          .WAIT_FOR_STABILITY,

      blocked:
        decision ===
        CLOSURE_DECISION
          .BLOCKED,

      reason,

      nextState,

      incidentClosed:
        false,

      executionAuthorized:
        false,

      evaluatedAt:
        new Date(),
    };
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Closure eligibility input is required"
        ),
        {
          code:
            "CLOSURE_ELIGIBILITY_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.verification ||
      typeof input.verification !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Closure eligibility requires verification"
        ),
        {
          code:
            "CLOSURE_ELIGIBILITY_VERIFICATION_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Closure eligibility guard cannot authorize execution"
        ),
        {
          code:
            "CLOSURE_ELIGIBILITY_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new ClosureEligibilityGuard();

module.exports
  .ClosureEligibilityGuard =
  ClosureEligibilityGuard;