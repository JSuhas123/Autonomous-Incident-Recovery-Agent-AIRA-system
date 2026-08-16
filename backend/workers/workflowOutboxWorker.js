"use strict";

const os =
  require(
    "os"
  );

const workflowOutboxPersistenceService =
  require(
    "../services/workflowOutbox/workflowOutboxPersistenceService"
  );

const workflowOutboxDeliveryCoordinator =
  require(
    "../services/workflowOutbox/workflowOutboxDeliveryCoordinator"
  );



/*
 * ============================================================================
 * AIRA PHASE 11.3.8
 * WORKFLOW OUTBOX WORKER
 * ============================================================================
 *
 * Responsibilities:
 *
 * 1. Find durable workflow outbox events that are ready for delivery.
 * 2. Process events in bounded batches.
 * 3. Delegate delivery semantics to WorkflowOutboxDeliveryCoordinator.
 * 4. Preserve per-event isolation so one bad event does not stop the batch.
 * 5. Produce a deterministic batch summary.
 *
 * IMPORTANT:
 *
 * This worker DOES NOT:
 *
 * - execute infrastructure
 * - grant execution authorization
 * - classify retryable failures
 * - calculate backoff
 * - publish directly to RabbitMQ
 * - bypass protected downstream workers
 *
 * The flow remains:
 *
 * WorkflowOutboxWorker
 *        ↓
 * DeliveryCoordinator
 *        ↓
 * Dispatcher
 *        ↓
 * Existing Queue Publisher
 *        ↓
 * Protected Worker
 * ============================================================================
 */

class WorkflowOutboxWorker {
  constructor(
    options = {}
  ) {
    this.persistence =
      options.persistence ||
      workflowOutboxPersistenceService;

    this.deliveryCoordinator =
      options.deliveryCoordinator ||
      workflowOutboxDeliveryCoordinator;

    this.workerId =
      options.workerId ||
      [
        "workflow-outbox-worker",
        os.hostname(),
        process.pid,
      ].join(
        ":"
      );

    this.batchSize =
      this.normalizeBatchSize(
        options.batchSize ??
          25
      );

    this.now =
      options.now ||
      (() =>
        new Date());
  }

  // ==========================================================================
  // PROCESS BATCH
  // ==========================================================================

  async processBatch(
    options = {}
  ) {
    const now =
      this.normalizeDate(
        options.now ??
          this.now(),
        "now"
      );

    const limit =
      this.normalizeBatchSize(
        options.limit ??
          this.batchSize
      );

    const events =
      await this
        .persistence
        .findDeliverable({
          limit,
          now,
        });

    if (
      !Array.isArray(
        events
      )
    ) {
      throw Object.assign(
        new Error(
          "Workflow outbox persistence returned invalid deliverable result"
        ),
        {
          code:
            "OUTBOX_WORKER_DELIVERABLE_RESULT_INVALID",
        }
      );
    }

    const summary = {
      workerId:
        this.workerId,

      scanned:
        events.length,

      delivered:
        0,

      retryScheduled:
        0,

      deadLettered:
        0,

      skipped:
        0,

      failed:
        0,

      results:
        [],

      executionAuthorized:
        false,
    };

    /*
     * Process sequentially for now.
     *
     * This intentionally keeps delivery behavior conservative while
     * Phase 11.3 is being established.
     *
     * Horizontal scaling still works because publisher claims fence
     * concurrent workers across AIRA replicas.
     *
     * Controlled concurrency can be introduced later if needed.
     */
    for (
      const event
      of events
    ) {
      const result =
        await this
          .processEvent(
            event,
            {
              now,
            }
          );

      summary.results
        .push(
          result
        );

      if (
        result.delivered ===
        true
      ) {
        summary.delivered +=
          1;

        continue;
      }

      if (
        result.retryScheduled ===
        true
      ) {
        summary.retryScheduled +=
          1;

        continue;
      }

      if (
        result.deadLettered ===
        true
      ) {
        summary.deadLettered +=
          1;

        continue;
      }

      if (
        result.failed ===
        true
      ) {
        summary.failed +=
          1;

        continue;
      }

      summary.skipped +=
        1;
    }

    return summary;
  }

  // ==========================================================================
  // PROCESS ONE EVENT
  // ==========================================================================

