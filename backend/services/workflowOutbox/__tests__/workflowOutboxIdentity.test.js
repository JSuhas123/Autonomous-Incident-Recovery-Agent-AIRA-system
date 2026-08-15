"use strict";

const {
  WorkflowOutboxIdentity,
} =
  require(
    "../workflowOutboxIdentity"
  );

const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "WorkflowOutboxIdentity",
  () => {
    let identity;

    beforeEach(
      () => {
        identity =
          new WorkflowOutboxIdentity();
      }
    );

    function baseInput(
      overrides = {}
    ) {
      return {
        organizationId:
          "org-1",

        environmentId:
          "prod",

        aggregateType:
          OUTBOX_AGGREGATE_TYPE
            .VERIFICATION,

        aggregateId:
          "verification-1",

        eventType:
          OUTBOX_EVENT_TYPE
            .LIFECYCLE_REQUESTED,

        transitionId:
          "verification-recovered",

        payload: {
          organizationId:
            "org-1",

          environmentId:
            "prod",

          incidentId:
            "incident-1",

          verificationId:
            "verification-1",

          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }

    test(
      "same logical handoff produces same event key",
      () => {
        const first =
          identity.createIdentity(
            baseInput()
          );

        const second =
          identity.createIdentity(
            baseInput()
          );

        expect(
          first.eventKey
        )
          .toBe(
            second.eventKey
          );
      }
    );

    test(
      "same logical handoff produces same event id",
      () => {
        const first =
          identity.createIdentity(
            baseInput()
          );

        const second =
          identity.createIdentity(
            baseInput()
          );

        expect(
          first.eventId
        )
          .toBe(
            second.eventId
          );
      }
    );

    test(
      "same payload produces same fingerprint regardless of object key order",
      () => {
        const first =
          identity
            .fingerprintPayload({
              organizationId:
                "org-1",

              incidentId:
                "incident-1",

              nested: {
                alpha:
                  1,

                beta:
                  2,
              },
            });

        const second =
          identity
            .fingerprintPayload({
              nested: {
                beta:
                  2,

                alpha:
                  1,
              },

              incidentId:
                "incident-1",

              organizationId:
                "org-1",
            });

        expect(
          first
        )
          .toBe(
            second
          );
      }
    );

    test(
      "different payload produces different fingerprint",
      () => {
        const first =
          identity
            .fingerprintPayload({
              verificationId:
                "verification-1",

              result:
                "RECOVERED",
            });

        const second =
          identity
            .fingerprintPayload({
              verificationId:
                "verification-1",

              result:
                "FAILED",
            });

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
      "different transition id produces different logical event identity",
      () => {
        const first =
          identity.createIdentity(
            baseInput({
              transitionId:
                "transition-1",
            })
          );

        const second =
          identity.createIdentity(
            baseInput({
              transitionId:
                "transition-2",
            })
          );

        expect(
          first.eventKey
        )
          .not
          .toBe(
            second.eventKey
          );

        expect(
          first.eventId
        )
          .not
          .toBe(
            second.eventId
          );
      }
    );

    test(
      "same event identity with same payload is compatible",
      () => {
        const expected =
          identity.createIdentity(
            baseInput()
          );

        const existing = {
          eventId:
            expected.eventId,

          eventKey:
            expected.eventKey,

          payloadFingerprint:
            expected
              .payloadFingerprint,
        };

        expect(
          identity
            .assertCompatibleExistingEvent({
              existingEvent:
                existing,

              expectedIdentity:
                expected,
            })
        )
          .toBe(
            true
          );
      }
    );

    test(
      "same event key with different payload is rejected",
      () => {
        const expected =
          identity.createIdentity(
            baseInput()
          );

        const conflictingFingerprint =
          identity
            .fingerprintPayload({
              completely:
                "different",
            });

        const existing = {
          eventId:
            expected.eventId,

          eventKey:
            expected.eventKey,

          payloadFingerprint:
            conflictingFingerprint,
        };

        expect(
          () =>
            identity
              .assertCompatibleExistingEvent({
                existingEvent:
                  existing,

                expectedIdentity:
                  expected,
              })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_EVENT_PAYLOAD_CONFLICT",
            })
          );
      }
    );

    test(
      "same event key with different event id is rejected",
      () => {
        const expected =
          identity.createIdentity(
            baseInput()
          );

        const existing = {
          eventId:
            "wrong-event-id",

          eventKey:
            expected.eventKey,

          payloadFingerprint:
            expected
              .payloadFingerprint,
        };

        expect(
          () =>
            identity
              .assertCompatibleExistingEvent({
                existingEvent:
                  existing,

                expectedIdentity:
                  expected,
              })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_EVENT_IDENTITY_CONFLICT",
            })
          );
      }
    );

    test(
      "tenant scope changes logical event identity",
      () => {
        const first =
          identity.createIdentity(
            baseInput({
              organizationId:
                "org-1",
            })
          );

        const second =
          identity.createIdentity(
            baseInput({
              organizationId:
                "org-2",
            })
          );

        expect(
          first.eventKey
        )
          .not
          .toBe(
            second.eventKey
          );

        expect(
          first.eventId
        )
          .not
          .toBe(
            second.eventId
          );
      }
    );

    test(
      "missing tenant scope fails closed",
      () => {
        expect(
          () =>
            identity
              .createIdentity(
                baseInput({
                  organizationId:
                    null,
                })
              )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_TENANT_SCOPE_REQUIRED",
            })
          );
      }
    );

    test(
      "unknown event type fails closed",
      () => {
        expect(
          () =>
            identity
              .createIdentity(
                baseInput({
                  eventType:
                    "DO_ANYTHING",
                })
              )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_EVENT_TYPE_REQUIRED",
            })
          );
      }
    );

    test(
      "unknown aggregate type fails closed",
      () => {
        expect(
          () =>
            identity
              .createIdentity(
                baseInput({
                  aggregateType:
                    "UNKNOWN_AGGREGATE",
                })
              )
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_AGGREGATE_REQUIRED",
            })
          );
      }
    );

    test(
      "payload cannot manufacture execution authorization",
      () => {
        expect(
          () =>
            identity
              .fingerprintPayload({
                executionAuthorized:
                  true,
              })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_UNSAFE_AUTHORITY",
            })
          );
      }
    );

    test(
      "payload cannot manufacture authorization grant",
      () => {
        expect(
          () =>
            identity
              .fingerprintPayload({
                authorizationGranted:
                  true,
              })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_UNSAFE_AUTHORITY",
            })
          );
      }
    );
  }
);