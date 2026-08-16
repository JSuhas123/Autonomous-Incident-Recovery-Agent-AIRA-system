"use strict";

const workflowOutboxPersistenceService =
  require(
    "./workflowOutboxPersistenceService"
  );

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
  OUTBOX_ERROR_CODE,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.9
 * RECOVERY DECISION -> EXECUTION OUTBOX HANDOFF
 * ============================================================================
 *
 * Purpose:
 *
 * Persist durable intent that an authorized execution workflow may continue
 * processing an execution request.
 *
 * IMPORTANT:
 *
 * EXECUTION_REQUEST_READY means:
 *
 *      "This execution request is ready to enter the protected
 *       ExecutionWorker workflow."
 *
 * It DOES NOT mean:
 *
 *      "Execution is authorized."
 *
 * ExecutionWorker must still reload and validate persisted authorization,
 * immutable plan identity, policy boundaries, idempotency, and ownership.
 * ============================================================================
 */

class RecoveryDecisionOutboxHandoffService {
  constructor(
    options = {}
  ) {
    this.outbox =
      options.outbox ||
      workflowOutboxPersistenceService;
  }

  // ==========================================================================
  // CREATE EXECUTION HANDOFF
  // ==========================================================================

  async createExecutionRequestReady({
    organizationId,
    environmentId,
    incidentId,

    recoveryDecisionId,

    executionRequestId,

    executionPlanId,
    executionPlanHash,

    authorizationId =
      null,

    selectedPlaybookId =
      null,

    correlationId =
      null,

    causationId =
      null,

    metadata =
      {},
  } = {}) {
    this.assertInput({
      organizationId,
      environmentId,
      incidentId,

      recoveryDecisionId,

      executionRequestId,

      executionPlanId,
      executionPlanHash,
    });

    /*
     * authorizationId is only a REFERENCE.
     *
     * The outbox event does not claim that the authorization is valid.
     * ExecutionWorker remains responsible for loading and validating it.
     */
    const payload = {
      organizationId,

      environmentId,

      incidentId,

      recoveryDecisionId,

      executionRequestId,

      executionPlanId,

      executionPlanHash,

      authorizationId,

      selectedPlaybookId,

      correlationId:
        correlationId ||
        executionRequestId,

      causationId:
        causationId ||
        recoveryDecisionId,

      /*
       * Critical invariant:
       *
       * Transport cannot manufacture authority.
       */
      executionAuthorized:
        false,
    };

    assertNoExecutionAuthority(
      payload
    );

    /*
     * executionRequestId is the aggregate because the next protected
     * stage operates on this exact execution request.
     *
     * transitionId prevents this event identity from being confused with
     * future execution-request transitions.
     */
    const result =
      await this
        .outbox
        .createOrGet({
          organizationId,

          environmentId,

          incidentId,

          aggregateType:
            OUTBOX_AGGREGATE_TYPE
              .EXECUTION_REQUEST,

          aggregateId:
            executionRequestId,

          eventType:
            OUTBOX_EVENT_TYPE
              .EXECUTION_REQUEST_READY,

          transitionId:
            [
              "recovery-decision",
              recoveryDecisionId,
              "execution-ready",
            ].join(
              ":"
            ),

          payload,

          metadata: {
            ...metadata,

            source:
              "RECOVERY_DECISION",

            recoveryDecisionId,

            correlationId:
              correlationId ||
              executionRequestId,

            causationId:
              causationId ||
              recoveryDecisionId,
          },
        });

    return {
      persisted:
        true,

      created:
        result.created ===
        true,

      duplicate:
        result.duplicate ===
        true,

      raced:
        result.raced ===
        true,

      eventId:
        result.event
          ?.eventId ||
        null,

      eventKey:
        result.event
          ?.eventKey ||
        null,

      event:
        result.event,

      executionRequestId,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertInput({
    organizationId,
    environmentId,
    incidentId,

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
        organizationId,
        environmentId,
        incidentId,
        recoveryDecisionId,
        executionRequestId,
        executionPlanId,
        executionPlanHash,
      })
    ) {
      if (
        !value ||
        !String(
          value
        ).trim()
      ) {
        throw Object.assign(
          new Error(
            `Recovery decision outbox handoff requires ${field}`
          ),
          {
            code:
              field ===
                "organizationId" ||
              field ===
                "environmentId"
                ? OUTBOX_ERROR_CODE
                    .TENANT_SCOPE_REQUIRED
                : "RECOVERY_DECISION_OUTBOX_HANDOFF_SCOPE_REQUIRED",

            field,
          }
        );
      }
    }

    return true;
  }
}

module.exports =
  new RecoveryDecisionOutboxHandoffService();

module.exports
  .RecoveryDecisionOutboxHandoffService =
  RecoveryDecisionOutboxHandoffService;