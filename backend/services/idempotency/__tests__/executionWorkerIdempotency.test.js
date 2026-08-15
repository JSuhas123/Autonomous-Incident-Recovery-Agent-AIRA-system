"use strict";

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

describe(
  "Execution Worker Idempotency",
  () => {
    let ExecutionWorker;

    beforeAll(
      () => {
        ({
          ExecutionWorker,
        } =
          require(
            "../../../workers/executionWorker"
          ));
      }
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

        recoveryDecisionId:
          "recovery-1",

        executionRequestId:
          "execution-1",

        authorizationId:
          "auth-1",

        executionPlanId:
          "plan-1",

        executionPlanHash:
          "planhash-1",

        executionPlan: {
          planId:
            "plan-1",

          planHash:
            "planhash-1",
        },

        /*
         * Do not set this to true at the outer Phase 11 wrapper.
         * Existing Phase 8 logic should load/validate authorization itself.
         */
        executionAuthorized:
          false,

        ...overrides,
      };
    }

    test(
      "uses EXECUTION idempotency identity",
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
          new ExecutionWorker({
            idempotentWorker,

            workerId:
              "execution-test",
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
                .EXECUTION,

            executionRequestId:
              "execution-1",

            executionPlanId:
              "plan-1",

            executionPlanHash:
              "planhash-1",
          });
      }
    );

    test(
      "duplicate processing never invokes execution handler",
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
          new ExecutionWorker({
            idempotentWorker,
          });

        worker.processAuthorizedExecution =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker
            .processAuthorizedExecution
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.executionPerformed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate completed returns previous result without execution",
      async () => {
        const previousResult = {
          success:
            true,

          executionId:
            "exec-result-1",
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
          new ExecutionWorker({
            idempotentWorker,
          });

        worker.processAuthorizedExecution =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker
            .processAuthorizedExecution
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.previousResult
        )
          .toEqual(
            previousResult
          );
      }
    );

    test(
      "acquired claim invokes existing Phase 8 logic once",
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
          new ExecutionWorker({
            idempotentWorker,
          });

        worker.processAuthorizedExecution =
          jest.fn(
            async () => ({
              success:
                true,
            })
          );

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker
            .processAuthorizedExecution
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.executionPerformed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "plan hash participates in logical identity",
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
          new ExecutionWorker({
            idempotentWorker,
          });

        await worker.process(
          baseJob()
        );

        await worker.process(
          baseJob({
            executionPlanHash:
              "planhash-2",

            executionPlan: {
              planId:
                "plan-1",

              planHash:
                "planhash-2",
            },
          })
        );

        expect(
          identities[0]
            .executionPlanHash
        )
          .not
          .toBe(
            identities[1]
              .executionPlanHash
          );
      }
    );

    test(
      "missing immutable plan identity is rejected",
      async () => {
        const worker =
          new ExecutionWorker({
            idempotentWorker: {
              run:
                jest.fn(),
            },
          });

        await expect(
          worker.process(
            baseJob({
              executionPlanHash:
                null,

              executionPlan: {},
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_JOB_IDENTITY_REQUIRED",
          });
      }
    );

    test(
      "outer idempotency result never exposes reusable authorization",
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
          new ExecutionWorker({
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
  }
);