"use strict";

const {
  OUTBOX_EVENT_TYPE,
  assertNoExecutionAuthority,
} =
  require(
    "./workflowOutboxContracts"
  );

const lifecycleOutboxJobAdapter =
  require(
    "./lifecycleOutboxJobAdapter"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.12
 * WORKFLOW OUTBOX ROUTING REGISTRY
 * ============================================================================
 *
 * Responsibilities:
 *
 *   EXECUTION_REQUEST_READY
 *          -> execution queue boundary
 *
 *   VERIFICATION_REQUESTED
 *          -> verification queue boundary
 *
 *   LIFECYCLE_REQUESTED
 *          -> lifecycle queue boundary
 *
 * The registry:
 *
 * - maps durable event types to protected queue boundaries
 * - converts outbox transport messages into worker-compatible jobs
 * - never executes a worker directly
 * - never grants execution authority
 * - fails closed for unknown routes
 *
 * ============================================================================
 */

class WorkflowOutboxRoutingRegistry {
  constructor(
    options = {}
  ) {
    this.executionPublisher =
      options.executionPublisher ||
      null;

    this.verificationPublisher =
      options.verificationPublisher ||
      null;

    this.lifecyclePublisher =
      options.lifecyclePublisher ||
      null;

    this.lifecycleJobAdapter =
      options.lifecycleJobAdapter ||
      lifecycleOutboxJobAdapter;
  }

  // ==========================================================================
  // BUILD DISPATCHER ROUTES
  // ==========================================================================

  createPublishers() {
    return {
      [OUTBOX_EVENT_TYPE
        .EXECUTION_REQUEST_READY]:
        this.createExecutionRoute(),

      [OUTBOX_EVENT_TYPE
        .VERIFICATION_REQUESTED]:
        this.createVerificationRoute(),

      [OUTBOX_EVENT_TYPE
        .LIFECYCLE_REQUESTED]:
        this.createLifecycleRoute(),
    };
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  createExecutionRoute() {
    return {
      name:
        "execution-request-ready",

      queue:
        "execution",

      routingKey:
        "execution.requested",

      publish:
        async (
          message
        ) => {
          this.assertSafeMessage(
            message
          );

          const publisher =
            this.resolvePublisher(
              this.executionPublisher,
              "execution"
            );

          const job =
            this.buildExecutionJob(
              message
            );

          const result =
            await publisher(
              job
            );

          return this.normalizePublishResult({
            result,

            message,

            queue:
              "execution",

            routingKey:
              "execution.requested",
          });
        },
    };
  }

  buildExecutionJob(
    message
  ) {
    const payload =
      this.payload(
        message
      );

    const required = {
      organizationId:
        payload.organizationId,

      environmentId:
        payload.environmentId,

      incidentId:
        payload.incidentId,

      executionRequestId:
        payload.executionRequestId,

      executionPlanId:
        payload.executionPlanId,

      executionPlanHash:
        payload.executionPlanHash,
    };

    this.assertRequired({
      stage:
        "execution",

      values:
        required,
    });

    return {
      ...payload,

      organizationId:
        required.organizationId,

      environmentId:
        required.environmentId,

      incidentId:
        required.incidentId,

      executionRequestId:
        required.executionRequestId,

      executionPlanId:
        required.executionPlanId,

      executionPlanHash:
        required.executionPlanHash,

      outboxEventId:
        message.outboxEventId ||
        null,

      outboxEventKey:
        message.outboxEventKey ||
        null,

      /*
       * authorizationId is only a reference.
       *
       * ExecutionWorker must still reload and validate persisted
       * ExecutionAuthorization.
       */
      authorizationId:
        payload.authorizationId ||
        null,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // VERIFICATION
  // ==========================================================================

  createVerificationRoute() {
    return {
      name:
        "verification-requested",

      queue:
        "verification",

      routingKey:
        "verification.requested",

      publish:
        async (
          message
        ) => {
          this.assertSafeMessage(
            message
          );

          const publisher =
            this.resolvePublisher(
              this.verificationPublisher,
              "verification"
            );

          const job =
            this.buildVerificationJob(
              message
            );

          const result =
            await publisher(
              job
            );

          return this.normalizePublishResult({
            result,

            message,

            queue:
              "verification",

            routingKey:
              "verification.requested",
          });
        },
    };
  }

  buildVerificationJob(
    message
  ) {
    const payload =
      this.payload(
        message
      );

    const verificationId =
      payload.verificationId ||
      payload.verificationRequestId ||
      null;

    const required = {
      organizationId:
        payload.organizationId,

      environmentId:
        payload.environmentId,

      incidentId:
        payload.incidentId,

      executionRequestId:
        payload.executionRequestId,

      executionPlanId:
        payload.executionPlanId,

      executionPlanHash:
        payload.executionPlanHash,

      verificationId,
    };

    this.assertRequired({
      stage:
        "verification",

      values:
        required,
    });

    /*
     * VerificationWorker's Phase 11 idempotency identity requires
     * verificationPlanId + verificationPlanHash.
     *
     * Those may be explicitly persisted in the handoff or may already
     * exist as part of verificationPlan.
     */
    const verificationPlan =
      payload.verificationPlan &&
      typeof payload.verificationPlan ===
        "object"
        ? payload.verificationPlan
        : {};

    const verificationPlanId =
      payload.verificationPlanId ||
      verificationPlan
        .verificationPlanId ||
      verificationPlan
        .planId ||
      null;

    const verificationPlanHash =
      payload.verificationPlanHash ||
      verificationPlan
        .verificationPlanHash ||
      verificationPlan
        .planHash ||
      null;

    /*
     * Do not invent immutable verification-plan identity here.
     *
     * If the producing stage has not persisted that identity yet, the
     * verification queue boundary must fail closed rather than create
     * a different logical verification operation.
     */
    if (
      !verificationPlanId ||
      !verificationPlanHash
    ) {
      throw Object.assign(
        new Error(
          "Verification outbox route requires immutable verification plan identity"
        ),
        {
          code:
            "OUTBOX_VERIFICATION_IDENTITY_REQUIRED",
        }
      );
    }

    return {
      ...payload,

      organizationId:
        required.organizationId,

      environmentId:
        required.environmentId,

      incidentId:
        required.incidentId,

      executionRequestId:
        required.executionRequestId,

      executionPlanId:
        required.executionPlanId,

      executionPlanHash:
        required.executionPlanHash,

      verificationId,

      verificationPlanId,

      verificationPlanHash,

      verificationPlan,

      outboxEventId:
        message.outboxEventId ||
        null,

      outboxEventKey:
        message.outboxEventKey ||
        null,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  createLifecycleRoute() {
    return {
      name:
        "lifecycle-requested",

      queue:
        "lifecycle",

      routingKey:
        "lifecycle.requested",

      publish:
        async (
          message
        ) => {
          this.assertSafeMessage(
            message
          );

          const publisher =
            this.resolvePublisher(
              this.lifecyclePublisher,
              "lifecycle"
            );

          /*
           * The adapter created in 11.3.11D is the canonical conversion
           * from outbox transport -> LifecycleWorker job.
           */
          const job =
            this.lifecycleJobAdapter
              .buildJob(
                message
              );

          const result =
            await publisher(
              job
            );

          return this.normalizePublishResult({
            result,

            message,

            queue:
              "lifecycle",

            routingKey:
              "lifecycle.requested",
          });
        },
    };
  }

  // ==========================================================================
  // SAFETY
  // ==========================================================================

  assertSafeMessage(
    message
  ) {
    if (
      !message ||
      typeof message !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox routing requires message"
        ),
        {
          code:
            "OUTBOX_ROUTING_MESSAGE_REQUIRED",
        }
      );
    }

    assertNoExecutionAuthority(
      message.payload ||
        {}
    );

    if (
      message.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox routing cannot grant execution authority"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",
        }
      );
    }

    return true;
  }

  payload(
    message
  ) {
    if (
      !message.payload ||
      typeof message.payload !==
        "object" ||
      Array.isArray(
        message.payload
      )
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox routing requires payload"
        ),
        {
          code:
            "OUTBOX_ROUTING_PAYLOAD_REQUIRED",
        }
      );
    }

    return message.payload;
  }

  assertRequired({
    stage,
    values,
  }) {
    for (
      const [
        field,
        value,
      ]
      of Object.entries(
        values
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
            `Workflow outbox ${stage} route requires ${field}`
          ),
          {
            code:
              "OUTBOX_ROUTING_IDENTITY_REQUIRED",

            stage,

            field,
          }
        );
      }
    }
  }

  resolvePublisher(
    publisher,
    stage
  ) {
    if (
      typeof publisher ===
      "function"
    ) {
      return publisher;
    }

    /*
     * Support common existing queue-service shapes without coupling
     * the registry to one queue implementation.
     */
    if (
      publisher &&
      typeof publisher.publishRequested ===
        "function"
    ) {
      return (
        job
      ) =>
        publisher
          .publishRequested(
            job
          );
    }

    if (
      publisher &&
      typeof publisher.publish ===
        "function"
    ) {
      return (
        job
      ) =>
        publisher.publish(
          job
        );
    }

    if (
      publisher &&
      typeof publisher.enqueue ===
        "function"
    ) {
      return (
        job
      ) =>
        publisher.enqueue(
          job
        );
    }

    throw Object.assign(
      new Error(
        `Workflow outbox ${stage} publisher is not configured`
      ),
      {
        code:
          "OUTBOX_ROUTE_PUBLISHER_NOT_CONFIGURED",

        stage,
      }
    );
  }

  normalizePublishResult({
    result,
    message,
    queue,
    routingKey,
  }) {
    return {
      messageId:
        result?.messageId ||
        result?.id ||
        message.messageId ||
        null,

      queue:
        result?.queue ||
        queue,

      exchange:
        result?.exchange ||
        null,

      routingKey:
        result?.routingKey ||
        routingKey,

      result:
        result ||
        null,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  WorkflowOutboxRoutingRegistry;

module.exports
  .WorkflowOutboxRoutingRegistry =
  WorkflowOutboxRoutingRegistry;