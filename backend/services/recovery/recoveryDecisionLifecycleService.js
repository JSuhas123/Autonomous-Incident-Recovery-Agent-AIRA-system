"use strict";

/**
 * AIRA Recovery Decision Lifecycle Service
 *
 * Phase 7.12 + 7.14
 *
 * Orchestrates:
 *
 * RecoveryDecisionEngine
 *        ↓
 * RecoveryDecisionCritic
 *        ↓
 * RecoveryFallbackService
 *        ↓
 * RecoveryDecisionPersistenceService
 *
 * SAFETY:
 *
 * - does not execute playbooks
 * - does not approve execution
 * - does not bypass policy
 * - converts degraded/unsafe recovery states into explicit safe fallbacks
 * - always returns executionAuthorized: false
 */

const recoveryDecisionEngine =
  require(
    "./recoveryDecisionEngine"
  );

const recoveryDecisionCritic =
  require(
    "./recoveryDecisionCritic"
  );

const recoveryFallbackService =
  require(
    "./recoveryFallbackService"
  );

const recoveryDecisionPersistenceService =
  require(
    "./recoveryDecisionPersistenceService"
  );

class RecoveryDecisionLifecycleService {
  constructor(
    options = {}
  ) {
    this.engine =
      options.engine ||
      recoveryDecisionEngine;

    this.critic =
      options.critic ||
      recoveryDecisionCritic;

    this.fallback =
      options.fallback ||
      recoveryFallbackService;

    this.persistence =
      options.persistence ||
      recoveryDecisionPersistenceService;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async run(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    let engineResult;
    let criticResult;

    // ========================================================================
    // 1. RECOVERY DECISION ENGINE
    // ========================================================================

    try {
      engineResult =
        await this.engine
          .decide(
            {
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              incidentId:
                input.incidentId,

              diagnosisId:
                input.diagnosisId,

              diagnosisRevision:
                input.diagnosisRevision,

              diagnosis:
                input.diagnosis,

              safetyGate:
                input.safetyGate,

              context:
                input.context,

              executionAuthorized:
                false,
            },

            dependencies
          );
    } catch (
      error
    ) {
      // ----------------------------------------------------------------------
      // DIAGNOSIS NOT READY FOR RECOVERY
      // ----------------------------------------------------------------------

      if (
        [
          "RECOVERY_DECISION_DIAGNOSIS_NOT_ELIGIBLE",
          "RECOVERY_DECISION_NEXT_STEP_INVALID",
        ].includes(
          error.code
        )
      ) {
        engineResult =
          this.fallback
            .resolve({
              reason:
                "DIAGNOSIS_INSUFFICIENT",

              incidentId:
                input.incidentId,

              diagnosisId:
                input.diagnosisId,

              diagnosisRevision:
                input.diagnosisRevision,

              diagnosis:
                input.diagnosis,

              context:
                input.context,

              error,
            });
      } else {
        // --------------------------------------------------------------------
        // RECOVERY SUBSYSTEM DEGRADED
        // --------------------------------------------------------------------

        engineResult =
          this.fallback
            .resolve({
              reason:
                "RECOVERY_SYSTEM_DEGRADED",

              incidentId:
                input.incidentId,

              diagnosisId:
                input.diagnosisId,

              diagnosisRevision:
                input.diagnosisRevision,

              diagnosis:
                input.diagnosis,

              context:
                input.context,

              error,
            });
      }
    }

    // ========================================================================
    // 2. RECOVERY CRITIC
    // ========================================================================

    try {
      if (
        typeof this.critic
          .review ===
        "function"
      ) {
        criticResult =
          await this.critic
            .review(
              engineResult,

              dependencies
                .criticContext ||
              {}
            );
      } else if (
        typeof this.critic
          .validate ===
        "function"
      ) {
        criticResult =
          await this.critic
            .validate(
              engineResult,

              dependencies
                .criticContext ||
              {}
            );
      } else {
        throw Object.assign(
          new Error(
            "Recovery critic does not expose review() or validate()"
          ),
          {
            code:
              "RECOVERY_CRITIC_INVALID",
          }
        );
      }
    } catch (
      error
    ) {
      /*
       * Critic infrastructure itself failed.
       *
       * Do not trust the original decision.
       * Downgrade to manual intervention.
       */

      criticResult = {
        criticDecision:
          "REJECT",

        accepted:
          false,

        requiresManualReview:
          true,

        rejected:
          true,

        violations: [
          error.message ||
          "Recovery critic failed.",
        ],

        warnings:
          [],

        reviewedDecision:
          engineResult
            ?.decision
            ?.decision ||
          null,

        selectedCandidateId:
          engineResult
            ?.selectedCandidate
            ?.candidateId ||
          null,

        selectedPlaybookId:
          engineResult
            ?.selectedCandidate
            ?.playbookId ||
          null,

        criticVersion:
          "critic-failure-fallback",

        executionAuthorized:
          false,
      };

      engineResult =
        this.fallback
          .resolve({
            reason:
              "RECOVERY_SYSTEM_DEGRADED",

            incidentId:
              input.incidentId,

            diagnosisId:
              input.diagnosisId,

            diagnosisRevision:
              input.diagnosisRevision,

            diagnosis:
              input.diagnosis,

            context:
              input.context,

            candidates:
              engineResult
                ?.candidates ||
              [],

            criticResult,

            error,
          });
    }

    // ========================================================================
    // 3. CRITIC REJECTION FALLBACK
    // ========================================================================

    if (
      criticResult
        ?.rejected ===
      true
    ) {
      engineResult =
        this.fallback
          .resolve({
            reason:
              "CRITIC_REJECTED",

            incidentId:
              input.incidentId,

            diagnosisId:
              input.diagnosisId,

            diagnosisRevision:
              input.diagnosisRevision,

            diagnosis:
              input.diagnosis,

            context:
              input.context,

            candidates:
              engineResult
                ?.candidates ||
              [],

            criticResult,
          });
    }

    // ========================================================================
    // 4. CRITIC MANUAL REVIEW FALLBACK
    // ========================================================================

    else if (
      criticResult
        ?.requiresManualReview ===
      true
    ) {
      engineResult =
        this.fallback
          .resolve({
            reason:
              "CRITIC_MANUAL_REVIEW",

            incidentId:
              input.incidentId,

            diagnosisId:
              input.diagnosisId,

            diagnosisRevision:
              input.diagnosisRevision,

            diagnosis:
              input.diagnosis,

            context:
              input.context,

            candidates:
              engineResult
                ?.candidates ||
              [],

            criticResult,
          });
    }

    // ========================================================================
    // 5. ABSOLUTE EXECUTION SAFETY CHECK
    // ========================================================================

    this.assertSafeResult(
      engineResult,
      criticResult
    );

    // ========================================================================
    // 6. PERSIST FINAL DECISION
    // ========================================================================

    const persisted =
      await this.persistence
        .persist({
          engineResult,

          criticResult,

          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          diagnosisId:
            input.diagnosisId ||
            input.diagnosis
              ?.diagnosisId ||
            null,

          diagnosisRevision:
            input.diagnosisRevision ??
            input.diagnosis
              ?.revision ??
            null,
        });

    // ========================================================================
    // 7. RETURN
    // ========================================================================

    return {
      engineResult,

      criticResult,

      persisted,

      decision:
        persisted
          ?.decision ||
        engineResult
          ?.decision ||
        null,

      fallback:
        Boolean(
          engineResult
            ?.fallback
        ),

      fallbackReason:
        engineResult
          ?.fallbackReason ||
        null,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // FINAL SAFETY CHECK
  // ==========================================================================

  assertSafeResult(
    engineResult,
    criticResult
  ) {
    if (
      engineResult
        ?.executionAuthorized ===
        true ||
      engineResult
        ?.decision
        ?.executionAuthorized ===
        true ||
      engineResult
        ?.selectedCandidate
        ?.executionAuthorized ===
        true ||
      criticResult
        ?.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Recovery lifecycle produced unsafe execution authorization"
        ),
        {
          code:
            "RECOVERY_LIFECYCLE_UNSAFE_RESULT",
        }
      );
    }
  }

  // ==========================================================================
  // INPUT VALIDATION
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
          "Recovery lifecycle input is required"
        ),
        {
          code:
            "RECOVERY_LIFECYCLE_INPUT_REQUIRED",
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
          "Recovery lifecycle requires organization, environment and incident scope"
        ),
        {
          code:
            "RECOVERY_LIFECYCLE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !input.diagnosis
    ) {
      throw Object.assign(
        new Error(
          "Recovery lifecycle requires diagnosis"
        ),
        {
          code:
            "RECOVERY_LIFECYCLE_DIAGNOSIS_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Recovery lifecycle cannot receive execution authorization"
        ),
        {
          code:
            "RECOVERY_LIFECYCLE_UNSAFE_INPUT",
        }
      );
    }
  }
}

// ============================================================================
// EXPORT
// ============================================================================

const recoveryDecisionLifecycleService =
  new RecoveryDecisionLifecycleService();

module.exports =
  recoveryDecisionLifecycleService;

module.exports
  .RecoveryDecisionLifecycleService =
  RecoveryDecisionLifecycleService;