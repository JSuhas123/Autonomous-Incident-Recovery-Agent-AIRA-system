"use strict";

const {
  RecoveryDecisionWorker,
} =
  require(
    "../../../workers/recoveryDecisionWorker"
  );

describe(
  "RecoveryDecisionWorker Phase 11.3 Outbox Integration",
  () => {
    function createJob(
      overrides = {}
    ) {
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
          1,

        diagnosis: {
          diagnosisId:
            "diagnosis-1",

          revision:
            1,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function businessResult() {
      return {
        recoveryDecision: {
          recoveryDecisionId:
            "decision-1",
        },

        executionRequest: {
          executionRequestId:
            "execution-request-1",

          recoveryDecisionId:
            "decision-1",

          executionPlanId:
            "plan-1",

          executionPlanHash:
            "hash-1",

          authorizationId:
            "authorization-1",
        },
      };
    }

    test(
      "successful recovery processing creates durable outbox handoff",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockResolvedValue({
                handoffCreated:
                  true,

                eventId:
                  "outbox-1",

                executionAuthorized:
                  false,
              }),
        };

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpointEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processWithIdempotency =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              success:
                true,

              result:
                businessResult(),

              executionAuthorized:
                false,
            });

        const result =
          await worker
            .process(
              createJob()
            );

        expect(
          worker
            .processWithIdempotency
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          outboxIntegration
            .createFromResult
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              job:
                expect.objectContaining({
                  organizationId:
                    "org-1",

                  environmentId:
                    "prod",

                  incidentId:
                    "incident-1",

                  executionAuthorized:
                    false,
                }),

              result:
                expect.objectContaining({
                  executionRequest:
                    expect.objectContaining({
                      executionRequestId:
                        "execution-request-1",
                    }),
                }),
            })
          );

        expect(
          result.outboxHandoff
            .handoffCreated
        )
          .toBe(
            true
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
      "duplicate completed recovery can recreate missing durable handoff",
      async () => {
        const previousResult =
          businessResult();

        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockResolvedValue({
                handoffCreated:
                  true,

                created:
                  true,

                executionAuthorized:
                  false,
              }),
        };

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpointEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processWithIdempotency =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              success:
                true,

              duplicate:
                true,

              idempotencyDecision:
                "DUPLICATE_COMPLETED",

              previousResult,

              executionAuthorized:
                false,
            });

        const result =
          await worker
            .process(
              createJob()
            );

        expect(
          outboxIntegration
            .createFromResult
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              result:
                previousResult,
            })
          );

        expect(
          result.outboxHandoff
            .handoffCreated
        )
          .toBe(
            true
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
      "outbox disabled preserves existing worker behavior",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn(),
        };

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpointEnabled:
              false,

            outboxEnabled:
              false,

            outboxIntegration,
          });

        worker
          .processWithIdempotency =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              success:
                true,

              result:
                businessResult(),

              executionAuthorized:
                false,
            });

        const result =
          await worker
            .process(
              createJob()
            );

        expect(
          outboxIntegration
            .createFromResult
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "recovery job can never use outbox to grant execution authority",
      async () => {
        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpointEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration: {
              createFromResult:
                jest.fn(),
            },
          });

        await expect(
          worker.process(
            createJob({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_JOB_UNSAFE_INPUT",
          });
      }
    );


    test(
      "outbox persistence failure fails recovery stage instead of silently losing handoff",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "Mongo unavailable"
                  ),
                  {
                    code:
                      "DATABASE_TEMPORARY_FAILURE",

                    retryable:
                      true,
                  }
                )
              ),
        };

        const worker =
          new RecoveryDecisionWorker({
            runtimeCheckpointEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processWithIdempotency =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              success:
                true,

              result:
                businessResult(),

              executionAuthorized:
                false,
            });

        await expect(
          worker.process(
            createJob()
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DATABASE_TEMPORARY_FAILURE",
          });
      }
    );
  }
);