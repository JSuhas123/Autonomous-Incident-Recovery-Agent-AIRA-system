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
  IncidentCommandService,
} =
  require(
    "../../services/humanOperations/incidentCommandService"
  );


describe(
  "Phase 23.7 Incident Command API",
  () => {
    test(
      "read command delegates to canonical read model",
      async () => {
        const readModel = {
          incidentId:
            "incident-1",

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        };


        const readModelService = {
          getReadModel:
            jest
              .fn()
              .mockResolvedValue(
                readModel
              ),
        };


        const service =
          new IncidentCommandService({
            taskService:
              {},

            takeControlService:
              {},

            returnControlService:
              {},

            readModelService,
          });


        const result =
          await service.get({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            actorUserId:
              "user-1",
          });


        expect(
          result
        ).toBe(
          readModel
        );


        expect(
          readModelService
            .getReadModel
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident-1",

            actorUserId:
              "user-1",
          })
        );
      }
    );


    test(
      "acknowledge delegates to HumanTaskService and never grants control",
      async () => {
        const taskService = {
          acknowledgeTask:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "task-1",

                status:
                  "ACKNOWLEDGED",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new IncidentCommandService({
            taskService,

            takeControlService:
              {},

            returnControlService:
              {},

            readModelService:
              {},
          });


        const result =
          await service.acknowledge({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            actorUserId:
              "user-1",

            taskId:
              "task-1",
          });


        expect(
          taskService
            .acknowledgeTask
        ).toHaveBeenCalledWith({
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          taskId:
            "task-1",

          actorUserId:
            "user-1",
        });


        expect(
          result.humanControlActive
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "request command delegates to Phase 23.5 control service",
      async () => {
        const takeControlService = {
          requestControl:
            jest
              .fn()
              .mockResolvedValue({
                session: {
                  publicId:
                    "takeover-1",

                  status:
                    "REQUESTED",
                },

                humanControlActive:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new IncidentCommandService({
            taskService:
              {},

            takeControlService,

            returnControlService:
              {},

            readModelService:
              {},
          });


        const result =
          await service
            .requestControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              actorUserId:
                "user-1",

              taskId:
                "task-1",
            });


        expect(
          takeControlService
            .requestControl
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident-1",

            taskId:
              "task-1",

            actorUserId:
              "user-1",
          })
        );


        expect(
          result.command
        ).toBe(
          "REQUEST_CONTROL"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "acquire command does not create execution authority",
      async () => {
        const takeControlService = {
          acquireControl:
            jest
              .fn()
              .mockResolvedValue({
                lease: {
                  publicId:
                    "lease-1",

                  status:
                    "ACTIVE",
                },

                humanControlActive:
                  true,

                autonomousContinuationAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new IncidentCommandService({
            taskService:
              {},

            takeControlService,

            returnControlService:
              {},

            readModelService:
              {},
          });


        const result =
          await service
            .acquireControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              actorUserId:
                "user-1",

              sessionId:
                "takeover-1",
            });


        expect(
          result.humanControlActive
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
      "return command delegates to Phase 23.6 return service",
      async () => {
        const returnControlService = {
          returnControl:
            jest
              .fn()
              .mockResolvedValue({
                humanControlActive:
                  false,

                requiresFreshEvaluation:
                  true,

                autonomousContinuationAllowed:
                  false,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new IncidentCommandService({
            taskService:
              {},

            takeControlService:
              {},

            returnControlService,

            readModelService:
              {},
          });


        const result =
          await service
            .returnControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              actorUserId:
                "user-1",

              leaseId:
                "lease-1",
            });


        expect(
          returnControlService
            .returnControl
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident-1",

            leaseId:
              "lease-1",

            actorUserId:
              "user-1",
          })
        );


        expect(
          result.requiresFreshEvaluation
        ).toBe(
          true
        );


        expect(
          result.stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "route exposes complete Phase 23.7 command surface",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "routes",

              "incidentCommandRoutes.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          '"/acknowledge"'
        );


        expect(
          source
        ).toContain(
          '"/take-control/request"'
        );


        expect(
          source
        ).toContain(
          '"/take-control/authorize"'
        );


        expect(
          source
        ).toContain(
          '"/take-control/acquire"'
        );


        expect(
          source
        ).toContain(
          '"/take-control/heartbeat"'
        );


        expect(
          source
        ).toContain(
          '"/return-control"'
        );


        expect(
          source
        ).toContain(
          "HUMAN_TASK_READ"
        );


        expect(
          source
        ).toContain(
          "HUMAN_TASK_MANAGE"
        );
      }
    );


    test(
  "server mounts specific command route before generic incidents router",
  () => {
    const source =
      fs.readFileSync(
        path.join(
          __dirname,

          "..",
          "..",

          "server.js"
        ),

        "utf8"
      );


    const commandIndex =
      source.indexOf(
        '"/api/v1/incidents/:incidentId/command"'
      );


    const genericMatches =
      [
        ...source.matchAll(
          /"\/api\/v1\/incidents"/g
        ),
      ];


    expect(
      commandIndex
    ).toBeGreaterThanOrEqual(
      0
    );


    expect(
      genericMatches.length
    ).toBeGreaterThanOrEqual(
      1
    );


    expect(
      commandIndex
    ).toBeLessThan(
      genericMatches[0]
        .index
    );
  }
);


    test(
      "command route never imports infrastructure execution service",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "routes",

              "incidentCommandRoutes.js"
            ),

            "utf8"
          );


        expect(
          source
        ).not.toContain(
          "executionService"
        );


        expect(
          source
        ).not.toContain(
          "k8sClient"
        );


        expect(
          source
        ).not.toContain(
          "docker"
        );
      }
    );
  }
);