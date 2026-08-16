"use strict";

const {
  VerificationLifecycleOutboxIntegrationService,
} =
  require(
    "../verificationLifecycleOutboxIntegrationService"
  );

describe(
  "VerificationLifecycleOutboxIntegrationService",
  () => {
    let handoff;
    let service;

    beforeEach(
      () => {
        handoff = {
          createLifecycleRequested:
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
          new VerificationLifecycleOutboxIntegrationService({
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

        verificationPlanId:
          "verification-plan-1",

        verificationPlanHash:
          "verification-hash-1",

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    function result(
      overrides = {}
    ) {
      return {
        executionRequestId:
          "execution-request-1",

        verificationId:
          "verification-1",

        verificationPlanId:
          "verification-plan-1",

        verificationPlanHash:
          "verification-hash-1",

        verificationOutcome: {
          outcome:
            "RECOVERED",

          confidence:
            0.97,
        },

        ...overrides,
      };
    }

    test(
      "creates durable lifecycle handoff",
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
          output.verificationId
        )
          .toBe(
            "verification-1"
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
      "passes immutable verification identity",
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
            .createLifecycleRequested
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

              verificationId:
                "verification-1",

              verificationPlanId:
                "verification-plan-1",

              verificationPlanHash:
                "verification-hash-1",

              verificationOutcome: {
                outcome:
                  "RECOVERED",

                confidence:
                  0.97,
              },
            })
          );
      }
    );


    test(
      "supports nested verification plan",
      async () => {
        await service
          .createFromResult({
            job:
              job({
                verificationPlanId:
                  null,

                verificationPlanHash:
                  null,
              }),

            result: {
              executionRequestId:
                "execution-request-1",

              verificationId:
                "verification-1",

              verificationPlan: {
                planId:
                  "nested-plan",

                planHash:
                  "nested-hash",
              },

              outcome:
                "RECOVERED",
            },
          });

        expect(
          handoff
            .createLifecycleRequested
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              verificationPlanId:
                "nested-plan",

              verificationPlanHash:
                "nested-hash",
            })
          );
      }
    );


    test(
      "string outcome becomes structured outcome",
      async () => {
        await service
          .createFromResult({
            job:
              job(),

            result:
              result({
                verificationOutcome:
                  undefined,

                outcome:
                  "REGRESSION",
              }),
          });

        expect(
          handoff
            .createLifecycleRequested
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              verificationOutcome: {
                outcome:
                  "REGRESSION",
              },
            })
          );
      }
    );


    test(
      "missing verification result creates no handoff",
      async () => {
        const output =
          await service
            .createFromResult({
              job:
                job(),

              result: {
                processed:
                  true,
              },
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
            "NO_VERIFICATION_RESULT"
          );

        expect(
          handoff
            .createLifecycleRequested
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "missing verification id fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job(),

              result:
                result({
                  verificationId:
                    null,
                }),
            })
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_LIFECYCLE_OUTBOX_IDENTITY_REQUIRED",

            field:
              "verificationId",
          });
      }
    );


    test(
      "missing verification plan hash fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job({
                  verificationPlanHash:
                    null,
                }),

              result:
                result({
                  verificationPlanHash:
                    null,
                }),
            })
        )
          .rejects
          .toMatchObject({
            field:
              "verificationPlanHash",
          });
      }
    );


    test(
      "missing verification outcome fails closed",
      async () => {
        await expect(
          service
            .createFromResult({
              job:
                job(),

              result:
                result({
                  verificationOutcome:
                    null,

                  outcome:
                    null,
                }),
            })
        )
          .rejects
          .toMatchObject({
            field:
              "verificationOutcome",
          });
      }
    );


    test(
      "duplicate lifecycle handoff remains successful",
      async () => {
        handoff
          .createLifecycleRequested
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
      "job carrying execution authorization is rejected",
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
  }
);