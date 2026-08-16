"use strict";

const os =
  require(
    "node:os"
  );

const {
  WorkflowOutboxRoutingRegistry,
} =
  require(
    "./workflowOutboxRoutingRegistry"
  );

const {
  WorkflowOutboxDispatcher,
} =
  require(
    "./workflowOutboxDispatcher"
  );

const {
  WorkflowOutboxDeliveryCoordinator,
} =
  require(
    "./workflowOutboxDeliveryCoordinator"
  );

const {
  WorkflowOutboxWorker,
} =
  require(
    "../../workers/workflowOutboxWorker"
  );

const workflowOutboxClaimService =
  require(
    "./workflowOutboxClaimService"
  );

const workflowOutboxPersistenceService =
  require(
    "./workflowOutboxPersistenceService"
  );

const workflowOutboxRetryPolicy =
  require(
    "./workflowOutboxRetryPolicy"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.13A
 * WORKFLOW OUTBOX PRODUCTION COMPOSITION
 * ============================================================================
 *
 * Purpose:
 *
 * Assemble the Phase 11.3 durable workflow pipeline from the components
 * already implemented and tested.
 *
 *
 *        WorkflowOutboxEvent
 *                 ↓
 *        Persistence Service
 *                 ↓
 *        WorkflowOutboxWorker
 *                 ↓
 *        Delivery Coordinator
 *                 ↓
 *           Dispatcher
 *                 ↓
 *         Routing Registry
 *                 ↓
 *       Infrastructure Queue
 *
 *
 * IMPORTANT:
 *
 * This module DOES NOT:
 *
 * - start timers
 * - register consumers
 * - execute workers directly
 * - mutate infrastructure
 * - grant execution authorization
 *
 * Startup and shutdown are intentionally handled separately.
 * ============================================================================
 */

/*
 * These are durable workflow transport topics.
 *
 * They are separate from observability events such as:
 *
 *   execution.started
 *   execution.completed
 *   verification.completed
 *   lifecycle.failed
 *
 * These topics mean:
 *
 *   "protected worker stage must process this durable workflow handoff"
 */
const WORKFLOW_OUTBOX_TOPIC =
  Object.freeze({
    EXECUTION:
      "aira.workflow.execution.requested",

    VERIFICATION:
      "aira.workflow.verification.requested",

    LIFECYCLE:
      "aira.workflow.lifecycle.requested",
  });


const WORKFLOW_OUTBOX_QUEUE =
  Object.freeze({
    EXECUTION:
      "aira.workflow.execution",

    VERIFICATION:
      "aira.workflow.verification",

    LIFECYCLE:
      "aira.workflow.lifecycle",
  });


class WorkflowOutboxComposition {
  constructor(
    options = {}
  ) {
    if (
      !options.queueService
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox composition requires queueService"
        ),
        {
          code:
            "OUTBOX_QUEUE_SERVICE_REQUIRED",
        }
      );
    }

    this.queueService =
      options.queueService;

    this.claimService =
      options.claimService ||
      workflowOutboxClaimService;

    this.persistence =
      options.persistence ||
      workflowOutboxPersistenceService;

    this.retryPolicy =
      options.retryPolicy ||
      workflowOutboxRetryPolicy;

    this.lifecycleJobAdapter =
      options.lifecycleJobAdapter ||
      undefined;

    this.workerId =
      options.workerId ||
      [
        "workflow-outbox",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    this.batchSize =
      options.batchSize ||
      25;

    this.leaseMs =
      options.leaseMs ||
      60000;

    this.now =
      options.now ||
      (() =>
        new Date());

    this.components =
      null;
  }

  // ==========================================================================
  // BUILD
  // ==========================================================================

  build() {
    if (
      this.components
    ) {
      /*
       * Composition is intentionally stable.
       *
       * Calling build() twice must not create multiple dispatcher /
       * worker graphs inside one process.
       */
      return this.components;
    }

    const routingRegistry =
      new WorkflowOutboxRoutingRegistry({
        executionPublisher:
          this.createStagePublisher({
            stage:
              "execution",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .EXECUTION,
          }),

        verificationPublisher:
          this.createStagePublisher({
            stage:
              "verification",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .VERIFICATION,
          }),

        lifecyclePublisher:
          this.createStagePublisher({
            stage:
              "lifecycle",

            topic:
              WORKFLOW_OUTBOX_TOPIC
                .LIFECYCLE,
          }),

        ...(this.lifecycleJobAdapter
          ? {
              lifecycleJobAdapter:
                this.lifecycleJobAdapter,
            }
          : {}),
      });

    const publishers =
      routingRegistry
        .createPublishers();

    const dispatcher =
      new WorkflowOutboxDispatcher({
        claimService:
          this.claimService,

        publishers,

        ownerId:
          this.workerId,

        leaseMs:
          this.leaseMs,

        now:
          this.now,
      });

    const deliveryCoordinator =
      new WorkflowOutboxDeliveryCoordinator({
        dispatcher,

        retryPolicy:
          this.retryPolicy,

        claimService:
          this.claimService,

        now:
          this.now,
      });

    const worker =
      new WorkflowOutboxWorker({
        persistence:
          this.persistence,

        deliveryCoordinator,

        workerId:
          this.workerId,

        batchSize:
          this.batchSize,

        now:
          this.now,
      });

    this.components = {
      routingRegistry,

      publishers,

      dispatcher,

      deliveryCoordinator,

      worker,

      claimService:
        this.claimService,

      persistence:
        this.persistence,

      retryPolicy:
        this.retryPolicy,

      workerId:
        this.workerId,

      topics:
        WORKFLOW_OUTBOX_TOPIC,

      queues:
        WORKFLOW_OUTBOX_QUEUE,

      executionAuthorized:
        false,
    };

    return this.components;
  }

  // ==========================================================================
  // STAGE PUBLISHER
  // ==========================================================================

  createStagePublisher({
    stage,
    topic,
  } = {}) {
    if (
      !stage ||
      !topic
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox stage publisher requires stage and topic"
        ),
        {
          code:
            "OUTBOX_STAGE_PUBLISHER_INVALID",
        }
      );
    }

    return async (
      job
    ) => {
      this.assertSafeJob({
        stage,
        job,
      });

      if (
        typeof this
          .queueService
          .publishEvent !==
        "function"
      ) {
        throw Object.assign(
          new Error(
            "Workflow outbox queue service does not support publishEvent"
          ),
          {
            code:
              "OUTBOX_QUEUE_PUBLISH_NOT_CONFIGURED",

            stage,
          }
        );
      }

      /*
       * The central queue service owns RabbitMQ transport.
       *
       * The outbox owns durable intent.
       *
       * The worker receiving this event still owns all business and
       * safety decisions.
       */
      const result =
        await this
          .queueService
          .publishEvent(
            topic,

            {
              ...job,

              executionAuthorized:
                false,
            },

            {
              tenantId:
                job.organizationId,

              correlationId:
                job.correlationId ||
                job.executionRequestId ||
                job.incidentId,

              priority:
                this.resolvePriority(
                  stage
                ),
            }
          );

      return {
        messageId:
          result?.eventId ||
          result?.messageId ||
          null,

        correlationId:
          result
            ?.correlationId ||
          job.correlationId ||
          null,

        queue:
          this.resolveQueueName(
            stage
          ),

        exchange:
          topic,

        routingKey:
          topic,

        executionAuthorized:
          false,
      };
    };
  }

  // ==========================================================================
  // QUEUE NAME
  // ==========================================================================

  resolveQueueName(
    stage
  ) {
    switch (
      stage
    ) {
      case "execution":
        return WORKFLOW_OUTBOX_QUEUE
          .EXECUTION;

      case "verification":
        return WORKFLOW_OUTBOX_QUEUE
          .VERIFICATION;

      case "lifecycle":
        return WORKFLOW_OUTBOX_QUEUE
          .LIFECYCLE;

      default:
        throw Object.assign(
          new Error(
            `Unknown workflow outbox stage: ${stage}`
          ),
          {
            code:
              "OUTBOX_STAGE_UNKNOWN",

            stage,
          }
        );
    }
  }

  // ==========================================================================
  // PRIORITY
  // ==========================================================================

  resolvePriority(
    stage
  ) {
    /*
     * Critical recovery workflow transitions receive a high but not maximum
     * priority.
     *
     * Reserve the maximum for emergency/control-plane use if needed later.
     */
    switch (
      stage
    ) {
      case "execution":
        return 8;

      case "verification":
        return 7;

      case "lifecycle":
        return 6;

      default:
        return 5;
    }
  }

  // ==========================================================================
  // SAFETY
  // ==========================================================================

  assertSafeJob({
    stage,
    job,
  } = {}) {
    if (
      !job ||
      typeof job !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          `Workflow outbox ${stage} job is required`
        ),
        {
          code:
            "OUTBOX_STAGE_JOB_REQUIRED",

          stage,
        }
      );
    }

    if (
      job.executionAuthorized ===
        true ||
      job.authorizationGranted ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox transport cannot grant execution authority"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",

          stage,
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
            `Workflow outbox ${stage} job requires ${field}`
          ),
          {
            code:
              "OUTBOX_STAGE_JOB_SCOPE_REQUIRED",

            stage,

            field,
          }
        );
      }
    }

    return true;
  }
}


// ============================================================================
// FACTORY
// ============================================================================

function createWorkflowOutboxComposition(
  options = {}
) {
  const composition =
    new WorkflowOutboxComposition(
      options
    );

  return composition.build();
}


module.exports = {
  WorkflowOutboxComposition,

  createWorkflowOutboxComposition,

  WORKFLOW_OUTBOX_TOPIC,

  WORKFLOW_OUTBOX_QUEUE,
};