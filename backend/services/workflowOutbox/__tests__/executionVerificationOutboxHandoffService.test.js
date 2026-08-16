"use strict";

const {
  ExecutionVerificationOutboxHandoffService,
  EVENT_TYPE,
} =
  require(
    "../executionVerificationOutboxHandoffService"
  );

describe(
  "ExecutionVerificationOutboxHandoffService",
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
          new ExecutionVerificationOutboxHandoffService({
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

        correlationId:
          "correlation-1",

        ...overrides,
      };
    }

    test(
      "creates durable verification requested handoff",
      async () => {
        const result =
          await service
            .createVerificationRequested(
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
          result.executionRequestId
        )
          .toBe(
            "execution-request-1"
          );

        expect(
          result.verificationRequestId
        )
          .toBe(
            "verification-request-1"
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
      "persists immutable execution identity",
      async () => {
        await service
          .createVerificationRequested(
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
            "VERIFICATION_REQUESTED"
          );

        expect(
          persisted.aggregateType
        )
          .toBe(
            "EXECUTION_REQUEST"
          );

        expect(
          persisted.aggregateId
        )
          .toBe(
            "execution-request-1"
          );

        expect(
          persisted.payload
            .executionPlanId
        )
          .toBe(
            "plan-1"
          );

        expect(
          persisted.payload
            .executionPlanHash
        )
          .toBe(
            "hash-1"
          );

        expect(
          persisted.payload
            .verificationRequestId
        )
          .toBe(
            "verification-request-1"
          );
      }
    );


    test(
      "event identity is deterministic",
      async () => {
        const first =
          await service
            .createVerificationRequested(
              input()
            );

        const second =
          await service
            .createVerificationRequested(
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
            "execution-request-1"
          );

        expect(
          first.eventKey
        )
          .toContain(
            "verification-request-1"
          );
      }
    );


    test(
      "handoff never carries execution authority",
      async () => {
        await service
          .createVerificationRequested(
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
      "missing execution request identity fails closed",
      async () => {
        await expect(
          service
            .createVerificationRequested(
              input({
                executionRequestId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_VERIFICATION_OUTBOX_IDENTITY_REQUIRED",

            field:
              "executionRequestId",
          });
      }
    );


    test(
      "missing immutable plan id fails closed",
      async () => {
        await expect(
          service
            .createVerificationRequested(
              input({
                executionPlanId:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_VERIFICATION_OUTBOX_IDENTITY_REQUIRED",

            field:
              "executionPlanId",
          });
      }
    );


    test(
      "missing immutable plan hash fails closed",
      async () => {
        await expect(
          service
            .createVerificationRequested(
              input({
                executionPlanHash:
                  null,
              })
            )
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_VERIFICATION_OUTBOX_IDENTITY_REQUIRED",

            field:
              "executionPlanHash",
          });
      }
    );


    test(
      "missing verification request identity fails closed",
      async () => {
        await expect(
          service
            .createVerificationRequested(
              input({
                verificationRequestId:
                  null,
              })
            )
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
      "duplicate durable handoff is successful",
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
            .createVerificationRequested(
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