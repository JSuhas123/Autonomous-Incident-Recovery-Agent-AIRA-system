"use strict";

const verificationLifecycleOutboxHandoffService =
  require(
    "./verificationLifecycleOutboxHandoffService"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.11B
 * VERIFICATION -> LIFECYCLE OUTBOX INTEGRATION
 * ============================================================================
 *
 * Purpose:
 *
 * Convert VerificationWorker output into a durable lifecycle handoff.
 *
 * This service:
 *
 * - resolves verification identity
 * - resolves immutable verification-plan identity
 * - resolves the verification outcome
 * - persists durable lifecycle intent
 *
 * It does NOT:
 *
 * - close incidents
 * - start retry
 * - execute rollback
 * - authorize execution
 * - mutate infrastructure
 * ============================================================================
 */

class VerificationLifecycleOutboxIntegrationService {
  constructor(
    options = {}
  ) {
    this.handoff =
      options.handoff ||
      verificationLifecycleOutboxHandoffService;
  }

  // ==========================================================================
  // CREATE HANDOFF FROM VERIFICATION RESULT
  // ==========================================================================

  async createFromResult({
    job,
    result,
    dependencies = {},
  } = {}) {
    this.assertJob(
      job
    );

    if (
      !result ||
      typeof result !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Verification lifecycle outbox integration requires result"
        ),
        {
          code:
            "VERIFICATION_LIFECYCLE_OUTBOX_RESULT_REQUIRED",
        }
      );
    }

    const verificationResult =
      this.resolveVerificationResult(
        result
      );

    if (
      !verificationResult
    ) {
      return {
        handoffCreated:
          false,

        required:
          false,

        reason:
          "NO_VERIFICATION_RESULT",

        executionAuthorized:
          false,
      };
    }

    const executionRequestId =
      this.firstValue(
        verificationResult
          .executionRequestId,

        result
          .executionRequestId,

        job
          .executionRequestId
      );

    const verificationId =
      this.firstValue(
        verificationResult
          .verificationId,

        result
          .verificationId,

        result
          .verification
          ?.verificationId,

        job
          .verificationId
      );

    const verificationPlan =
      this.resolveVerificationPlan({
        job,
        result,
        verificationResult,
      });

    const verificationPlanId =
      this.firstValue(
        verificationResult
          .verificationPlanId,

        verificationResult
          .planId,

        result
          .verificationPlanId,

        verificationPlan
          ?.verificationPlanId,

        verificationPlan
          ?.planId,

        job
          .verificationPlanId
      );

    const verificationPlanHash =
      this.firstValue(
        verificationResult
          .verificationPlanHash,

        verificationResult
          .planHash,

        result
          .verificationPlanHash,

        verificationPlan
          ?.verificationPlanHash,

        verificationPlan
          ?.planHash,

        job
          .verificationPlanHash
      );

    const verificationOutcome =
      this.resolveVerificationOutcome({
        result,
        verificationResult,
      });

    this.assertVerificationIdentity({
      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      verificationOutcome,
    });

    const handoffResult =
      await this.handoff
        .createLifecycleRequested({
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          executionRequestId,

          verificationId,

          verificationPlanId,

          verificationPlanHash,

          verificationOutcome,

          correlationId:
            this.firstValue(
              verificationResult
                .correlationId,

              result
                .correlationId,

              job
                .correlationId,

              executionRequestId
            ),

          causationId:
            this.firstValue(
              verificationResult
                .causationId,

              verificationId
            ),

          metadata: {
            phase:
              "11.3.11",

            sourceWorker:
              "VerificationWorker",

            ...(dependencies
              .outboxMetadata ||
              {}),
          },
        });

    return {
      handoffCreated:
        true,

      required:
        true,

      persisted:
        handoffResult
          .persisted ===
        true,

      created:
        handoffResult
          .created ===
        true,

      duplicate:
        handoffResult
          .duplicate ===
        true,

      raced:
        handoffResult
          .raced ===
        true,

      eventId:
        handoffResult
          .eventId,

      eventKey:
        handoffResult
          .eventKey,

      executionRequestId,

      verificationId,

      verificationPlanId,

      verificationPlanHash,

      verificationOutcome,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // VERIFICATION RESULT RESOLUTION
  // ==========================================================================

  resolveVerificationResult(
    result
  ) {
    const candidates = [
      result.verification,

      result.verificationResult,

      result.result
        ?.verification,

      result.result
        ?.verificationResult,

      result.result,

      result,
    ];

    for (
      const candidate
      of candidates
    ) {
      if (
        candidate &&
        typeof candidate ===
          "object"
      ) {
        if (
          candidate
            .verificationId ||
          candidate
            .verificationPlanId ||
          candidate
            .outcome ||
          candidate
            .decision ||
          candidate
            .verificationDecision
        ) {
          return candidate;
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // VERIFICATION PLAN RESOLUTION
  // ==========================================================================

  resolveVerificationPlan({
    job,
    result,
    verificationResult,
  } = {}) {
    const candidates = [
      verificationResult
        ?.verificationPlan,

      verificationResult
        ?.plan,

      result
        ?.verificationPlan,

      result
        ?.plan,

      result
        ?.result
        ?.verificationPlan,

      job
        ?.verificationPlan,

      job
        ?.plan,
    ];

    for (
      const candidate
      of candidates
    ) {
      if (
        candidate &&
        typeof candidate ===
          "object"
      ) {
        return candidate;
      }
    }

    return null;
  }

  // ==========================================================================
  // OUTCOME RESOLUTION
  // ==========================================================================

  resolveVerificationOutcome({
    result,
    verificationResult,
  } = {}) {
    const candidates = [
      verificationResult
        ?.verificationOutcome,

      verificationResult
        ?.outcome,

      verificationResult
        ?.decision,

      verificationResult
        ?.verificationDecision,

      result
        ?.verificationOutcome,

      result
        ?.outcome,

      result
        ?.decision,

      result
        ?.verificationDecision,

      result
        ?.result
        ?.verificationOutcome,

      result
        ?.result
        ?.decision,
    ];

    for (
      const candidate
      of candidates
    ) {
      if (
        candidate !==
          undefined &&
        candidate !==
          null
      ) {
        /*
         * Preserve structured outcome objects exactly.
         */
        if (
          typeof candidate ===
            "object"
        ) {
          return candidate;
        }

        /*
         * Normalize simple string outcomes into a structured form.
         */
        if (
          typeof candidate ===
            "string" &&
          candidate.trim()
        ) {
          return {
            outcome:
              candidate.trim(),
          };
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertJob(
    job
  ) {
    if (
      !job ||
      typeof job !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Verification lifecycle outbox integration requires job"
        ),
        {
          code:
            "VERIFICATION_LIFECYCLE_OUTBOX_JOB_REQUIRED",
        }
      );
    }

    for (
      const field
      of [
        "organizationId",
        "environmentId",
        "incidentId",
      ]
    ) {
      if (
        !job[field]
      ) {
        throw Object.assign(
          new Error(
            `Verification lifecycle outbox integration requires ${field}`
          ),
          {
            code:
              "VERIFICATION_LIFECYCLE_OUTBOX_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    if (
      job.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Verification lifecycle outbox integration cannot receive execution authorization"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",
        }
      );
    }

    return true;
  }

  assertVerificationIdentity({
    executionRequestId,

    verificationId,

    verificationPlanId,
    verificationPlanHash,

    verificationOutcome,
  } = {}) {
    const required = {
      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      verificationOutcome,
    };

    for (
      const [
        field,
        value,
      ]
      of Object.entries(
        required
      )
    ) {
      if (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      ) {
        throw Object.assign(
          new Error(
            `Verification lifecycle outbox handoff requires ${field}`
          ),
          {
            code:
              "VERIFICATION_LIFECYCLE_OUTBOX_IDENTITY_REQUIRED",

            field,
          }
        );
      }
    }

    return true;
  }

  firstValue(
    ...values
  ) {
    for (
      const value
      of values
    ) {
      if (
        value !==
          undefined &&
        value !==
          null &&
        value !==
          ""
      ) {
        return value;
      }
    }

    return null;
  }
}

module.exports =
  new VerificationLifecycleOutboxIntegrationService();

module.exports
  .VerificationLifecycleOutboxIntegrationService =
  VerificationLifecycleOutboxIntegrationService;