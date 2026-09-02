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
  OUTBOX_EVENT_TYPE,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxContracts"
  );


const {
  WORKFLOW_OUTBOX_TOPIC,
  WORKFLOW_OUTBOX_QUEUE,
} =
  require(
    "../../services/workflowOutbox/workflowOutboxComposition"
  );


const {
  createHumanNotificationRoute,
} =
  require(
    "../../services/workflowOutbox/humanNotificationOutboxQueueAdapter"
  );


describe(
  "Phase 23.3C/D workflow notification wiring",

  () => {
    test(
      "notification outbox event remains canonical",

      () => {
        expect(
          OUTBOX_EVENT_TYPE
            .HUMAN_NOTIFICATION_REQUESTED
        ).toBe(
          "HUMAN_NOTIFICATION_REQUESTED"
        );
      }
    );


    test(
      "notification owns dedicated durable RabbitMQ topic and queue",

      () => {
        expect(
          WORKFLOW_OUTBOX_TOPIC
            .HUMAN_NOTIFICATION
        ).toBe(
          "aira.workflow.human-notification.requested"
        );


        expect(
          WORKFLOW_OUTBOX_QUEUE
            .HUMAN_NOTIFICATION
        ).toBe(
          "aira.workflow.human-notification"
        );
      }
    );


    test(
      "notification route publishes worker-safe job",

      async () => {
        const publisher =
          jest
            .fn()
            .mockResolvedValue({
              eventId:
                "rabbit-1",

              correlationId:
                "esc-1",
            });


        const route =
          createHumanNotificationRoute({
            publisher,
          });


        const result =
          await route
            .publish({
              outboxEventId:
                "outbox-1",

              outboxEventKey:
                "outbox-key",

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

                correlationId:
                  "esc-1",

                humanControlGranted:
                  false,

                acknowledgementGranted:
                  false,

                executionAuthorized:
                  false,
              },
            });


        expect(
          publisher
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            notificationRequestId:
              "nreq-1",

            executionAuthorized:
              false,

            humanControlGranted:
              false,
          })
        );


        expect(
          result.messageId
        ).toBe(
          "rabbit-1"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "consumer registry contains human notification worker wiring",

      () => {
        const file =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "workflowOutbox",
              "workflowOutboxConsumerRegistry.js"
            ),
            "utf8"
          );


        expect(
          file
        ).toContain(
          "humanNotificationWorker"
        );


        expect(
          file
        ).toContain(
          "HUMAN_NOTIFICATION"
        );


        expect(
          file
        ).toContain(
          "human-notification"
        );
      }
    );


    test(
      "composition contains notification outbox publisher wiring",

      () => {
        const file =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "services",
              "workflowOutbox",
              "workflowOutboxComposition.js"
            ),
            "utf8"
          );


        expect(
          file
        ).toContain(
          "createHumanNotificationRoute"
        );


        expect(
          file
        ).toContain(
          "HUMAN_NOTIFICATION_REQUESTED"
        );


        expect(
          file
        ).toContain(
          "aira.workflow.human-notification.requested"
        );
      }
    );
  }
);