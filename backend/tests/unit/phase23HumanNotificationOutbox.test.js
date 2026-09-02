"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  HumanNotificationOutboxHandoffService,
  targetReference,
  normalizeSeverity,
} =
  require(
    "../../services/workflowOutbox/humanNotificationOutboxHandoffService"
  );


const {
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxContracts"
  );


const {
  HUMAN_NOTIFICATION_EVENT_TYPE,
} =
  require(
    "../../constants/humanNotification"
  );


describe(
  "Phase 23.3A/B Human Notification + Workflow Outbox",

  () => {
    test(
      "workflow outbox contracts expose notification event and aggregate",

      () => {
        expect(
          OUTBOX_EVENT_TYPE
            .HUMAN_NOTIFICATION_REQUESTED
        ).toBe(
          "HUMAN_NOTIFICATION_REQUESTED"
        );


        expect(
          OUTBOX_AGGREGATE_TYPE
            .HUMAN_NOTIFICATION
        ).toBe(
          "HUMAN_NOTIFICATION"
        );
      }
    );


    test(
      "target identity is deterministic",

      () => {
        expect(
          targetReference({
            publicId:
              "target-public",

            targetKey:
              "target-key",
          })
        ).toBe(
          "target-public"
        );


        expect(
          targetReference({
            targetKey:
              "target-key",
          })
        ).toBe(
          "target-key"
        );
      }
    );


    test(
      "severity normalization fails safely to HIGH",

      () => {
        expect(
          normalizeSeverity(
            "critical"
          )
        ).toBe(
          "CRITICAL"
        );


        expect(
          normalizeSeverity(
            "unknown"
          )
        ).toBe(
          "HIGH"
        );
      }
    );


    test(
      "persists canonical request before creating outbox event",

      async () => {
        const calls =
          [];


        const notificationRepository = {
          createOrGetRequest:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  calls.push(
                    "REQUEST"
                  );


                  return {
                    created:
                      true,

                    duplicate:
                      false,

                    request: {
                      publicId:
                        "nreq-1",

                      incidentId:
                        input.incidentId,

                      escalationId:
                        input.escalationId,

                      humanTaskId:
                        input.humanTaskId,

                      assignmentId:
                        input.assignmentId,

                      notificationEventType:
                        input.notificationEventType,

                      severity:
                        input.severity,

                      targetSnapshot:
                        input.targetSnapshot,

                      title:
                        input.title,

                      message:
                        input.message,

                      acknowledgementDeadline:
                        input.acknowledgementDeadline,

                      correlationId:
                        input.correlationId,

                      executionAuthorized:
                        false,
                    },
                  };
                }
              ),

          markQueued:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  calls.push(
                    "QUEUED"
                  );


                  return {
                    publicId:
                      input.notificationRequestId,

                    status:
                      "QUEUED",

                    outboxEventId:
                      input.outboxEventId,

                    executionAuthorized:
                      false,
                  };
                }
              ),
        };


        const outbox = {
          createOrGet:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  calls.push(
                    "OUTBOX"
                  );


                  return {
                    created:
                      true,

                    duplicate:
                      false,

                    event: {
                      eventId:
                        "outbox-1",

                      eventKey:
                        "outbox-key-1",

                      payload:
                        input.payload,

                      executionAuthorized:
                        false,
                    },
                  };
                }
              ),
        };


        const service =
          new HumanNotificationOutboxHandoffService({
            notificationRepository,

            outbox,
          });


        const result =
          await service
            .createFromEscalationHandoff({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              severity:
                "CRITICAL",

              notificationHandoff: {
                ready:
                  true,

                deliveryStarted:
                  false,

                owner:
                  "PHASE_23_3_NOTIFICATION_PLATFORM",

                escalationId:
                  "esc-1",

                incidentId:
                  "inc-1",

                taskId:
                  "task-1",

                assignmentId:
                  "assignment-1",

                target: {
                  publicId:
                    "target-1",

                  targetType:
                    "USER",

                  targetUserId:
                    "user-1",
                },

                acknowledgementDeadline:
                  "2030-01-01T00:00:00.000Z",

                attemptNumber:
                  1,

                executionAuthorized:
                  false,
              },
            });


        expect(
          calls
        ).toEqual([
          "REQUEST",
          "OUTBOX",
          "QUEUED",
        ]);


        expect(
          outbox
            .createOrGet
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            aggregateType:
              "HUMAN_NOTIFICATION",

            eventType:
              "HUMAN_NOTIFICATION_REQUESTED",

            aggregateId:
              "nreq-1",
          })
        );


        const outboxInput =
          outbox
            .createOrGet
            .mock
            .calls[0][0];


        expect(
          outboxInput
            .payload
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          outboxInput
            .payload
            .humanControlGranted
        ).toBe(
          false
        );


        expect(
          outboxInput
            .payload
            .acknowledgementGranted
        ).toBe(
          false
        );


        expect(
          result
            .request
            .status
        ).toBe(
          "QUEUED"
        );


        expect(
          result
            .deliveryStarted
        ).toBe(
          false
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "retry handoff is represented as HUMAN_ESCALATION_RETRY",

      async () => {
        let capturedRequest =
          null;


        const notificationRepository = {
          createOrGetRequest:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => {
                  capturedRequest =
                    input;


                  return {
                    created:
                      true,

                    duplicate:
                      false,

                    request: {
                      publicId:
                        "nreq-retry",

                      incidentId:
                        input.incidentId,

                      escalationId:
                        input.escalationId,

                      humanTaskId:
                        null,

                      assignmentId:
                        null,

                      notificationEventType:
                        input.notificationEventType,

                      severity:
                        input.severity,

                      targetSnapshot:
                        input.targetSnapshot,

                      title:
                        input.title,

                      message:
                        input.message,

                      acknowledgementDeadline:
                        null,

                      correlationId:
                        "esc-1",

                      executionAuthorized:
                        false,
                    },
                  };
                }
              ),

          markQueued:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "nreq-retry",

                status:
                  "QUEUED",

                executionAuthorized:
                  false,
              }),
        };


        const outbox = {
          createOrGet:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                duplicate:
                  false,

                event: {
                  eventId:
                    "outbox-retry",

                  eventKey:
                    "outbox-retry-key",
                },
              }),
        };


        const service =
          new HumanNotificationOutboxHandoffService({
            notificationRepository,

            outbox,
          });


        await service
          .createFromEscalationHandoff({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            notificationHandoff: {
              ready:
                true,

              deliveryStarted:
                false,

              escalationId:
                "esc-1",

              incidentId:
                "inc-1",

              attemptNumber:
                2,

              target: {
                publicId:
                  "target-2",

                targetType:
                  "TEAM",
              },
            },
          });


        expect(
          capturedRequest
            .notificationEventType
        ).toBe(
          HUMAN_NOTIFICATION_EVENT_TYPE
            .HUMAN_ESCALATION_RETRY
        );
      }
    );


    test(
      "outbox failure leaves notification request unmarked as queued",

      async () => {
        const notificationRepository = {
          createOrGetRequest:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                duplicate:
                  false,

                request: {
                  publicId:
                    "nreq-1",

                  incidentId:
                    "inc-1",

                  escalationId:
                    "esc-1",

                  humanTaskId:
                    null,

                  assignmentId:
                    null,

                  notificationEventType:
                    "HUMAN_ESCALATION_REQUIRED",

                  severity:
                    "HIGH",

                  targetSnapshot: {
                    publicId:
                      "target-1",
                  },

                  title:
                    "title",

                  message:
                    "message",

                  correlationId:
                    "esc-1",

                  executionAuthorized:
                    false,
                },
              }),

          markQueued:
            jest.fn(),
        };


        const outbox = {
          createOrGet:
            jest
              .fn()
              .mockRejectedValue(
                Object.assign(
                  new Error(
                    "database unavailable"
                  ),
                  {
                    code:
                      "OUTBOX_TEST_FAILURE",
                  }
                )
              ),
        };


        const service =
          new HumanNotificationOutboxHandoffService({
            notificationRepository,

            outbox,
          });


        await expect(
          service
            .createFromEscalationHandoff({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              notificationHandoff: {
                ready:
                  true,

                deliveryStarted:
                  false,

                escalationId:
                  "esc-1",

                incidentId:
                  "inc-1",

                target: {
                  publicId:
                    "target-1",

                  targetType:
                    "USER",
                },
              },
            })
        ).rejects.toMatchObject({
          code:
            "OUTBOX_TEST_FAILURE",
        });


        expect(
          notificationRepository
            .markQueued
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "rejects unsafe Phase-23.2 handoff that claims delivery already started",

      async () => {
        const service =
          new HumanNotificationOutboxHandoffService({
            notificationRepository:
              {},

            outbox:
              {},
          });


        await expect(
          service
            .createFromEscalationHandoff({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              notificationHandoff: {
                ready:
                  true,

                deliveryStarted:
                  true,

                escalationId:
                  "esc-1",

                incidentId:
                  "inc-1",

                target: {
                  publicId:
                    "target-1",
                },
              },
            })
        ).rejects.toMatchObject({
          code:
            "HUMAN_NOTIFICATION_DELIVERY_ALREADY_STARTED",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "migration creates notification request + attempt RLS domain",

      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "persistence",
              "postgres",
              "migrations",

              "0091_phase23_notification_platform.sql"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "notifications.requests"
        );


        expect(
          source
        ).toContain(
          "notifications.delivery_attempts"
        );


        expect(
          source
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );
  }
);