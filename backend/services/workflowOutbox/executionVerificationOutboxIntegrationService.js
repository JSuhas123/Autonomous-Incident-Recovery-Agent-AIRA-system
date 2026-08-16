"use strict";

const executionVerificationOutboxHandoffService =
  require(
    "./executionVerificationOutboxHandoffService"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.10B
 * EXECUTION -> VERIFICATION OUTBOX INTEGRATION
 * ============================================================================
 *
 * Purpose:
 *
 * Convert ExecutionWorker output into a durable VERIFICATION_REQUESTED
 * workflow handoff without granting any new execution authority.
 *
 * This service supports several possible execution result shapes so the
 * worker does not duplicate field-resolution logic.
 * ============================================================================
 */

class ExecutionVerificationOutboxIntegrationService {
  constructor(
    options = {}
  ) {
    this.handoff =
      options.handoff ||
      executionVerificationOutboxHandoffService;
  }

  // ==========================================================================
  // CREATE HANDOFF FROM EXECUTION RESULT
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
          "Execution verification outbox integration requires result"
        ),
        {
          code:
            "EXECUTION_VERIFICATION_OUTBOX_RESULT_REQUIRED",
        }
      );
    }

    const executionResult =
      this.resolveExecutionResult(
        result
      );

    if (
      !executionResult
    ) {
      return {
        handoffCreated:
          false,

        required:
          false,

        reason:
          "NO_EXECUTION_RESULT",

        executionAuthorized:
          false,
      };
    }

    /*
     * Only a completed execution should produce verification work.
     *
     * If your execution worker uses another success flag, this resolver
     * supports several common shapes.
     */
    const executionSucceeded =
      this.resolveExecutionSuccess({
        result,
        executionResult,
      });

    if (
      executionSucceeded !==
      true
    ) {
      return {
        handoffCreated:
          false,

        required:
          false,

        reason:
          "EXECUTION_NOT_SUCCESSFUL",

        executionAuthorized:
          false,
      };
    }

    const executionPlan =
      this.resolveExecutionPlan({
        job,
        result,
        executionResult,
      });

    const executionRequestId =
      this.firstValue(
        executionResult
          .executionRequestId,

        result
          .executionRequestId,

        job
          .executionRequestId,

        job
          .requestId
      );

    const executionPlanId =
      this.firstValue(
        executionResult
          .executionPlanId,

        executionResult
          .planId,

        result
          .executionPlanId,

        executionPlan
          ?.executionPlanId,

        executionPlan
          ?.planId,

        job
          .executionPlanId
      );

    const executionPlanHash =
      this.firstValue(
        executionResult
          .executionPlanHash,

        executionResult
          .planHash,

        result
          .executionPlanHash,

        executionPlan
          ?.executionPlanHash,

        executionPlan
          ?.planHash,

        job
          .executionPlanHash
      );

    /*
     * Verification identity may already be created by execution lifecycle
     * logic or may be returned as part of the execution result.
     *
     * This service does not invent an arbitrary verification ID silently.
     */
    const verificationRequestId =
  this.firstValue(
    executionResult
      .verificationRequestId,

    executionResult
      .verificationId,

    result
      .verificationRequestId,

    result
      .verificationId,

    result
      .verification
      ?.verificationRequestId,

    result
      .verification
      ?.verificationId,

    result
      .verificationRequest
      ?.verificationRequestId,

    job
      .verificationRequestId,

    job
      .verificationId
  );

    const recoveryDecisionId =
      this.firstValue(
        executionResult
          .recoveryDecisionId,

        result
          .recoveryDecisionId,

        job
          .recoveryDecisionId,

        null
      );

    const authorizationId =
      this.firstValue(
        executionResult
          .authorizationId,

        result
          .authorizationId,

        job
          .authorizationId,

        null
      );

    this.assertExecutionIdentity({
      executionRequestId,
      executionPlanId,
      executionPlanHash,
      verificationRequestId,
    });

    const handoffResult =
      await this.handoff
        .createVerificationRequested({
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          executionRequestId,

          executionPlanId,

          executionPlanHash,

          verificationRequestId,

          authorizationId,

          recoveryDecisionId,

          correlationId:
            this.firstValue(
              executionResult
                .correlationId,

              result
                .correlationId,

              job
                .correlationId,

              executionRequestId
            ),

          causationId:
            this.firstValue(
              executionResult
                .causationId,

              result
                .executionId,

              executionRequestId
            ),

          metadata: {
            phase:
              "11.3.10",

            sourceWorker:
              "ExecutionWorker",

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

      verificationRequestId,

      executionPlanId,

      executionPlanHash,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // RESULT RESOLUTION
  // ==========================================================================

  resolveExecutionResult(
    result
  ) {
    const candidates = [
      result.executionResult,

      result.result
        ?.executionResult,

      result.execution,

      result.result
        ?.execution,

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
            .executionRequestId ||
          candidate
            .executionPerformed !==
            undefined ||
          candidate
            .executed !==
            undefined ||
          candidate
            .success !==
            undefined
        ) {
          return candidate;
        }
      }
    }

    return null;
  }

  resolveExecutionSuccess({
    result,
    executionResult,
  } = {}) {
    const values = [
      executionResult
        ?.executionPerformed,

      executionResult
        ?.executed,

      executionResult
        ?.success,

      result
        ?.executionPerformed,

      result
        ?.executed,

      result
        ?.success,
    ];

    /*
     * Prefer explicit true/false indicators.
     */
    for (
      const value
      of values
    ) {
      if (
        value ===
        true
      ) {
        return true;
      }

      if (
        value ===
        false
      ) {
        return false;
      }
    }

    /*
     * Some execution paths return an execution result object rather than
     * a boolean success flag.
     */
    if (
      executionResult
        ?.status ===
        "COMPLETED" ||
      executionResult
        ?.status ===
        "SUCCEEDED" ||
      executionResult
        ?.state ===
        "COMPLETED" ||
      executionResult
        ?.state ===
        "SUCCEEDED"
    ) {
      return true;
    }

    return false;
  }

  resolveExecutionPlan({
    job,
    result,
    executionResult,
  } = {}) {
    const candidates = [
      executionResult
        ?.executionPlan,

      executionResult
        ?.plan,

      result
        ?.executionPlan,

      result
        ?.plan,

      result
        ?.result
        ?.executionPlan,

      job
        ?.executionPlan,

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
          "Execution verification outbox integration requires job"
        ),
        {
          code:
            "EXECUTION_VERIFICATION_OUTBOX_JOB_REQUIRED",
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
            `Execution verification outbox integration requires ${field}`
          ),
          {
            code:
              "EXECUTION_VERIFICATION_OUTBOX_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    /*
     * The queue/workflow handoff may carry an authorization reference,
     * but never an authorization grant.
     */
    if (
      job.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Execution verification outbox integration cannot receive execution authorization"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",
        }
      );
    }

    return true;
  }

  assertExecutionIdentity({
    executionRequestId,
    executionPlanId,
    executionPlanHash,
    verificationRequestId,
  } = {}) {
    for (
      const [
        field,
        value,
      ]
      of Object.entries({
        executionRequestId,
        executionPlanId,
        executionPlanHash,
        verificationRequestId,
      })
    ) {
      if (
        !value
      ) {
        throw Object.assign(
          new Error(
            `Execution verification outbox handoff requires ${field}`
          ),
          {
            code:
              "EXECUTION_VERIFICATION_OUTBOX_IDENTITY_REQUIRED",

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
  new ExecutionVerificationOutboxIntegrationService();

module.exports
  .ExecutionVerificationOutboxIntegrationService =
  ExecutionVerificationOutboxIntegrationService;