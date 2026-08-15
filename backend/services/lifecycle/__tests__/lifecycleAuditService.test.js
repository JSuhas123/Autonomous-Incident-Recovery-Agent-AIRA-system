"use strict";

const {
  LifecycleAuditService,
  AUDIT_EVENT_TYPE,
} =
  require(
    "../lifecycleAuditService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  LIFECYCLE_ACTION,
  LIFECYCLE_EVENT,
} =
  require(
    "../incidentLifecycleContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    eventType:
      AUDIT_EVENT_TYPE
        .STATE_TRANSITION,

    lifecycleEvent:
      LIFECYCLE_EVENT
        .STABILITY_STARTED,

    lifecycleAction:
      LIFECYCLE_ACTION
        .BEGIN_STABILITY_OBSERVATION,

    fromState:
      INCIDENT_LIFECYCLE_STATE
        .RECOVERED,

    toState:
      INCIDENT_LIFECYCLE_STATE
        .STABILITY_OBSERVATION,

    verificationId:
      "verification-1",

    actor: {
      type:
        "SYSTEM",

      id:
        "aira",
    },

    payload: {
      sampleCount:
        0,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "LifecycleAuditService",
  () => {
    test(
      "creates immutable lifecycle audit record",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.record.auditId
        )
          .toMatch(
            /^audit_/
          );

        expect(
          Object.isFrozen(
            result.record
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            result.record.payload
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "records lifecycle state transition",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.record.fromState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RECOVERED
          );

        expect(
          result.record.toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );
      }
    );

    test(
      "generates integrity hash",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.record
            .integrityHash
        )
          .toMatch(
            /^auditsha256_[a-f0-9]{64}$/
          );
      }
    );

    test(
      "same content generates deterministic integrity hash",
      () => {
        const service =
          new LifecycleAuditService();

        const value = {
          a:
            1,

          b: {
            x:
              "test",
          },
        };

        const first =
          service
            .generateIntegrityHash(
              value
            );

        const second =
          service
            .generateIntegrityHash({
              b: {
                x:
                  "test",
              },

              a:
                1,
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
      "persists through append-only provider",
      async () => {
        const append =
          jest.fn();

        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput(),
            {
              appendAuditRecord:
                append,
            }
          );

        expect(
          append
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.persisted
        )
          .toBe(
            true
          );
      }
    );

    test(
      "works without persistence provider",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.persisted
        )
          .toBe(
            false
          );

        expect(
          result.record
        )
          .toBeDefined();
      }
    );

    test(
      "supports rollback request audit event",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput({
              eventType:
                AUDIT_EVENT_TYPE
                  .ROLLBACK_REQUEST,

              lifecycleEvent:
                LIFECYCLE_EVENT
                  .ROLLBACK_REQUESTED,

              lifecycleAction:
                LIFECYCLE_ACTION
                  .REQUEST_ROLLBACK,

              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .REGRESSED,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .ROLLBACK_PENDING,

              rollbackRequestId:
                "rollback-1",
            })
          );

        expect(
          result.record
            .rollbackRequestId
        )
          .toBe(
            "rollback-1"
          );
      }
    );

    test(
      "supports escalation audit event",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput({
              eventType:
                AUDIT_EVENT_TYPE
                  .ESCALATION,

              lifecycleEvent:
                LIFECYCLE_EVENT
                  .ESCALATED,

              lifecycleAction:
                LIFECYCLE_ACTION
                  .ESCALATE,

              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .RETRY_PENDING,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .ESCALATED,

              escalationId:
                "escalation-1",
            })
          );

        expect(
          result.record
            .escalationId
        )
          .toBe(
            "escalation-1"
          );
      }
    );

    test(
      "strips execution authorization from nested payload",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput({
              payload: {
                executionAuthorized:
                  true,

                nested: {
                  authorizationGranted:
                    true,
                },
              },
            })
          );

        expect(
          result.record
            .payload
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.record
            .payload
            .nested
            .authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "caller payload mutation cannot alter record",
      async () => {
        const payload = {
          value:
            "original",
        };

        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput({
              payload,
            })
          );

        payload.value =
          "tampered";

        expect(
          result.record
            .payload
            .value
        )
          .toBe(
            "original"
          );
      }
    );

    test(
      "does not mutate incident",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.incidentMutated
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects invalid audit event type",
      async () => {
        const service =
          new LifecycleAuditService();

        await expect(
          service.record(
            baseInput({
              eventType:
                "INVALID",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_AUDIT_EVENT_INVALID",
          });
      }
    );

    test(
      "rejects invalid lifecycle transition state",
      async () => {
        const service =
          new LifecycleAuditService();

        await expect(
          service.record(
            baseInput({
              toState:
                "INVALID",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_AUDIT_TO_STATE_INVALID",
          });
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const service =
          new LifecycleAuditService();

        const result =
          await service.record(
            baseInput()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.record
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe authorization input",
      async () => {
        const service =
          new LifecycleAuditService();

        await expect(
          service.record(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_AUDIT_UNSAFE_INPUT",
          });
      }
    );
  }
);