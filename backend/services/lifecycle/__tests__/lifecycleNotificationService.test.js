"use strict";

const {
  LifecycleNotificationService,
  NOTIFICATION_SEVERITY,
} =
  require(
    "../lifecycleNotificationService"
  );

const {
  LIFECYCLE_EVENT,
  INCIDENT_LIFECYCLE_STATE,
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
      LIFECYCLE_EVENT
        .INCIDENT_RESOLVED,

    lifecycleState:
      INCIDENT_LIFECYCLE_STATE
        .RESOLVED,

    verificationId:
      "verification-1",

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "LifecycleNotificationService",
  () => {
    test(
      "builds normalized lifecycle notification",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput()
          );

        expect(
          result.notification
            .incidentId
        )
          .toBe(
            "incident-1"
          );

        expect(
          result.notification
            .eventType
        )
          .toBe(
            LIFECYCLE_EVENT
              .INCIDENT_RESOLVED
          );
      }
    );

    test(
      "critical lifecycle event receives critical severity",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput({
              eventType:
                LIFECYCLE_EVENT
                  .ROLLBACK_REQUESTED,
            })
          );

        expect(
          result.notification
            .severity
        )
          .toBe(
            NOTIFICATION_SEVERITY
              .CRITICAL
          );
      }
    );

    test(
      "retry request receives high severity",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput({
              eventType:
                LIFECYCLE_EVENT
                  .RETRY_REQUESTED,
            })
          );

        expect(
          result.notification
            .severity
        )
          .toBe(
            NOTIFICATION_SEVERITY
              .HIGH
          );
      }
    );

    test(
      "resolved incident notification is informational",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput()
          );

        expect(
          result.notification
            .severity
        )
          .toBe(
            NOTIFICATION_SEVERITY
              .INFO
          );
      }
    );

    test(
      "high severity notification requires acknowledgement",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput({
              eventType:
                LIFECYCLE_EVENT
                  .ESCALATED,
            })
          );

        expect(
          result.notification
            .requiresAcknowledgement
        )
          .toBe(
            true
          );
      }
    );

    test(
      "publishes through external notification provider",
      async () => {
        const publish =
          jest.fn();

        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput(),
            {
              publishNotification:
                publish,
            }
          );

        expect(
          publish
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.delivered
        )
          .toBe(
            true
          );
      }
    );

    test(
      "does not require provider to build notification",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput()
          );

        expect(
          result.delivered
        )
          .toBe(
            false
          );

        expect(
          result.notification
        )
          .toBeDefined();
      }
    );

    test(
      "custom severity is preserved",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput({
              severity:
                NOTIFICATION_SEVERITY
                  .LOW,
            })
          );

        expect(
          result.notification
            .severity
        )
          .toBe(
            NOTIFICATION_SEVERITY
              .LOW
          );
      }
    );

    test(
      "generates unique notification IDs",
      () => {
        const service =
          new LifecycleNotificationService();

        const first =
          service.generateId(
            baseInput()
          );

        const second =
          service.generateId(
            baseInput()
          );

        expect(
          first
        )
          .toMatch(
            /^notification_/
          );

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
      "does not mutate incident",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
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
      "never authorizes execution",
      async () => {
        const service =
          new LifecycleNotificationService();

        const result =
          await service.notify(
            baseInput()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.notification
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects invalid lifecycle event",
      async () => {
        const service =
          new LifecycleNotificationService();

        await expect(
          service.notify(
            baseInput({
              eventType:
                "fake.event",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_NOTIFICATION_EVENT_INVALID",
          });
      }
    );

    test(
      "rejects unsafe execution authorization",
      async () => {
        const service =
          new LifecycleNotificationService();

        await expect(
          service.notify(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_NOTIFICATION_UNSAFE_INPUT",
          });
      }
    );
  }
);