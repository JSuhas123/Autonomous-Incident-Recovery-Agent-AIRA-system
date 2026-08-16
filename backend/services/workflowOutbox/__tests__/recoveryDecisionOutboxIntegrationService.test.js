"use strict";

const {
  RecoveryDecisionOutboxIntegrationService,
} =
  require(
    "../recoveryDecisionOutboxIntegrationService"
  );

describe(
  "RecoveryDecisionOutboxIntegrationService",
  () => {
    let handoff;
    let service;

    beforeEach(
      () => {
        handoff = {
          createExecutionRequestReady:
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
          new RecoveryDecisionOutboxIntegrationService({
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

        diagnosisId:
          "diagnosis-1",

        diagnosisRevision:
          2,

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function result(
      overrides = {}
    ) {
      return {
        recoveryDecision: {
          recoveryDecisionId:
            "decision-1",

          selectedPlaybookId:
            "playbook-1",
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

        ...overrides,
      };
    }

    test(
      "creates durable handoff from recovery result",
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
          output.executionRequestId
        )
          .toBe(
            "execution-request-1"
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
      "passes exact immutable execution identity",
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
            .createExecutionRequestReady
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                "org-1",

              environmentId:
                "prod",

              incidentId:
                "incident-1",

              recoveryDecisionId:
                "decision-1",

              executionRequestId:
                "execution-request-1",

              executionPlanId:
                "plan-1",

              executionPlanHash:
                "hash-1",

              authorizationId:
                "authorization-1",

              selectedPlaybookId:
                "playbook-1",
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
              job(),

            result: {
              recoveryDecision: {
                recoveryDecisionId:
                  "decision-1",
              },

              executionRequest: {
                executionRequestId:
                  "execution-request-1",

                recoveryDecisionId:
                  "decision-1",

                executionPlan: {
                  planId:
                    "plan-2",

                  planHash:
                    "hash-2",
                },
              },
            },
          });

        expect(
          handoff
            .createExecutionRequestReady
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              executionPlanId:
                "plan-2",

              executionPlanHash:
                "hash-2",
            })
          );
      }
    );

    test(
      "supports flattened execution result identity",
      async () => {
        const output =
          await service
            .createFromResult({
              job:
                job({
                  recoveryDecisionId:
                    "decision-flat",
                }),

              result: {
                executionRequestId:
                  "request-flat",

                recoveryDecisionId:
                  "decision-flat",

                executionPlanId:
                  "plan-flat",

                executionPlanHash:
                  "hash-flat",
              },
            });

        expect(
          output.executionRequestId
        )
          .toBe(
            "request-flat"
          );
      }
    );

    test(
      "no execution request means no handoff",
      async () => {
        const output =
          await service
            .createFromResult({
              job:
                job(),

              result: {
                recoveryDecision: {
                  recoveryDecisionId:
                    "decision-1",

                  outcome:
                    "MANUAL_INTERVENTION",
                },
              },
            });

        expect(
          output.handoffCreated
        )
          .toBe(
            false
          );

        expect(
          output.required
        )
          .toBe(
            false
          );

        expect(
          output.reason
        )
          .toBe(
            "NO_EXECUTION_REQUEST"
          );

        expect(
          handoff
            .createExecutionRequestReady
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "missing plan hash fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job(),

              result: {
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
                },
              },
            })
        )
          .rejects
          .toMatchObject({
            code:
              "RECOVERY_DECISION_OUTBOX_EXECUTION_IDENTITY_REQUIRED",

            field:
              "executionPlanHash",
          });
      }
    );

    test(
      "missing recovery decision identity fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job(),

              result: {
                executionRequest: {
                  executionRequestId:
                    "execution-request-1",

                  executionPlanId:
                    "plan-1",

                  executionPlanHash:
                    "hash-1",
                },
              },
            })
        )
          .rejects
          .toMatchObject({
            field:
              "recoveryDecisionId",
          });
      }
    );

    test(
      "never accepts execution authority from recovery job",
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
      "duplicate outbox handoff remains successful",
      async () => {
        handoff
          .createExecutionRequestReady
          .mockResolvedValue({
            persisted:
              true,

            created:
              false,

            duplicate:
              true,

            raced:
              false,

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
  }
);