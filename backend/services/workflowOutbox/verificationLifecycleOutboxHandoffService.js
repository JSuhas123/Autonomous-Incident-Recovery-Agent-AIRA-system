"use strict";

const workflowOutboxPersistenceService =
  require(
    "./workflowOutboxPersistenceService"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.11A
 * VERIFICATION -> LIFECYCLE DURABLE HANDOFF
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Persist durable intent that a completed verification outcome must be
 * consumed by the lifecycle stage.
 *
 * This service DOES NOT:
 *
 * - close incidents
 * - retry execution
 * - perform rollback
 * - authorize execution
 * - mutate infrastructure
 * - override verification outcome
 *
 * It only records:
 *
 *      VERIFICATION COMPLETED
 *                ↓
 *      LIFECYCLE PROCESSING REQUIRED
 *
 * ============================================================================
 */

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "./workflowOutboxContracts"
  );

const EVENT_TYPE =
  OUTBOX_EVENT_TYPE
    .LIFECYCLE_REQUESTED;

class VerificationLifecycleOutboxHandoffService {
  constructor(
    options = {}
  ) {
    this.outbox =
      options.outbox ||
      workflowOutboxPersistenceService;
  }

  // ==========================================================================
  // CREATE LIFECYCLE HANDOFF
  // ==========================================================================

  async createLifecycleRequested({
    organizationId,
    environmentId,
    incidentId,

    executionRequestId,

    verificationId,

    verificationPlanId,
    verificationPlanHash,

    verificationOutcome,

    correlationId = null,
    causationId = null,

    metadata = {},
  } = {}) {
    this.assertInput({
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      verificationOutcome,
    });

    /*
     * Deterministic identity.
     *
     * Reprocessing the same verification result must produce the same
     * logical lifecycle handoff.
     */
    const eventKey =
      [
        EVENT_TYPE,

        organizationId,
        environmentId,
        incidentId,

        executionRequestId,

        verificationId,

        verificationPlanId,
        verificationPlanHash,
      ].join(
        ":"
      );

    const payload = {
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      verificationOutcome,

      correlationId:
        correlationId ||
        executionRequestId,

      causationId:
        causationId ||
        verificationId,

      /*
       * ================================================================
       * SECURITY / AUTHORITY BOUNDARY
       * ================================================================
       *
       * Lifecycle receives evidence and workflow state.
       *
       * It does NOT receive reusable infrastructure execution authority.
       */
      executionAuthorized:
        false,

      metadata: {
        phase:
          "11.3.11",

        source:
          "VerificationWorker",

        target:
          "LifecycleWorker",

        ...metadata,
      },
    };

    const persisted =
      await this.createOrGet({
        eventType:
          EVENT_TYPE,

        eventKey,

        organizationId,
        environmentId,
        incidentId,

        aggregateType:
          OUTBOX_AGGREGATE_TYPE.VERIFICATION,

        aggregateId:
          verificationId,

        correlationId:
          payload.correlationId,

        causationId:
          payload.causationId,

        payload,
      });

    return {
      persisted:
        persisted.persisted !==
        false,

      created:
        persisted.created ===
        true,

      duplicate:
        persisted.duplicate ===
        true,

      raced:
        persisted.raced ===
        true,

      eventId:
        persisted.eventId ||
        persisted.event?.eventId,

      eventKey,

      eventType:
        EVENT_TYPE,

      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      executionAuthorized:
        false,

      event:
        persisted.event ||
        null,
    };
  }

  // ==========================================================================
  // PERSISTENCE
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

    verificationId,

    verificationPlanId,
    verificationPlanHash,

    verificationOutcome,
  } = {}) {
    const required = {
      organizationId,
      environmentId,
      incidentId,

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
}

module.exports =
  new VerificationLifecycleOutboxHandoffService();

module.exports
  .VerificationLifecycleOutboxHandoffService =
  VerificationLifecycleOutboxHandoffService;

module.exports.EVENT_TYPE =
  EVENT_TYPE;