"use strict";

const {
  RecoveryDecisionWorker,
} =
  require(
    "../../../workers/recoveryDecisionWorker"
  );

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function baseJob() {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    incidentId:
      "incident-1",

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      2,

    diagnosis: {
      diagnosisId:
        "diagnosis-1",

      revision:
        2,
    },

    executionAuthorized:
      false,
  };
}

describe(
  "RecoveryDecisionWorker Idempotency",
  () => {
    test(
      "wraps recovery decision in idempotent worker service",
      async () => {
        const lifecycleService = {
          run:
            jest.fn(
              async () => ({
                decision:
                  "NO_SAFE_ACTION",
              })
            ),
        };

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                return input
                  .handler();
              }
            ),
        };

        const worker =
          new RecoveryDecisionWorker({
            lifecycleService,
            idempotentWorker,
            workerId:
              "recovery-worker-test",
          });

        await worker.process(
          baseJob()
        );

        expect(
          idempotentWorker.run
        )
          .toHaveBeenCalledTimes(
            1
          );

        const call =
          idempotentWorker
            .run
            .mock
            .calls[0][0];

        expect(
          call.identity
        )
          .toMatchObject({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .RECOVERY_DECISION,

            incidentId:
              "incident-1",

            diagnosisId:
              "diagnosis-1",

            diagnosisRevision:
              2,
          });
      }
    );

    test(
      "existing recovery lifecycle runs inside idempotent handler",
      async () => {
        const lifecycleService = {
          run:
            jest.fn(
              async () => ({
                decision:
                  "NO_SAFE_ACTION",
              })
            ),
        };

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) =>
                input.handler()
            ),
        };

        const worker =
          new RecoveryDecisionWorker({
            lifecycleService,
            idempotentWorker,
          });

        await worker.process(
          baseJob()
        );

        expect(
          lifecycleService.run
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          lifecycleService.run
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                "org-1",

              incidentId:
                "incident-1",

              executionAuthorized:
                false,
            }),

            expect.any(
              Object
            )
          );
      }
    );

    test(
      "duplicate result from wrapper never invokes recovery lifecycle",
      async () => {
        const lifecycleService = {
          run:
            jest.fn(),
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

                previousResult: {
                  decision:
                    "NO_SAFE_ACTION",
                },

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new RecoveryDecisionWorker({
            lifecycleService,
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          lifecycleService.run
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.duplicate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "same diagnosis revision creates same logical identity",
      async () => {
        const calls =
          [];

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                calls.push(
                  input.identity
                );

                return {
                  executed:
                    false,
                };
              }
            ),
        };

        const worker =
          new RecoveryDecisionWorker({
            idempotentWorker,

            lifecycleService: {
              run:
                jest.fn(),
            },
          });

        await worker.process(
          baseJob()
        );

        await worker.process(
          baseJob()
        );

        expect(
          calls[0]
        )
          .toEqual(
            calls[1]
          );
      }
    );

    test(
      "new diagnosis revision changes recovery identity",
      async () => {
        const calls =
          [];

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                calls.push(
                  input.identity
                );

                return {
                  executed:
                    false,
                };
              }
            ),
        };

        const worker =
          new RecoveryDecisionWorker({
            idempotentWorker,

            lifecycleService: {
              run:
                jest.fn(),
            },
          });

        await worker.process(
          baseJob()
        );

        await worker.process({
          ...baseJob(),

          diagnosisRevision:
            3,

          diagnosis: {
            diagnosisId:
              "diagnosis-1",

            revision:
              3,
          },
        });

        expect(
          calls[0]
            .diagnosisRevision
        )
          .toBe(
            2
          );

        expect(
          calls[1]
            .diagnosisRevision
        )
          .toBe(
            3
          );
      }
    );

    test(
      "recovery decision worker never receives execution authorization",
      async () => {
        const worker =
          new RecoveryDecisionWorker({
            idempotentWorker: {
              run:
                jest.fn(),
            },
          });

        await expect(
          worker.process({
            ...baseJob(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_JOB_UNSAFE_INPUT",
          });
      }
    );
  }
);