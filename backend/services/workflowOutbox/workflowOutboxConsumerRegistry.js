"use strict";

const {
  WORKFLOW_OUTBOX_TOPIC,
  WORKFLOW_OUTBOX_QUEUE,
} =
  require(
    "./workflowOutboxComposition"
  );

const executionWorker =
  require(
    "../../workers/executionWorker"
  );

const verificationWorker =
  require(
    "../../workers/verificationWorker"
  );

const lifecycleWorker =
  require(
    "../../workers/lifecycleWorker"
  );

/*
 * ============================================================================
 * AIRA PHASE 11.3.13C
 * WORKFLOW OUTBOX DURABLE CONSUMER REGISTRY
 * ============================================================================
 *
 * PURPOSE
 * -------
 *
 * Register the consumer side of the Phase 11.3 durable workflow.
 *
 *
 * aira.workflow.execution.requested
 *                ↓
 *        durable RabbitMQ queue
 *                ↓
 *         ExecutionWorker
 *
 *
 * aira.workflow.verification.requested
 *                ↓
 *        durable RabbitMQ queue
 *                ↓
 *        VerificationWorker
 *
 *
 * aira.workflow.lifecycle.requested
 *                ↓
 *        durable RabbitMQ queue
 *                ↓
 *         LifecycleWorker
 *
 *
 * ACK RULE
 * --------
 *
 * Worker resolves successfully
 *        ↓
 * ACK message
 *
 *
 * Worker throws
 *        ↓
 * DO NOT ACK
 *        ↓
 * throw error
 *        ↓
 * QueueService.consumeEvents()
 *        ↓
 * NACK
 *        ↓
 * retryable !== false ? requeue : DLX
 *
 *
 * SAFETY
 * ------
 *
 * This registry NEVER:
 *
 * - executes infrastructure directly
 * - bypasses protected workers
 * - bypasses idempotency
 * - manufactures execution authority
 * - manually retries RabbitMQ messages
 * - double-ACKs / double-NACKs messages
 *
 * ============================================================================
 */

