"use strict";

const recoveryDecisionOutboxHandoffService =
  require(
    "./recoveryDecisionOutboxHandoffService"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.9B
 * RECOVERY DECISION OUTBOX INTEGRATION
 * ============================================================================
 *
 * Purpose:
 *
 * Convert the durable output of the recovery-decision lifecycle into a
 * durable EXECUTION_REQUEST_READY outbox handoff.
 *
 * This service deliberately understands several existing AIRA result shapes
 * so the recovery pipeline does not need to duplicate field-resolution logic.
 *
 * SAFETY:
 *
 * - executionAuthorized is always false
 * - authorizationId is only carried as a reference
 * - execution request identity must already exist
 * - immutable plan identity must already exist
 * - this service never executes infrastructure
 * ============================================================================
 */

class RecoveryDecisionOutboxIntegrationService {
  constructor(
    options = {}
  ) {
    this.handoff =
      options.handoff ||
      recoveryDecisionOutboxHandoffService;
  }

  // ==========================================================================
  // CREATE HANDOFF FROM WORKER RESULT
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
          "Recovery decision outbox integration requires result"
        ),
        {
          code:
            "RECOVERY_DECISION_OUTBOX_RESULT_REQUIRED",
        }
      );
    }

    /*
     * A recovery-decision result may contain the execution request
     * directly or nested beneath lifecycle/result objects.
     */
    const executionRequest =
      this.resolveExecutionRequest(
        result
      );

    if (
      !executionRequest
    ) {
      /*
       * Not every recovery decision necessarily creates execution work.
       *
       * Examples:
       *
       * - manual intervention
       * - policy blocked
       * - no safe playbook
       * - approval pending
       *
       * Absence of an execution request therefore means:
       *
       *      NO EXECUTION HANDOFF REQUIRED
       *
       * not:
       *
       *      generate an execution request ourselves.
       */
      return {
        handoffCreated:
          false,

        required:
          false,

        reason:
          "NO_EXECUTION_REQUEST",

        executionAuthorized:
          false,
      };
    }

    const recoveryDecision =
      this.resolveRecoveryDecision(
        result
      );

    const executionRequestId =
      this.firstValue(
        executionRequest
          .executionRequestId,

        executionRequest
          .requestId,

        result
          .executionRequestId
      );

    const recoveryDecisionId =
      this.firstValue(
        executionRequest
          .recoveryDecisionId,

        recoveryDecision
          ?.recoveryDecisionId,

        result
          .recoveryDecisionId,

        job
          .recoveryDecisionId
      );

    const executionPlan =
      this.resolveExecutionPlan({
        result,
        executionRequest,
      });

    const executionPlanId =
      this.firstValue(
        executionRequest
          .executionPlanId,

        executionRequest
          .planId,

        executionPlan
          ?.executionPlanId,

        executionPlan
          ?.planId,

        result
          .executionPlanId
      );

    const executionPlanHash =
      this.firstValue(
        executionRequest
          .executionPlanHash,

        executionRequest
          .planHash,

        executionPlan
          ?.executionPlanHash,

        executionPlan
          ?.planHash,

        result
          .executionPlanHash
      );

    const authorizationId =
      this.firstValue(
        executionRequest
          .authorizationId,

        result
          .authorizationId,

        null
      );

    const selectedPlaybookId =
      this.firstValue(
        executionRequest
          .selectedPlaybookId,

        executionRequest
          .playbookId,

        recoveryDecision
          ?.selectedPlaybookId,

        recoveryDecision
          ?.playbookId,

        result
          .selectedPlaybookId,

        null
      );

    this.assertExecutionIdentity({
      recoveryDecisionId,
      executionRequestId,
      executionPlanId,
      executionPlanHash,
    });

    const handoffResult =
      await this.handoff
        .createExecutionRequestReady({
          organizationId:
            job.organizationId,

          environmentId:
            job.environmentId,

          incidentId:
            job.incidentId,

          recoveryDecisionId,

          executionRequestId,

          executionPlanId,

          executionPlanHash,

          authorizationId,

          selectedPlaybookId,

          correlationId:
            this.firstValue(
              executionRequest
                .correlationId,

              result
                .correlationId,

              job
                .correlationId,

              executionRequestId
            ),

          causationId:
            this.firstValue(
              executionRequest
                .causationId,

              recoveryDecisionId
            ),

          metadata: {
            phase:
              "11.3.9",

            sourceWorker:
              "RecoveryDecisionWorker",

            diagnosisId:
              this.firstValue(
                job.diagnosisId,

                job.diagnosis
                  ?.diagnosisId,

                null
              ),

            diagnosisRevision:
              job.diagnosisRevision ??
              job.diagnosis
                ?.revision ??
              null,

            /*
             * Keep operational metadata only.
             * Never attach authority flags.
             */
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

      executionPlanId,

      executionPlanHash,

      authorizationId,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // RESULT RESOLUTION
  // ==========================================================================

  resolveExecutionRequest(
    result
  ) {
    const candidates = [
      result.executionRequest,

      result.result
        ?.executionRequest,

      result.recovery
        ?.executionRequest,

      result.lifecycle
        ?.executionRequest,

      result.recoveryDecision
        ?.executionRequest,

      result.decision
        ?.executionRequest,
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

    /*
     * Some implementations return execution identity flattened onto
     * the result rather than as a nested executionRequest object.
     */
    if (
      result.executionRequestId
    ) {
      return result;
    }

    return null;
  }

  resolveRecoveryDecision(
    result
  ) {
    const candidates = [
      result.recoveryDecision,

      result.decision,

      result.result
        ?.recoveryDecision,

      result.result
        ?.decision,

      result.recovery
        ?.decision,
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

  resolveExecutionPlan({
    result,
    executionRequest,
  } = {}) {
    const candidates = [
      executionRequest
        ?.executionPlan,

      executionRequest
        ?.plan,

      result
        ?.executionPlan,

      result
        ?.plan,

      result
        ?.result
        ?.executionPlan,

      result
        ?.result
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
          "Recovery decision outbox integration requires job"
        ),
        {
          code:
            "RECOVERY_DECISION_OUTBOX_JOB_REQUIRED",
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
            `Recovery decision outbox integration requires ${field}`
          ),
          {
            code:
              "RECOVERY_DECISION_OUTBOX_SCOPE_REQUIRED",

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
          "Recovery decision outbox integration cannot receive execution authorization"
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
    recoveryDecisionId,
    executionRequestId,
    executionPlanId,
    executionPlanHash,
  } = {}) {
    for (
      const [
        field,
        value,
      ]
      of Object.entries({
        recoveryDecisionId,
        executionRequestId,
        executionPlanId,
        executionPlanHash,
      })
    ) {
      if (
        !value
      ) {
        throw Object.assign(
          new Error(
            `Recovery decision outbox handoff requires ${field}`
          ),
          {
            code:
              "RECOVERY_DECISION_OUTBOX_EXECUTION_IDENTITY_REQUIRED",

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
  new RecoveryDecisionOutboxIntegrationService();

module.exports
  .RecoveryDecisionOutboxIntegrationService =
  RecoveryDecisionOutboxIntegrationService;