  async processEvent(
    event,
    options = {}
  ) {
    if (
      !event ||
      typeof event !==
        "object"
    ) {
      return {
        processed:
          false,

        delivered:
          false,

        retryScheduled:
          false,

        deadLettered:
          false,

        failed:
          true,

        code:
          "OUTBOX_WORKER_EVENT_REQUIRED",

        executionAuthorized:
          false,
      };
    }

    const now =
      this.normalizeDate(
        options.now ??
          this.now(),
        "now"
      );

    try {
      const result =
        await this
          .deliveryCoordinator
          .deliver(
            event,
            {
              ownerId:
                this.workerId,

              now,
            }
          );

      return {
        processed:
          true,

        eventId:
          event.eventId ||
          null,

        eventType:
          event.eventType ||
          null,

        delivered:
          result
            ?.delivered ===
          true,

        retryScheduled:
          result
            ?.retryScheduled ===
          true,

        deadLettered:
          result
            ?.deadLettered ===
          true,

        skipped:
          (
            result
              ?.dispatched ===
              false &&
            result
              ?.delivered !==
              true &&
            result
              ?.retryScheduled !==
              true &&
            result
              ?.deadLettered !==
              true
          ),

        decision:
          result
            ?.decision ||
          null,

        result,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      /*
       * One malformed or unexpected event must not kill the entire
       * publisher batch.
       *
       * Known transport delivery failures should normally already be
       * converted by the DeliveryCoordinator into RETRY or DEAD_LETTER.
       *
       * Reaching here means the event failed outside that normal
       * delivery lifecycle.
       */
      return {
        processed:
          false,

        eventId:
          event.eventId ||
          null,

        eventType:
          event.eventType ||
          null,

        delivered:
          false,

        retryScheduled:
          false,

        deadLettered:
          false,

        failed:
          true,

        code:
          error?.code ||
          "OUTBOX_WORKER_EVENT_FAILED",

        error:
          error?.message ||
          "Workflow outbox event processing failed",

        executionAuthorized:
          false,
      };
    }
  }

  // ==========================================================================
  // PROCESS UNTIL EMPTY
  // ==========================================================================

  async drain(
    options = {}
  ) {
    const maxBatches =
      this.normalizeMaxBatches(
        options.maxBatches ??
          20
      );

    const limit =
      this.normalizeBatchSize(
        options.limit ??
          this.batchSize
      );

    const aggregate = {
      workerId:
        this.workerId,

      batches:
        0,

      scanned:
        0,

      delivered:
        0,

      retryScheduled:
        0,

      deadLettered:
        0,

      skipped:
        0,

      failed:
        0,

      executionAuthorized:
        false,
    };

    for (
      let index = 0;
      index <
      maxBatches;
      index += 1
    ) {
      const batch =
        await this
          .processBatch({
            limit,
            now:
              options.now ??
              this.now(),
          });

      aggregate.batches +=
        1;

      aggregate.scanned +=
        batch.scanned;

      aggregate.delivered +=
        batch.delivered;

      aggregate.retryScheduled +=
        batch.retryScheduled;

      aggregate.deadLettered +=
        batch.deadLettered;

      aggregate.skipped +=
        batch.skipped;

      aggregate.failed +=
        batch.failed;

      /*
       * No currently deliverable records remain.
       */
      if (
        batch.scanned ===
        0
      ) {
        break;
      }

      /*
       * If we received fewer than the requested limit, the current
       * scan has been exhausted.
       *
       * Events scheduled for future retry are intentionally not
       * considered ready yet.
       */
      if (
        batch.scanned <
        limit
      ) {
        break;
      }
    }

    return aggregate;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  normalizeBatchSize(
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
          "Workflow outbox batch size must be a positive integer"
        ),
        {
          code:
            "OUTBOX_WORKER_BATCH_SIZE_INVALID",
        }
      );
    }

    /*
     * Hard cap avoids accidentally loading an unbounded number of
     * durable events into one worker iteration.
     */
    return Math.min(
      number,
      500
    );
  }

  normalizeMaxBatches(
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
          "Workflow outbox maxBatches must be a positive integer"
        ),
        {
          code:
            "OUTBOX_WORKER_MAX_BATCHES_INVALID",
        }
      );
    }

    return Math.min(
      number,
      1000
    );
  }

  normalizeDate(
    value,
    field =
      "date"
  ) {
    const normalized =
      value instanceof Date
        ? new Date(
            value.getTime()
          )
        : new Date(
            value
          );

    if (
      Number.isNaN(
        normalized.getTime()
      )
    ) {
      throw Object.assign(
        new Error(
          `Workflow outbox worker ${field} must be a valid date`
        ),
        {
          code:
            "OUTBOX_WORKER_DATE_INVALID",

          field,
        }
      );
    }

    return normalized;
  }
}

module.exports =
  new WorkflowOutboxWorker();

module.exports
  .WorkflowOutboxWorker =
  WorkflowOutboxWorker;