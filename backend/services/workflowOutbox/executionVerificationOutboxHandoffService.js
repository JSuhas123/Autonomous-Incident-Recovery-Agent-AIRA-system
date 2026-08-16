"use strict";

const workflowOutboxPersistenceService =
  require(
    "./workflowOutboxPersistenceService"
  );
/*
 * ============================================================================
 * AIRA PHASE 11.3.10A
 * EXECUTION -> VERIFICATION DURABLE OUTBOX HANDOFF
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Persist durable intent that a completed execution must be verified.
 *
 * This service does NOT:
 *
 * - execute infrastructure
 * - authorize execution
 * - approve actions
 * - rerun execution
 * - decide verification outcome
 *
 * It only records:
 *
 *      EXECUTION COMPLETED
 *              ↓
 *      VERIFICATION REQUIRED
 *
 * ============================================================================
 */

const EVENT_TYPE =
  "VERIFICATION_REQUESTED";

class ExecutionVerificationOutboxHandoffService {
  constructor(
    options = {}
  ) {
    this.outbox =
      options.outbox ||
      workflowOutboxPersistenceService;
  }

  // ==========================================================================
  // CREATE VERIFICATION HANDOFF
  // ==========================================================================

  async createVerificationRequested({
    organizationId,
    environmentId,
    incidentId,

    executionRequestId,
    executionPlanId,
    executionPlanHash,

    verificationRequestId,

    authorizationId = null,
    recoveryDecisionId = null,

    correlationId = null,
    causationId = null,

    metadata = {},
  } = {}) {
    this.assertInput({
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,
      executionPlanId,
      executionPlanHash,

      verificationRequestId,
    });

    /*
     * Deterministic event identity.
     *
     * Reprocessing the same successful execution must resolve to the
     * same logical verification handoff.
     */
    const eventKey =
      [
        EVENT_TYPE,
        organizationId,
        environmentId,
        incidentId,
        executionRequestId,
        executionPlanId,
        executionPlanHash,
        verificationRequestId,
      ].join(
        ":"
      );

    const payload = {
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,
      executionPlanId,
      executionPlanHash,

      verificationRequestId,

      authorizationId,
      recoveryDecisionId,

      correlationId:
        correlationId ||
        executionRequestId,

      causationId:
        causationId ||
        executionRequestId,

      /*
       * CRITICAL SAFETY BOUNDARY
       *
       * An outbox event may transport evidence of an execution.
       * It must never transport authority to execute again.
       */
      executionAuthorized:
        false,

      metadata: {
        phase:
          "11.3.10",

        source:
          "ExecutionWorker",

        target:
          "VerificationWorker",

        ...metadata,
      },
    };

    const result =
      await this.createOrGet({
        eventType:
          EVENT_TYPE,

        eventKey,

        organizationId,
        environmentId,
        incidentId,

        aggregateType:
          "EXECUTION_REQUEST",

        aggregateId:
          executionRequestId,

        correlationId:
          payload.correlationId,

        causationId:
          payload.causationId,

        payload,
      });

    return {
      persisted:
        result.persisted !==
        false,

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
        result.eventId ||
        result.event?.eventId,

      eventKey,

      eventType:
        EVENT_TYPE,

      executionRequestId,

      verificationRequestId,

      executionAuthorized:
        false,

      event:
        result.event ||
        null,
    };
  }

  // ==========================================================================
  // OUTBOX ADAPTER
  // ==========================================================================

  async createOrGet(
  input
) {
  if (
    !this.outbox ||
    typeof this.outbox
      .createOrGet !==
    "function"
  ) {
    throw Object.assign(
      new Error(
        "Workflow outbox persistence service is not configured"
      ),
      {
        code:
          "WORKFLOW_OUTBOX_PERSISTENCE_NOT_CONFIGURED",
      }
    );
  }

  return this.outbox
    .createOrGet(
      input
    );
}

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertInput({
    organizationId,
    environmentId,
    incidentId,

    executionRequestId,
    executionPlanId,
    executionPlanHash,

    verificationRequestId,
  } = {}) {
    const required = {
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,
      executionPlanId,
      executionPlanHash,

      verificationRequestId,
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
}

module.exports =
  new ExecutionVerificationOutboxHandoffService();

module.exports
  .ExecutionVerificationOutboxHandoffService =
  ExecutionVerificationOutboxHandoffService;

module.exports.EVENT_TYPE =
  EVENT_TYPE;