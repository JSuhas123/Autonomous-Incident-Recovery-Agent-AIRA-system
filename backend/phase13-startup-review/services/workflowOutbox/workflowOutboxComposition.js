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

const dependencyIsolationService =
  require(
    "../infrastructure/dependencyIsolationService"
  );


/*
 * ============================================================================
 * AIRA PHASE 11.3 + 11.5
 * WORKFLOW OUTBOX PRODUCTION COMPOSITION
 * ============================================================================
 *
 * Durable workflow:
 *
 * WorkflowOutboxEvent
 *        ↓
 * Persistence
 *        ↓
 * WorkflowOutboxWorker
 *        ↓
 * Delivery Coordinator
 *        ↓
 * Dispatcher
 *        ↓
 * Routing Registry
 *        ↓
 * Stage Publisher
 *        ↓
 * Dependency Isolation
 *        ↓
 * RabbitMQ
 *
 * IMPORTANT:
 *
 * - Outbox owns durable intent.
 * - RabbitMQ owns transport.
 * - Dependency isolation owns broker failure classification.
 * - Delivery coordinator owns retry scheduling.
 * - This layer NEVER grants execution authority.
 * ============================================================================
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


    /*
     * Phase 11.5 dependency boundary.
     *
     * Injectable for deterministic testing.
     */
    this.dependencyIsolation =
      options.dependencyIsolation ||
      dependencyIsolationService;


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
       * Calling build twice must not construct multiple
       * dispatcher/worker graphs in one process.
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
       * ======================================================================
       * PHASE 11.5 — RABBITMQ DEPENDENCY ISOLATION
       * ======================================================================
       *
       * IMPORTANT:
       *
       * The outbox event already exists durably before reaching this point.
       *
       * Therefore RabbitMQ failure must NEVER:
       *
       * - lose the workflow event
       * - grant execution authority
       * - create another independent retry mechanism
       *
       * DependencyIsolationService classifies the dependency failure.
       *
       * WorkflowOutboxDeliveryCoordinator remains responsible for durable
       * retry scheduling.
       * ======================================================================
       */

      const dependencyResult =
        await this
          .dependencyIsolation
          .execute(
            "rabbitmq",

            () =>
              this.queueService
                .publishEvent(
                  topic,

                  {
                    ...job,

                    /*
                     * Transport cannot manufacture authority.
                     */
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
                ),

            {
              organizationId:
                job.organizationId,

              environmentId:
                job.environmentId,

              incidentId:
                job.incidentId,

              correlationId:
                job.correlationId ||
                null,

              stage,

              topic,
            }
          );


      /*
       * ======================================================================
       * FAILURE TRANSLATION
       * ======================================================================
       *
       * RabbitMQ is DURABLE_ASYNC.
       *
       * DependencyIsolationService normally returns a decision instead of
       * throwing:
       *
       * {
       *   ok: false,
       *   decision: "DURABLE_RETRY"
       * }
       *
       * Phase 11.3 however expects publication failure to surface as an
       * exception so DeliveryCoordinator can apply the existing durable
       * retry policy.
       *
       * Therefore:
       *
       * dependency decision
       *        ↓
       * transport exception
       *        ↓
       * existing outbox retry coordinator
       *
       * No second retry system is introduced here.
       * ======================================================================
       */

      if (
        !dependencyResult ||
        dependencyResult.ok !==
          true
      ) {
        /*
         * Different dependency adapters/mocks may expose the original
         * transport error slightly differently.
         *
         * Prefer the canonical `error` field.
         */
        const originalError =
          dependencyResult
            ?.error ||
          dependencyResult
            ?.cause ||
          dependencyResult
            ?.originalError ||
          null;


        /*
         * Preserve the actual transport code whenever available.
         *
         * Examples:
         *
         * ECONNREFUSED
         * ECONNRESET
         * ETIMEDOUT
         * ENOTFOUND
         */
        const originalCode =
          originalError
            ?.code ||
          dependencyResult
            ?.errorCode ||
          dependencyResult
            ?.causeCode ||
          null;


        const originalMessage =
          originalError
            ?.message ||
          dependencyResult
            ?.errorMessage ||
          dependencyResult
            ?.message ||
          `RabbitMQ workflow publish unavailable for ${stage}`;


        /*
         * Stable Phase 11.5 classification.
         *
         * `code` preserves transport identity when known.
         *
         * `isolationCode` always identifies this dependency boundary.
         */
        const transportError =
          Object.assign(
            new Error(
              originalMessage
            ),
            {
              code:
                originalCode ||
                "OUTBOX_RABBITMQ_UNAVAILABLE",

              isolationCode:
                "OUTBOX_RABBITMQ_UNAVAILABLE",

              dependency:
                "rabbitmq",

              dependencyDecision:
                dependencyResult
                  ?.decision ||
                "DURABLE_RETRY",

              circuitState:
                dependencyResult
                  ?.circuit
                  ?.state ||
                null,

              retryable:
                dependencyResult
                  ?.retryable !==
                false,

              stage,

              topic,

              executionAuthorized:
                false,

              originalError,

              dependencyResult:
                dependencyResult ||
                null,
            }
          );


        throw transportError;
      }


      const result =
        dependencyResult.result;


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
     * Critical recovery transitions receive high priority.
     *
     * Maximum priority remains reserved for emergency/control-plane
     * operations.
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


    /*
     * Transport boundaries cannot create or propagate authority.
     */
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


    /*
     * Tenant/environment/incident scope must always be explicit.
     */
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