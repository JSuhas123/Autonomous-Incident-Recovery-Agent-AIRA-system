"use strict";

const {
  WorkflowOutboxWorker,
} =
  require(
    "../../../workers/workflowOutboxWorker"
  );

describe(
  "WorkflowOutboxWorker",
  () => {
    const now =
      new Date(
        "2026-08-16T10:00:00.000Z"
      );

    let persistence;
    let deliveryCoordinator;
    let worker;

    function createEvent(
      id,
      overrides = {}
    ) {
      return {
        eventId:
          id,

        eventType:
          "LIFECYCLE_REQUESTED",

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    beforeEach(
      () => {
        persistence = {
          findDeliverable:
            jest.fn(),
        };

        deliveryCoordinator = {
          deliver:
            jest.fn(),
        };

        worker =
          new WorkflowOutboxWorker({
            persistence,

            deliveryCoordinator,

            workerId:
              "outbox-worker-1",

            batchSize:
              25,

            now:
              () =>
                new Date(
                  now
                ),
          });
      }
    );

    test(
      "processes empty batch safely",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue(
            []
          );

        const result =
          await worker
            .processBatch();

        expect(
          result.scanned
        )
          .toBe(
            0
          );

        expect(
          result.delivered
        )
          .toBe(
            0
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "scans deliverable events with bounded limit",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue(
            []
          );

        await worker
          .processBatch({
            limit:
              30,
          });

        expect(
          persistence
            .findDeliverable
        )
          .toHaveBeenCalledWith({
            limit:
              30,

            now:
              now,
          });
      }
    );

    test(
      "delivered event increments delivered count",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              true,

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          result.scanned
        )
          .toBe(
            1
          );

        expect(
          result.delivered
        )
          .toBe(
            1
          );

        expect(
          result.retryScheduled
        )
          .toBe(
            0
          );
      }
    );

    test(
      "retry result increments retry count",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              false,

            retryScheduled:
              true,

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          result.retryScheduled
        )
          .toBe(
            1
          );

        expect(
          result.delivered
        )
          .toBe(
            0
          );
      }
    );

    test(
      "dead-letter result increments dead-letter count",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            deadLettered:
              true,

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          result.deadLettered
        )
          .toBe(
            1
          );
      }
    );

    test(
      "claimed elsewhere event is counted as skipped",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            dispatched:
              false,

            delivered:
              false,

            decision:
              "LEASE_ACTIVE",

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          result.skipped
        )
          .toBe(
            1
          );

        expect(
          result.results[0]
            .decision
        )
          .toBe(
            "LEASE_ACTIVE"
          );
      }
    );

    test(
      "one failing event does not stop remaining batch",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),

            createEvent(
              "event-2"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockRejectedValueOnce(
            Object.assign(
              new Error(
                "Unexpected error"
              ),
              {
                code:
                  "UNEXPECTED_FAILURE",
              }
            )
          )
          .mockResolvedValueOnce({
            delivered:
              true,

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          deliveryCoordinator
            .deliver
        )
          .toHaveBeenCalledTimes(
            2
          );

        expect(
          result.failed
        )
          .toBe(
            1
          );

        expect(
          result.delivered
        )
          .toBe(
            1
          );
      }
    );

    test(
      "worker passes its owner identity to coordinator",
      async () => {
        const event =
          createEvent(
            "event-1"
          );

        persistence
          .findDeliverable
          .mockResolvedValue([
            event,
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              true,
          });

        await worker
          .processBatch();

        expect(
          deliveryCoordinator
            .deliver
        )
          .toHaveBeenCalledWith(
            event,
            {
              ownerId:
                "outbox-worker-1",

              now:
                now,
            }
          );
      }
    );

    test(
      "worker output never grants execution authorization",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              true,

            executionAuthorized:
              false,
          });

        const result =
          await worker
            .processBatch();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.results[0]
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects invalid batch size",
      () => {
        expect(
          () =>
            new WorkflowOutboxWorker({
              persistence,

              deliveryCoordinator,

              batchSize:
                0,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_WORKER_BATCH_SIZE_INVALID",
            })
          );
      }
    );

    test(
      "hard caps batch size",
      () => {
        const largeWorker =
          new WorkflowOutboxWorker({
            persistence,

            deliveryCoordinator,

            batchSize:
              5000,
          });

        expect(
          largeWorker
            .batchSize
        )
          .toBe(
            500
          );
      }
    );

    test(
      "drain stops when no events remain",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue(
            []
          );

        const result =
          await worker
            .drain({
              maxBatches:
                10,
            });

        expect(
          result.batches
        )
          .toBe(
            1
          );

        expect(
          persistence
            .findDeliverable
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "drain aggregates multiple batches",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValueOnce([
            createEvent(
              "event-1"
            ),

            createEvent(
              "event-2"
            ),
          ])
          .mockResolvedValueOnce(
            []
          );

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              true,
          });

        const result =
          await worker
            .drain({
              limit:
                2,

              maxBatches:
                10,
            });

        expect(
          result.batches
        )
          .toBe(
            2
          );

        expect(
          result.scanned
        )
          .toBe(
            2
          );

        expect(
          result.delivered
        )
          .toBe(
            2
          );
      }
    );

    test(
      "drain respects max batch safety bound",
      async () => {
        persistence
          .findDeliverable
          .mockResolvedValue([
            createEvent(
              "event-1"
            ),
          ]);

        deliveryCoordinator
          .deliver
          .mockResolvedValue({
            delivered:
              true,
          });

        const result =
          await worker
            .drain({
              limit:
                1,

              maxBatches:
                3,
            });

        expect(
          result.batches
        )
          .toBe(
            3
          );

        expect(
          persistence
            .findDeliverable
        )
          .toHaveBeenCalledTimes(
            3
          );
      }
    );
  }
);