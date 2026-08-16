"use strict";

const {
  VerificationLifecycleOutboxHandoffService,
  EVENT_TYPE,
} =
  require(
    "../verificationLifecycleOutboxHandoffService"
  );

describe(
  "VerificationLifecycleOutboxHandoffService",
  () => {
    let outbox;
    let service;

    beforeEach(
      () => {
        outbox = {
          createOrGet:
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

                event: {
                  eventId:
                    "outbox-event-1",
                },
              }),
        };

        service =
          new VerificationLifecycleOutboxHandoffService({
            outbox,
          });
      }
    );

    function input(
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
            0.98,
        },

        correlationId:
          "correlation-1",

        ...overrides,
      };
    }

    test(
      "creates durable lifecycle handoff",
      async () => {
        const result =
          await service
            .createLifecycleRequested(
              input()
            );

        expect(
          result.persisted
        )
          .toBe(
            true
          );

        expect(
          result.created
        )
          .toBe(
            true
          );

        expect(
          result.eventType
        )
          .toBe(
            EVENT_TYPE
          );

        expect(
          result.verificationId
        )
          .toBe(
            "verification-1"
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
      "persists immutable verification identity",
      async () => {
        await service
          .createLifecycleRequested(
            input()
          );

        expect(
          outbox.createOrGet
        )
          .toHaveBeenCalledTimes(
            1
          );

        const persisted =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          persisted.eventType
        )
          .toBe(
            "LIFECYCLE_REQUESTED"
          );

        expect(
          persisted.aggregateType
        )
          .toBe(
            "VERIFICATION"
          );

        expect(
          persisted.aggregateId
        )
          .toBe(
            "verification-1"
          );

        expect(
          persisted.payload
            .executionRequestId
        )
          .toBe(
            "execution-request-1"
          );

        expect(
          persisted.payload
            .verificationPlanId
        )
          .toBe(
            "verification-plan-1"
          );

        expect(
          persisted.payload
            .verificationPlanHash
        )
          .toBe(
            "verification-hash-1"
          );
      }
    );


    test(
      "preserves verification outcome",
      async () => {
        await service
          .createLifecycleRequested(
            input()
          );

        const persisted =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          persisted.payload
            .verificationOutcome
        )
          .toEqual({
            outcome:
              "RECOVERED",

            confidence:
              0.98,
          });
      }
    );


    test(
      "event identity is deterministic",
      async () => {
        const first =
          await service
            .createLifecycleRequested(
              input()
            );

        const second =
          await service
            .createLifecycleRequested(
              input()
            );

        expect(
          first.eventKey
        )
          .toBe(
            second.eventKey
          );

        expect(
          first.eventKey
        )
          .toContain(
            "verification-1"
          );

        expect(
          first.eventKey
        )
          .toContain(
            "verification-plan-1"
          );
      }
    );


    test(
      "handoff never grants execution authority",
      async () => {
        await service
          .createLifecycleRequested(
            input()
          );

        const persisted =
          outbox
            .createOrGet
            .mock
            .calls[0][0];

        expect(
          persisted.payload
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "missing verification id fails closed",
      async () => {
        await expect(
          service
            .createLifecycleRequested(
              input({
                verificationId:
                  null,
              })
            )
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
      "missing verification plan id fails closed",
      async () => {
        await expect(
          service
            .createLifecycleRequested(
              input({
                verificationPlanId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            field:
              "verificationPlanId",
          });
      }
    );


    test(
      "missing verification plan hash fails closed",
      async () => {
        await expect(
          service
            .createLifecycleRequested(
              input({
                verificationPlanHash:
                  null,
              })
            )
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
            .createLifecycleRequested(
              input({
                verificationOutcome:
                  null,
              })
            )
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
        outbox
          .createOrGet
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
          });

        const result =
          await service
            .createLifecycleRequested(
              input()
            );

        expect(
          result.persisted
        )
          .toBe(
            true
          );

        expect(
          result.created
        )
          .toBe(
            false
          );

        expect(
          result.duplicate
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
  }
);