"use strict";

const {
  VerificationWorker,
} =
  require(
    "../../../workers/verificationWorker"
  );

describe(
  "VerificationWorker Phase 11.3 lifecycle outbox integration",
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

        verificationPlanId:
          "verification-plan-1",

        verificationPlanHash:
          "verification-hash-1",

        verificationPlan: {
          planId:
            "verification-plan-1",

          planHash:
            "verification-hash-1",
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function verificationResult(
      overrides = {}
    ) {
      return {
        processed:
          true,

        blocked:
          false,

        executionRequestId:
          "execution-request-1",

        verificationId:
          "verification-1",

        verificationStarted:
          true,

        verificationPlan: {
          planId:
            "verification-plan-1",

          planHash:
            "verification-hash-1",
        },

        decision: {
          outcome:
            "RECOVERED",
        },

        persisted: {
          verificationId:
            "verification-1",
        },

        retryStarted:
          false,

        rollbackStarted:
          false,

        incidentClosed:
          false,

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    test(
      "successful verification creates durable lifecycle handoff",
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

                executionAuthorized:
                  false,
              }),
        };

        const worker =
          new VerificationWorker({
            idempotencyEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker.processVerification =
          jest.fn()
            .mockResolvedValue(
              verificationResult()
            );

        const result =
          await worker
            .process(
              createJob()
            );

        expect(
          worker.processVerification
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
                  verificationId:
                    "verification-1",
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
      "blocked verification does not create lifecycle handoff",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn(),
        };

        const worker =
          new VerificationWorker({
            idempotencyEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker.processVerification =
          jest.fn()
            .mockResolvedValue({
              processed:
                true,

              blocked:
                true,

              verificationStarted:
                false,

              executionRequestId:
                "execution-request-1",

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
          result.outboxHandoff
        )
          .toMatchObject({
            handoffCreated:
              false,

            reason:
              "VERIFICATION_NOT_COMPLETED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "outbox disabled preserves legacy verification behavior",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn(),
        };

        const worker =
          new VerificationWorker({
            idempotencyEnabled:
              false,

            outboxEnabled:
              false,

            outboxIntegration,
          });

        worker.processVerification =
          jest.fn()
            .mockResolvedValue(
              verificationResult()
            );

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
      "completed duplicate can reconstruct missing lifecycle handoff",
      async () => {
        const previousResult =
          verificationResult();

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

        const idempotentWorker = {
          run:
            jest.fn()
              .mockResolvedValue({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",

                idempotencyKey:
                  "verification-key",

                previousResult,
              }),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,

            idempotencyEnabled:
              true,

            outboxEnabled:
              true,

            outboxIntegration,
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
          result.duplicate
        )
          .toBe(
            true
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
      "active duplicate does not create lifecycle handoff",
      async () => {
        const outboxIntegration = {
          createFromResult:
            jest.fn(),
        };

        const idempotentWorker = {
          run:
            jest.fn()
              .mockResolvedValue({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_PROCESSING",

                idempotencyKey:
                  "verification-key",
              }),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,

            idempotencyEnabled:
              true,

            outboxEnabled:
              true,

            outboxIntegration,
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
          result.idempotencyDecision
        )
          .toBe(
            "DUPLICATE_PROCESSING"
          );
      }
    );


    test(
      "outbox persistence failure is not silently swallowed",
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
          new VerificationWorker({
            idempotencyEnabled:
              false,

            outboxEnabled:
              true,

            outboxIntegration,
          });

        worker.processVerification =
          jest.fn()
            .mockResolvedValue(
              verificationResult()
            );

        await expect(
          worker.process(
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
      }
    );


    test(
      "verification workflow never exposes execution authorization",
      async () => {
        const worker =
          new VerificationWorker({
            idempotencyEnabled:
              false,

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

        worker.processVerification =
          jest.fn()
            .mockResolvedValue(
              verificationResult({
                executionAuthorized:
                  true,
              })
            );

        const result =
          await worker
            .process(
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