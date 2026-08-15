"use strict";

const {
  LifecycleWorker,
} =
  require(
    "../../../workers/lifecycleWorker"
  );

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function baseJob(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    verificationId:
      "verification-1",

    lifecycleIntent:
      "PROCESS_VERIFICATION_OUTCOME",

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "LifecycleWorker Idempotency",
  () => {
    test(
      "uses LIFECYCLE idempotency identity",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_PROCESSING",

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,

            workerId:
              "lifecycle-test",
          });

        await worker.process(
          baseJob()
        );

        const input =
          idempotentWorker
            .run
            .mock
            .calls[0][0];

        expect(
          input.identity
        )
          .toEqual({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .LIFECYCLE,

            incidentId:
              "incident-1",

            verificationId:
              "verification-1",

            lifecycleIntent:
              "PROCESS_VERIFICATION_OUTCOME",
          });
      }
    );

    test(
      "duplicate processing never runs lifecycle body",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_PROCESSING",

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        worker.processLifecycle =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker.processLifecycle
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.lifecyclePerformed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate completed returns previous lifecycle outcome",
      async () => {
        const previousResult = {
          type:
            "STABILITY_STARTED",
        };

        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",

                previousResult,

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        worker.processLifecycle =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker.processLifecycle
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.previousResult
        )
          .toEqual(
            previousResult
          );

        expect(
          result.success
        )
          .toBe(
            true
          );
      }
    );

    test(
      "acquired claim runs Phase 10 lifecycle once",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => ({
                executed:
                  true,

                duplicate:
                  false,

                decision:
                  "ACQUIRED",

                result:
                  await input.handler(),

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        worker.processLifecycle =
          jest.fn(
            async () => ({
              type:
                "STABILITY_STARTED",
            })
          );

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker.processLifecycle
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.lifecyclePerformed
        )
          .toBe(
            true
          );

        expect(
          result.result.type
        )
          .toBe(
            "STABILITY_STARTED"
          );
      }
    );

    test(
      "different lifecycle intent produces different identity",
      async () => {
        const identities =
          [];

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                identities.push(
                  input.identity
                );

                return {
                  executed:
                    false,

                  decision:
                    "DUPLICATE_PROCESSING",

                  executionAuthorized:
                    false,
                };
              }
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        await worker.process(
          baseJob({
            lifecycleIntent:
              "BEGIN_STABILITY",
          })
        );

        await worker.process(
          baseJob({
            lifecycleIntent:
              "FINALIZE_CLOSURE",
          })
        );

        expect(
          identities[0]
            .lifecycleIntent
        )
          .toBe(
            "BEGIN_STABILITY"
          );

        expect(
          identities[1]
            .lifecycleIntent
        )
          .toBe(
            "FINALIZE_CLOSURE"
          );

        expect(
          identities[0]
        )
          .not
          .toEqual(
            identities[1]
          );
      }
    );

    test(
      "same verification and intent creates same logical identity",
      async () => {
        const identities =
          [];

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                identities.push(
                  input.identity
                );

                return {
                  executed:
                    false,

                  decision:
                    "DUPLICATE_PROCESSING",
                };
              }
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        await worker.process(
          baseJob()
        );

        await worker.process(
          baseJob()
        );

        expect(
          identities[0]
        )
          .toEqual(
            identities[1]
          );
      }
    );

    test(
      "requires verification id",
      async () => {
        const worker =
          new LifecycleWorker({
            idempotentWorker: {
              run:
                jest.fn(),
            },
          });

        await expect(
          worker.process(
            baseJob({
              verificationId:
                null,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_JOB_VERIFICATION_REQUIRED",
          });
      }
    );

    test(
      "wrapper never starts retry rollback or execution itself",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.recoveryStarted
        )
          .toBe(
            false
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "wrapper never exposes execution authorization",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",
              })
            ),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
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
      "unsafe lifecycle job is rejected before idempotency processing",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(),
        };

        const worker =
          new LifecycleWorker({
            idempotentWorker,
          });

        await expect(
          worker.process(
            baseJob({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_JOB_UNSAFE_INPUT",
          });

        expect(
          idempotentWorker.run
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);