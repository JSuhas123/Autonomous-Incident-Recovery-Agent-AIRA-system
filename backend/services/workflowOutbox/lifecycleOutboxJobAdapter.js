"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.3.11D
 * LIFECYCLE OUTBOX JOB ADAPTER
 * ============================================================================
 *
 * Purpose:
 *
 * Convert a durable LIFECYCLE_PROCESSING_REQUESTED outbox message into the
 * exact job shape expected by LifecycleWorker.
 *
 * SAFETY:
 *
 * - never grants execution authorization
 * - never invents verification identity
 * - never mutates infrastructure
 * - never directly executes lifecycle logic
 * - only adapts transport shape -> worker input shape
 * ============================================================================
 */

class LifecycleOutboxJobAdapter {
  buildJob(
    message = {}
  ) {
    if (
      !message ||
      typeof message !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle outbox message is required"
        ),
        {
          code:
            "LIFECYCLE_OUTBOX_MESSAGE_REQUIRED",
        }
      );
    }

    const payload =
      message.payload &&
      typeof message.payload ===
        "object"
        ? message.payload
        : {};

    const organizationId =
      this.firstValue(
        payload.organizationId,
        message.organizationId
      );

    const environmentId =
      this.firstValue(
        payload.environmentId,
        message.environmentId
      );

    const incidentId =
      this.firstValue(
        payload.incidentId,
        message.incidentId
      );

    const executionRequestId =
      this.firstValue(
        payload.executionRequestId,
        message.executionRequestId
      );

    const verificationId =
      this.firstValue(
        payload.verificationId,
        message.verificationId
      );

    const verificationPlanId =
      this.firstValue(
        payload.verificationPlanId,
        message.verificationPlanId
      );

    const verificationPlanHash =
      this.firstValue(
        payload.verificationPlanHash,
        message.verificationPlanHash
      );

    const verificationOutcome =
      this.firstValue(
        payload.verificationOutcome,
        message.verificationOutcome
      );

    this.assertIdentity({
      organizationId,
      environmentId,
      incidentId,
      executionRequestId,
      verificationId,
      verificationPlanId,
      verificationPlanHash,
      verificationOutcome,
    });

    if (
      payload.executionAuthorized ===
        true ||
      message.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Lifecycle outbox message cannot grant execution authorization"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",
        }
      );
    }

    return {
      organizationId,
      environmentId,
      incidentId,

      executionRequestId,

      verificationId,

      verificationPlanId,
      verificationPlanHash,

      verificationOutcome,

      correlationId:
        this.firstValue(
          payload.correlationId,
          message.correlationId,
          message.metadata
            ?.correlationId,
          executionRequestId
        ),

      causationId:
        this.firstValue(
          payload.causationId,
          message.causationId,
          verificationId
        ),

      outboxEventId:
        this.firstValue(
          message.outboxEventId,
          message.metadata
            ?.outbox
            ?.eventId,
          null
        ),

      outboxEventKey:
        this.firstValue(
          message.outboxEventKey,
          message.metadata
            ?.outbox
            ?.eventKey,
          null
        ),

      /*
       * Preserve structured verification context for LifecycleWorker
       * and downstream audit logic.
       */
      verification: {
        verificationId,

        verificationPlanId,

        verificationPlanHash,

        outcome:
          verificationOutcome,
      },

      executionAuthorized:
        false,
    };
  }

  assertIdentity({
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
            `Lifecycle outbox job requires ${field}`
          ),
          {
            code:
              "LIFECYCLE_OUTBOX_JOB_IDENTITY_REQUIRED",

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
  new LifecycleOutboxJobAdapter();

module.exports
  .LifecycleOutboxJobAdapter =
  LifecycleOutboxJobAdapter;