class WorkflowOutboxConsumerRegistry {
  constructor(
    options = {}
  ) {
    if (
      !options.queueService
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumers require queueService"
        ),
        {
          code:
            "OUTBOX_CONSUMER_QUEUE_REQUIRED",
        }
      );
    }

    this.queueService =
      options.queueService;

    this.executionWorker =
      options.executionWorker ||
      executionWorker;

    this.verificationWorker =
      options.verificationWorker ||
      verificationWorker;

    this.lifecycleWorker =
      options.lifecycleWorker ||
      lifecycleWorker;

    this.prefetch =
      this.normalizePrefetch(
        options.prefetch ??
          1
      );

    this.logger =
      options.logger ||
      console;

    this.started =
      false;

    this.registrations =
      [];
  }

  // ==========================================================================
  // START ALL DURABLE CONSUMERS
  // ==========================================================================

  async start() {
    if (
      this.started
    ) {
      return {
        started:
          false,

        alreadyStarted:
          true,

        registrations:
          [
            ...this.registrations,
          ],

        executionAuthorized:
          false,
      };
    }

    this.assertTransportReady();

    this.assertQueueContract();

    const registrations =
      [];

    try {
      registrations.push(
        await this.registerConsumer({
          stage:
            "execution",

          topic:
            WORKFLOW_OUTBOX_TOPIC
              .EXECUTION,

          queueName:
            WORKFLOW_OUTBOX_QUEUE
              .EXECUTION,

          worker:
            this.executionWorker,
        })
      );

      registrations.push(
        await this.registerConsumer({
          stage:
            "verification",

          topic:
            WORKFLOW_OUTBOX_TOPIC
              .VERIFICATION,

          queueName:
            WORKFLOW_OUTBOX_QUEUE
              .VERIFICATION,

          worker:
            this.verificationWorker,
        })
      );

      registrations.push(
        await this.registerConsumer({
          stage:
            "lifecycle",

          topic:
            WORKFLOW_OUTBOX_TOPIC
              .LIFECYCLE,

          queueName:
            WORKFLOW_OUTBOX_QUEUE
              .LIFECYCLE,

          worker:
            this.lifecycleWorker,
        })
      );
    } catch (
      error
    ) {
      /*
       * Some consumers may already have been registered successfully.
       *
       * QueueService does not currently provide cancellation handles,
       * therefore we preserve the real state instead of pretending the
       * registration was rolled back.
       */
      this.registrations =
        registrations;

      throw Object.assign(
        error,
        {
          outboxConsumerRegistrations:
            [
              ...registrations,
            ],
        }
      );
    }

    this.registrations =
      registrations;

    this.started =
      true;

    this.safeLog(
      "info",
      `[workflow-outbox] durable consumers registered count=${registrations.length}`
    );

    return {
      started:
        true,

      alreadyStarted:
        false,

      registrations:
        [
          ...registrations,
        ],

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // REGISTER ONE CONSUMER
  // ==========================================================================

  async registerConsumer({
    stage,
    topic,
    queueName,
    worker,
  } = {}) {
    if (
      !stage ||
      !topic ||
      !queueName
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumer registration is incomplete"
        ),
        {
          code:
            "OUTBOX_CONSUMER_REGISTRATION_INVALID",

          stage:
            stage ||
            null,
        }
      );
    }

    this.assertWorker({
      stage,
      worker,
    });

    const handler =
      this.createHandler({
        stage,
        worker,
      });

    const resolvedQueueName =
      await this
        .queueService
        .consumeEvents(
          topic,
          queueName,
          handler,
          {
            prefetch:
              this.prefetch,
          }
        );

    return {
      stage,

      topic,

      queueName:
        resolvedQueueName ||
        queueName,
    };
  }

  // ==========================================================================
  // MESSAGE HANDLER
  // ==========================================================================

  createHandler({
    stage,
    worker,
  } = {}) {
    this.assertWorker({
      stage,
      worker,
    });

    return async (
      event = {}
    ) => {
      const job =
        this.buildWorkerJob({
          stage,
          event,
        });

      let result;

      try {
        /*
         * IMPORTANT:
         *
         * This remains the only place where the durable transport hands
         * control to the protected worker.
         *
         * The worker still owns:
         *
         * Execution:
         *   authorization
         *   immutable plan validation
         *   idempotency
         *
         * Verification:
         *   verification identity
         *   verification idempotency
         *
         * Lifecycle:
         *   lifecycle intent
         *   lifecycle idempotency
         */
        result =
          await worker
            .process(
              job
            );
      } catch (
        error
      ) {
        /*
         * DO NOT call event.nack() here.
         *
         * QueueService.consumeEvents() already catches this thrown error
         * and performs:
         *
         *   nack(
         *     message,
         *     false,
         *     error.retryable !== false
         *   )
         *
         * Re-throwing prevents double-NACK behavior.
         */
        throw error;
      }

      /*
       * A resolved worker call means this broker delivery has been safely
       * consumed.
       *
       * This can include:
       *
       * - successful first execution
       * - DUPLICATE_COMPLETED
       * - DUPLICATE_PROCESSING
       * - policy/manual/block outcomes represented as normal worker results
       *
       * Worker idempotency remains authoritative.
       */
      if (
        typeof event.ack !==
          "function"
      ) {
        throw Object.assign(
          new Error(
            "Workflow outbox consumer event does not provide ACK"
          ),
          {
            code:
              "OUTBOX_CONSUMER_ACK_REQUIRED",

            stage,

            retryable:
              false,
          }
        );
      }

      event.ack();

      return {
        acknowledged:
          true,

        stage,

        eventId:
          event.eventId ||
          null,

        correlationId:
          event.correlationId ||
          null,

        result,

        executionAuthorized:
          false,
      };
    };
  }

  // ==========================================================================
  // TRANSPORT EVENT -> WORKER JOB
  // ==========================================================================

  buildWorkerJob({
    stage,
    event,
  } = {}) {
    if (
      !event ||
      typeof event !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumer event is required"
        ),
        {
          code:
            "OUTBOX_CONSUMER_EVENT_REQUIRED",

          stage,

          retryable:
            false,
        }
      );
    }

    const payload =
      event.payload;

    if (
      !payload ||
      typeof payload !==
        "object" ||
      Array.isArray(
        payload
      )
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumer payload is required"
        ),
        {
          code:
            "OUTBOX_CONSUMER_PAYLOAD_REQUIRED",

          stage,

          retryable:
            false,
        }
      );
    }

    /*
     * ================================================================
     * AUTHORITY FIREWALL
     * ================================================================
     *
     * Even though producer + dispatcher + routing registry already
     * validate this, RabbitMQ content must still be considered untrusted.
     */
    if (
      payload.executionAuthorized ===
        true ||
      payload.authorizationGranted ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumer cannot receive execution authority"
        ),
        {
          code:
            "OUTBOX_UNSAFE_AUTHORITY",

          stage,

          retryable:
            false,
        }
      );
    }

    const organizationId =
      payload.organizationId ||
      event.tenantId ||
      null;

    const environmentId =
      payload.environmentId ||
      null;

    const incidentId =
      payload.incidentId ||
      null;

    for (
      const [
        field,
        value,
      ]
      of Object.entries({
        organizationId,
        environmentId,
        incidentId,
      })
    ) {
      if (
        !value
      ) {
        throw Object.assign(
          new Error(
            `Workflow outbox ${stage} consumer requires ${field}`
          ),
          {
            code:
              "OUTBOX_CONSUMER_SCOPE_REQUIRED",

            stage,

            field,

            /*
             * Bad durable messages must not requeue forever.
             */
            retryable:
              false,
          }
        );
      }
    }

    return {
      ...payload,

      organizationId,

      environmentId,

      incidentId,

      correlationId:
        payload.correlationId ||
        event.correlationId ||
        null,

      outboxEventId:
        payload.outboxEventId ||
        event.eventId ||
        null,

      workflowTopic:
        event.topic ||
        null,

      /*
       * Outbox transport is never an authorization source.
       */
      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // TRANSPORT VALIDATION
  // ==========================================================================

  assertTransportReady() {
    const queue =
      this.queueService;

    let ready =
      queue?.connected ===
      true;

    if (
      !ready &&
      typeof queue?.isConnected ===
        "function"
    ) {
      try {
        ready =
          queue.isConnected() ===
          true;
      } catch (
        error
      ) {
        ready =
          false;
      }
    }

    if (
      !ready
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox durable consumers require healthy queue transport"
        ),
        {
          code:
            "OUTBOX_CONSUMER_TRANSPORT_NOT_READY",
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // QUEUE CONTRACT
  // ==========================================================================

  assertQueueContract() {
    if (
      typeof this
        .queueService
        .consumeEvents !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox queue service does not support consumeEvents"
        ),
        {
          code:
            "OUTBOX_CONSUMER_QUEUE_CONTRACT_INVALID",
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // WORKER CONTRACT
  // ==========================================================================

  assertWorker({
    stage,
    worker,
  } = {}) {
    if (
      !worker ||
      typeof worker.process !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          `Workflow outbox ${stage} worker does not expose process()`
        ),
        {
          code:
            "OUTBOX_CONSUMER_WORKER_INVALID",

          stage,
        }
      );
    }

    return true;
  }

  // ==========================================================================
  // PREFETCH
  // ==========================================================================

  normalizePrefetch(
    value
  ) {
    const number =
      Number(
        value
      );

    if (
      !Number.isInteger(
        number
      ) ||
      number <
        1
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox consumer prefetch must be a positive integer"
        ),
        {
          code:
            "OUTBOX_CONSUMER_PREFETCH_INVALID",
        }
      );
    }

    /*
     * Hard upper bound prevents accidental massive workflow concurrency.
     */
    return Math.min(
      number,
      100
    );
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      started:
        this.started,

      registrations:
        [
          ...this.registrations,
        ],

      prefetch:
        this.prefetch,

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SAFE LOGGING
  // ==========================================================================

  safeLog(
    level,
    ...args
  ) {
    try {
      if (
        this.logger &&
        typeof this.logger[
          level
        ] ===
          "function"
      ) {
        this.logger[
          level
        ](
          ...args
        );
      }
    } catch (
      error
    ) {
      /*
       * Logging failures must not affect workflow delivery.
       */
    }
  }
}

/*
 * IMPORTANT:
 *
 * No singleton is exported here.
 *
 * This component requires the REAL queueService instance created during
 * server startup.
 *
 * server.js will explicitly construct:
 *
 * new WorkflowOutboxConsumerRegistry({
 *   queueService,
 *   ...
 * })
 *
 * in Phase 11.3.13D.
 */
module.exports = {
  WorkflowOutboxConsumerRegistry,
};