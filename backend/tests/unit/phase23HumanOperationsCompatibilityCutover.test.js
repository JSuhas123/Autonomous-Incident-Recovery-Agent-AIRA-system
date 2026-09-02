"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const {
  HumanTaskEscalationCompatibilityService,
} = require(
  "../../services/humanOperations/humanTaskEscalationCompatibilityService"
);


const {
  HUMAN_TASK_STATUS,
} = require(
  "../../constants/humanTakeover"
);


const migration90 =
  path.join(
    __dirname,

    "..",
    "..",

    "persistence",
    "postgres",
    "migrations",

    "0090_human_escalation_reliability.sql"
  );


const bridgePath =
  path.join(
    __dirname,

    "..",
    "..",

    "services",
    "humanOperations",

    "humanOperationsBridgeService.js"
  );


const routesPath =
  path.join(
    __dirname,

    "..",
    "..",

    "routes",

    "humanTaskRoutes.js"
  );


describe(
  "Phase 23.2D Phase-14 compatibility cutover",

  () => {
    test(
      "migration adds durable retry state, event stream, RLS and one task per escalation",

      () => {
        const source =
          fs.readFileSync(
            migration90,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "delivery_attempt_count"
        );


        expect(
          source
        ).toContain(
          "max_delivery_attempts"
        );


        expect(
          source
        ).toContain(
          "acknowledgement_timeout_count"
        );


        expect(
          source
        ).toContain(
          "human_operations.escalation_events"
        );


        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "idx_human_tasks_one_per_escalation"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );


    test(
      "legacy bridge no longer creates tasks or routes notifications directly",

      () => {
        const source =
          fs.readFileSync(
            bridgePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "humanEscalationReliabilityService"
        );


        expect(
          source
        ).not.toContain(
          "createFromEscalation"
        );


        expect(
          source
        ).not.toContain(
          "routeNotification"
        );
      }
    );


    test(
      "human task escalate route uses Phase-23 compatibility adapter",

      () => {
        const source =
          fs.readFileSync(
            routesPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "humanTaskEscalationCompatibilityService"
        );
      }
    );


    test(
      "legacy ESCALATED action maps to WAITING and never grants control",

      async () => {
        const repository = {
          getTask:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "task-1",

                status:
                  HUMAN_TASK_STATUS
                    .ASSIGNED,
              }),

          updateTaskStatus:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "task-1",

                status:
                  HUMAN_TASK_STATUS
                    .WAITING,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanTaskEscalationCompatibilityService({
            repository,
          });


        const result =
          await service
            .escalateTask({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              taskId:
                "task-1",

              actorUserId:
                "user-a",

              priority:
                "CRITICAL",
            });


        expect(
          repository
            .updateTaskStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              HUMAN_TASK_STATUS
                .WAITING,
          })
        );


        expect(
          result
            .legacyEscalationMappedTo
        ).toBe(
          "WAITING"
        );


        expect(
          result
            .humanControlGranted
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
      "closed tasks cannot be legacy escalated",

      async () => {
        const repository = {
          getTask:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "task-1",

                status:
                  HUMAN_TASK_STATUS
                    .RESOLVED,
              }),

          updateTaskStatus:
            jest.fn(),
        };


        const service =
          new HumanTaskEscalationCompatibilityService({
            repository,
          });


        await expect(
          service
            .escalateTask({
              organizationId:
                "org-a",

              environmentId:
                "env-a",

              taskId:
                "task-1",
            })
        ).rejects.toMatchObject({
          code:
            "HUMAN_TASK_CLOSED",

          executionAuthorized:
            false,
        });
      }
    );
  }
);