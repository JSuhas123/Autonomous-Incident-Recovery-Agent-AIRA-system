"use strict";


const {
  HumanNotificationDeliveryService,
} =
  require(
    "../../services/humanOperations/humanNotificationDeliveryService"
  );


const {
  HumanNotificationWorker,
} =
  require(
    "../../workers/humanNotificationWorker"
  );


const {
  buildHumanNotificationJob,
} =
  require(
    "../../services/workflowOutbox/humanNotificationOutboxQueueAdapter"
  );


function requestFixture(
  overrides =
    {}
) {
  return {
    publicId:
      "nreq-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "inc-1",

    escalationId:
      "esc-1",

    humanTaskId:
      "task-1",

    assignmentId:
      "assignment-1",

    notificationEventType:
      "HUMAN_ESCALATION_REQUIRED",

    severity:
      "CRITICAL",

    status:
      "QUEUED",

    attemptCount:
      0,

    maxAttempts:
      3,

    targetRef:
      "target-1",

    targetSnapshot: {
      targetType:
        "INTEGRATION",

      provider:
        "slack",

      integrationRef:
        "int-slack-1",

      channels: [
        "SLACK",
      ],
    },

    title:
      "AIRA escalation",

    message:
      "Human intervention required",

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23.3C/D human notification delivery",

  () => {
    test(
      "outbox adapter preserves safety boundary",

      () => {
        const job =
          buildHumanNotificationJob({
            outboxEventId:
              "outbox-1",

            outboxEventKey:
              "key-1",

            payload: {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "inc-1",

              escalationId:
                "esc-1",

              notificationRequestId:
                "nreq-1",

              executionAuthorized:
                false,
            },
          });


        expect(
          job.notificationRequestId
        ).toBe(
          "nreq-1"
        );


        expect(
          job.executionAuthorized
        ).toBe(
          false
        );


        expect(
          job.humanControlGranted
        ).toBe(
          false
        );


        expect(
          job.acknowledgementGranted
        ).toBe(
          false
        );
      }
    );


    test(
      "outbox adapter rejects manufactured human control",

      () => {
        expect(
          () =>
            buildHumanNotificationJob({
              payload: {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",

                incidentId:
                  "inc-1",

                escalationId:
                  "esc-1",

                notificationRequestId:
                  "nreq-1",

                humanControlGranted:
                  true,

                executionAuthorized:
                  false,
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION",
          })
        );
      }
    );


    test(
      "direct integration target uses IntegrationNotificationGateway",

      async () => {
        const integrationGateway = {
          sendIncident:
            jest
              .fn()
              .mockResolvedValue({
                delivered:
                  true,

                providerResult: {
                  messageId:
                    "provider-1",
                },

                executionAuthorized:
                  false,
              }),
        };


        const routingService = {
          routeNotification:
            jest.fn(),
        };


        const service =
          new HumanNotificationDeliveryService({
            integrationGateway,

            routingService,
          });


        const result =
          await service
            .deliver(
              requestFixture()
            );


        expect(
          integrationGateway
            .sendIncident
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            integrationId:
              "int-slack-1",

            provider:
              "slack",
          }),

          expect.objectContaining({
            incidentId:
              "inc-1",
          })
        );


        expect(
          routingService
            .routeNotification
        ).not.toHaveBeenCalled();


        expect(
          result.delivered
        ).toBe(
          true
        );


        expect(
          result.mode
        ).toBe(
          "INTEGRATION_GATEWAY"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "USER or TEAM target falls back to canonical tenant routing rules",

      async () => {
        const integrationGateway = {
          sendIncident:
            jest.fn(),
        };


        const routingService = {
          routeNotification:
            jest
              .fn()
              .mockResolvedValue({
                routed:
                  true,

                attempted:
                  2,

                results: [
                  {
                    channelId:
                      "slack-1",

                    delivered:
                      true,
                  },

                  {
                    channelId:
                      "pagerduty-1",

                    delivered:
                      false,
                  },
                ],
              }),
        };


        const service =
          new HumanNotificationDeliveryService({
            integrationGateway,

            routingService,
          });


        const result =
          await service
            .deliver(
              requestFixture({
                targetSnapshot: {
                  targetType:
                    "TEAM",

                  targetTeamId:
                    "team-1",
                },
              })
            );


        expect(
          integrationGateway
            .sendIncident
        ).not.toHaveBeenCalled();


        expect(
          routingService
            .routeNotification
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.delivered
        ).toBe(
          true
        );


        expect(
          result.partial
        ).toBe(
          true
        );
      }
    );


    test(
      "no tenant notification route is non-retryable",

      async () => {
        const service =
          new HumanNotificationDeliveryService({
            integrationGateway: {
              sendIncident:
                jest.fn(),
            },

            routingService: {
              routeNotification:
                jest
                  .fn()
                  .mockResolvedValue({
                    routed:
                      false,

                    attempted:
                      0,

                    results:
                      [],
                  }),
            },
          });


        await expect(
          service
            .deliver(
              requestFixture({
                targetSnapshot: {
                  targetType:
                    "USER",

                  targetUserId:
                    "user-1",
                },
              })
            )
        ).rejects.toMatchObject({
          code:
            "HUMAN_NOTIFICATION_ROUTE_NOT_FOUND",

          retryable:
            false,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "worker delivers once and persists success",

      async () => {
        const repository = {
          getRequest:
            jest
              .fn()
              .mockResolvedValue(
                requestFixture()
              ),

          beginAttempt:
            jest
              .fn()
              .mockResolvedValue({
                started:
                  true,

                terminal:
                  false,

                request:
                  requestFixture({
                    attemptCount:
                      1,

                    status:
                      "DELIVERING",
                  }),

                attempt: {
                  publicId:
                    "natm-1",

                  attemptNumber:
                    1,
                },

                executionAuthorized:
                  false,
              }),

          markDelivered:
            jest
              .fn()
              .mockResolvedValue(
                requestFixture({
                  status:
                    "DELIVERED",

                  attemptCount:
                    1,
                })
              ),
        };


        const deliveryService = {
          deliver:
            jest
              .fn()
              .mockResolvedValue({
                delivered:
                  true,

                mode:
                  "INTEGRATION_GATEWAY",

                provider:
                  "slack",

                integrationId:
                  "int-slack-1",

                providerResult: {
                  ok:
                    true,
                },

                executionAuthorized:
                  false,
              }),
        };


        const worker =
          new HumanNotificationWorker({
            repository,

            deliveryService,
          });


        const result =
          await worker
            .process({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "inc-1",

              escalationId:
                "esc-1",

              notificationRequestId:
                "nreq-1",

              outboxEventId:
                "outbox-1",

              executionAuthorized:
                false,
            });


        expect(
          repository
            .markDelivered
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.delivered
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "already delivered request is duplicate-safe and provider is not called again",

      async () => {
        const repository = {
          getRequest:
            jest
              .fn()
              .mockResolvedValue(
                requestFixture({
                  status:
                    "DELIVERED",
                })
              ),

          beginAttempt:
            jest
              .fn()
              .mockResolvedValue({
                started:
                  false,

                terminal:
                  true,

                duplicate:
                  true,

                deadLettered:
                  false,

                request:
                  requestFixture({
                    status:
                      "DELIVERED",
                  }),
              }),
        };


        const deliveryService = {
          deliver:
            jest.fn(),
        };


        const worker =
          new HumanNotificationWorker({
            repository,

            deliveryService,
          });


        const result =
          await worker
            .process({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "inc-1",

              escalationId:
                "esc-1",

              notificationRequestId:
                "nreq-1",

              executionAuthorized:
                false,
            });


        expect(
          deliveryService.deliver
        ).not.toHaveBeenCalled();


        expect(
          result.duplicate
        ).toBe(
          true
        );


        expect(
          result.delivered
        ).toBe(
          true
        );
      }
    );


    test(
      "retryable provider failure stays retryable before attempt budget exhaustion",

      async () => {
        const providerError =
          Object.assign(
            new Error(
              "provider unavailable"
            ),
            {
              code:
                "PROVIDER_DOWN",

              retryable:
                true,
            }
          );


        const repository = {
          getRequest:
            jest
              .fn()
              .mockResolvedValue(
                requestFixture()
              ),

          beginAttempt:
            jest
              .fn()
              .mockResolvedValue({
                started:
                  true,

                terminal:
                  false,

                request:
                  requestFixture({
                    status:
                      "DELIVERING",

                    attemptCount:
                      1,
                  }),

                attempt: {
                  publicId:
                    "natm-1",
                },
              }),

          markFailed:
            jest
              .fn()
              .mockResolvedValue({
                deadLettered:
                  false,

                retryable:
                  true,

                executionAuthorized:
                  false,
              }),
        };


        const worker =
          new HumanNotificationWorker({
            repository,

            deliveryService: {
              deliver:
                jest
                  .fn()
                  .mockRejectedValue(
                    providerError
                  ),
            },
          });


        await expect(
          worker
            .process({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "inc-1",

              escalationId:
                "esc-1",

              notificationRequestId:
                "nreq-1",

              executionAuthorized:
                false,
            })
        ).rejects.toMatchObject({
          code:
            "PROVIDER_DOWN",

          retryable:
            true,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "attempt-budget exhaustion converts provider failure to non-retryable DLQ outcome",

      async () => {
        const repository = {
          getRequest:
            jest
              .fn()
              .mockResolvedValue(
                requestFixture({
                  attemptCount:
                    2,

                  maxAttempts:
                    3,
                })
              ),

          beginAttempt:
            jest
              .fn()
              .mockResolvedValue({
                started:
                  true,

                terminal:
                  false,

                request:
                  requestFixture({
                    status:
                      "DELIVERING",

                    attemptCount:
                      3,

                    maxAttempts:
                      3,
                  }),

                attempt: {
                  publicId:
                    "natm-3",
                },
              }),

          markFailed:
            jest
              .fn()
              .mockResolvedValue({
                deadLettered:
                  true,

                retryable:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const worker =
          new HumanNotificationWorker({
            repository,

            deliveryService: {
              deliver:
                jest
                  .fn()
                  .mockRejectedValue(
                    Object.assign(
                      new Error(
                        "provider still unavailable"
                      ),
                      {
                        code:
                          "PROVIDER_DOWN",

                        retryable:
                          true,
                      }
                    )
                  ),
            },
          });


        await expect(
          worker
            .process({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "inc-1",

              escalationId:
                "esc-1",

              notificationRequestId:
                "nreq-1",

              executionAuthorized:
                false,
            })
        ).rejects.toMatchObject({
          code:
            "HUMAN_NOTIFICATION_RETRY_EXHAUSTED",

          retryable:
            false,

          deadLettered:
            true,

          executionAuthorized:
            false,
        });
      }
    );
  }
);