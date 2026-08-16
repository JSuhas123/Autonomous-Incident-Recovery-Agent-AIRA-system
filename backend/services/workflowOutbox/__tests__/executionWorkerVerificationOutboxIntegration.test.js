"use strict";

const {
  ExecutionWorker,
} =
  require(
    "../../../workers/executionWorker"
  );

describe(
  "ExecutionWorker Phase 11.3 verification outbox integration",
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

        executionRequestId:
          "execution-request-1",

        executionPlanId:
          "plan-1",

        executionPlanHash:
          "hash-1",

        authorizationId:
          "authorization-1",

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function successfulExecutionResult(
      overrides = {}
    ) {
      return {
        processed:
          true,

        success:
          true,

        executionPerformed:
          true,

        executionRequestId:
          "execution-request-1",

        executionPlanId:
          "plan-1",

        executionPlanHash:
          "hash-1",

        verificationRequestId:
          "verification-request-1",

        ...overrides,
      };
    }

    test(
      "successful protected execution creates durable verification handoff",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockResolvedValue({
                handoffCreated:
                  true,

                persisted:
                  true,

                eventId:
                  "outbox-1",

                verificationRequestId:
                  "verification-request-1",

                executionAuthorized:
                  false,
              }),
        };

        const worker =
          new ExecutionWorker({
            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processAuthorizedExecution =
          jest.fn()
            .mockResolvedValue(
              successfulExecutionResult()
            );

        const result =
          await worker
            .processAuthorizedExecutionWithDurableHandoff(
              createJob()
            );

        expect(
          worker
            .processAuthorizedExecution
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          outboxIntegration
            .createFromResult
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
                  executionRequestId:
                    "execution-request-1",

                  executionPlanId:
                    "plan-1",

                  executionPlanHash:
                    "hash-1",

                  executionAuthorized:
                    false,
                }),

              result:
                expect.objectContaining({
                  executionPerformed:
                    true,
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
      "outbox disabled preserves protected execution path",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn(),
        };

        const worker =
          new ExecutionWorker({
            outboxEnabled:
              false,

            outboxIntegration,
          });

        worker
          .processAuthorizedExecution =
          jest.fn()
            .mockResolvedValue(
              successfulExecutionResult()
            );

        const result =
          await worker
            .processAuthorizedExecutionWithDurableHandoff(
              createJob()
            );

        expect(
          worker
            .processAuthorizedExecution
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          outboxIntegration
            .createFromResult
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.outboxHandoff
        )
          .toBeNull();

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed execution is delegated to integration without inventing verification",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockResolvedValue({
                handoffCreated:
                  false,

                required:
                  false,

                reason:
                  "EXECUTION_NOT_SUCCESSFUL",

                executionAuthorized:
                  false,
              }),
        };

        const worker =
          new ExecutionWorker({
            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processAuthorizedExecution =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              success:
                false,

              executionPerformed:
                false,

              executionRequestId:
                "execution-request-1",

              executionAuthorized:
                false,
            });

        const result =
          await worker
            .processAuthorizedExecutionWithDurableHandoff(
              createJob()
            );

        expect(
          result.outboxHandoff
            .handoffCreated
        )
          .toBe(
            false
          );

        expect(
          result.outboxHandoff
            .reason
        )
          .toBe(
            "EXECUTION_NOT_SUCCESSFUL"
          );
      }
    );


    test(
      "outbox persistence failure is not swallowed after execution",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "Temporary database failure"
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
          new ExecutionWorker({
            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker
          .processAuthorizedExecution =
          jest.fn()
            .mockResolvedValue(
              successfulExecutionResult()
            );

        await expect(
          worker
            .processAuthorizedExecutionWithDurableHandoff(
              createJob()
            )
        )
          .rejects
          .toMatchObject({
            code:
              "DATABASE_TEMPORARY_FAILURE",

            retryable:
              true,
          });

        expect(
          worker
            .processAuthorizedExecution
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "durable handoff can never expose reusable execution authority",
      async () => {
        const worker =
          new ExecutionWorker({
            outboxEnabled:
              true,

            outboxIntegration: {
              createFromResult:
                jest.fn()
                  .mockResolvedValue({
                    handoffCreated:
                      true,

                    executionAuthorized:
                      false,
                  }),
            },
          });

        worker
          .processAuthorizedExecution =
          jest.fn()
            .mockResolvedValue(
              successfulExecutionResult({
                /*
                 * Even if an internal execution result happened to contain
                 * this flag, the workflow boundary must clear it.
                 */
                executionAuthorized:
                  true,
              })
            );

        const result =
          await worker
            .processAuthorizedExecutionWithDurableHandoff(
              createJob()
            );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.outboxHandoff
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);