"use strict";

const {
  ExecutionVerificationOutboxIntegrationService,
} =
  require(
    "../executionVerificationOutboxIntegrationService"
  );

describe(
  "ExecutionVerificationOutboxIntegrationService",
  () => {
    let handoff;
    let service;

    beforeEach(
      () => {
        handoff = {
          createVerificationRequested:
            jest.fn()
              .mockResolvedValue({
                persisted:
                  true,

                created:
                  true,

                duplicate:
                  false,

                raced:
                  false,

                eventId:
                  "outbox-event-1",

                eventKey:
                  "outbox-key-1",

                executionAuthorized:
                  false,
              }),
        };

        service =
          new ExecutionVerificationOutboxIntegrationService({
            handoff,
          });
      }
    );

    function job(
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

        recoveryDecisionId:
          "decision-1",

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function result(
      overrides = {}
    ) {
      return {
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
      "creates durable verification handoff for successful execution",
      async () => {
        const output =
          await service
            .createFromResult({
              job:
                job(),

              result:
                result(),
            });

        expect(
          output.handoffCreated
        )
          .toBe(
            true
          );

        expect(
          output.verificationRequestId
        )
          .toBe(
            "verification-request-1"
          );

        expect(
          output.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "passes immutable execution identity to handoff",
      async () => {
        await service
          .createFromResult({
            job:
              job(),

            result:
              result(),
          });

        expect(
          handoff
            .createVerificationRequested
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
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

              verificationRequestId:
                "verification-request-1",

              authorizationId:
                "authorization-1",

              recoveryDecisionId:
                "decision-1",
            })
          );
      }
    );

    test(
      "supports nested execution plan identity",
      async () => {
        await service
          .createFromResult({
            job:
              job({
                executionPlanId:
                  null,

                executionPlanHash:
                  null,
              }),

            result: {
              success:
                true,

              executionPerformed:
                true,

              executionRequestId:
                "execution-request-1",

              verificationRequestId:
                "verification-request-1",

              executionPlan: {
                planId:
                  "nested-plan",

                planHash:
                  "nested-hash",
              },
            },
          });

        expect(
          handoff
            .createVerificationRequested
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionPlanId:
                "nested-plan",

              executionPlanHash:
                "nested-hash",
            })
          );
      }
    );

    test(
      "unsuccessful execution creates no verification handoff",
      async () => {
        const output =
          await service
            .createFromResult({
              job:
                job(),

              result:
                result({
                  success:
                    false,

                  executionPerformed:
                    false,
                }),
            });

        expect(
          output.handoffCreated
        )
          .toBe(
            false
          );

        expect(
          output.reason
        )
          .toBe(
            "EXECUTION_NOT_SUCCESSFUL"
          );

        expect(
          handoff
            .createVerificationRequested
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "missing verification request id fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job(),

              result:
                result({
                  verificationRequestId:
                    null,
                }),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_VERIFICATION_OUTBOX_IDENTITY_REQUIRED",

            field:
              "verificationRequestId",
          });
      }
    );

    test(
      "missing immutable plan hash fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job({
                  executionPlanHash:
                    null,
                }),

              result:
                result({
                  executionPlanHash:
                    null,
                }),
            })
        )
          .rejects
          .toMatchObject({
            field:
              "executionPlanHash",
          });
      }
    );

    test(
      "duplicate outbox handoff remains successful",
      async () => {
        handoff
          .createVerificationRequested
          .mockResolvedValue({
            persisted:
              true,

            created:
              false,

            duplicate:
              true,

            eventId:
              "existing-event",

            eventKey:
              "existing-key",
          });

        const output =
          await service
            .createFromResult({
              job:
                job(),

              result:
                result(),
            });

        expect(
          output.handoffCreated
        )
          .toBe(
            true
          );

        expect(
          output.duplicate
        )
          .toBe(
            true
          );

        expect(
          output.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "job carrying execution authority is rejected",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job({
                  executionAuthorized:
                    true,
                }),

              result:
                result(),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "OUTBOX_UNSAFE_AUTHORITY",
          });
      }
    );

    test(
      "correlation defaults safely to execution request",
      async () => {
        await service
          .createFromResult({
            job:
              job({
                correlationId:
                  null,
              }),

            result:
              result({
                correlationId:
                  null,
              }),
          });

        expect(
          handoff
            .createVerificationRequested
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              correlationId:
                "execution-request-1",
            })
          );
      }
    );
  }
);