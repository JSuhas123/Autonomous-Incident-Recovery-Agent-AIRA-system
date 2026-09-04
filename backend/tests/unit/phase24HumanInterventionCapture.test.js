"use strict";


const {
  HumanInterventionCaptureService,
} =
  require(
    "../../services/humanLearning/humanInterventionCaptureService"
  );


const {
  INTERVENTION_EVENT_TYPE,

  TRUTH_LEVEL,
} =
  require(
    "../../contracts/humanLearning"
  );


function makeSession(
  overrides = {}
) {
  return {
    id:
      "db-session",

    publicId:
      "hint_001",

    status:
      "OPEN",

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "AIRA Phase 24.1 — structured human intervention capture",
  () => {
    test(
      "starts a scoped session and records investigation start",
      async () => {
        const repository = {
          createSession:
            jest
              .fn()
              .mockResolvedValue(
                makeSession()
              ),

          appendEvent:
            jest
              .fn()
              .mockResolvedValue({
                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanInterventionCaptureService({
            repository,
          });


        const result =
          await service
            .startSession({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              incidentId:
                "inc_001",

              operatorUserId:
                "user_001",
            });


        expect(
          result.publicId
        ).toBe(
          "hint_001"
        );


        expect(
          repository.appendEvent
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId:
              "hint_001",

            eventType:
              INTERVENTION_EVENT_TYPE
                .INVESTIGATION_STARTED,

            truthLevel:
              TRUTH_LEVEL
                .OBSERVATION,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "preserves human diagnosis as assertion rather than truth",
      async () => {
        const repository = {
          appendEvent:
            jest
              .fn()
              .mockResolvedValue({
                eventType:
                  INTERVENTION_EVENT_TYPE
                    .DIAGNOSIS_DECLARED,

                truthLevel:
                  TRUTH_LEVEL
                    .ASSERTION,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanInterventionCaptureService({
            repository,
          });


        const result =
          await service
            .recordEvent({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sessionId:
                "hint_001",

              eventType:
                INTERVENTION_EVENT_TYPE
                  .DIAGNOSIS_DECLARED,

              truthLevel:
                TRUTH_LEVEL
                  .ASSERTION,

              payload: {
                diagnosis:
                  "connection exhaustion",
              },
            });


        expect(
          result.truthLevel
        ).toBe(
          "ASSERTION"
        );
      }
    );


    test(
      "rejects any attempt to attach execution authority",
      async () => {
        const service =
          new HumanInterventionCaptureService({
            repository:
              {},
          });


        await expect(
          service.recordEvent({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "records investigation completion before closing the session",
      async () => {
        const callOrder =
          [];


        const repository = {
          appendEvent:
            jest
              .fn()
              .mockImplementation(
                async () => {
                  callOrder.push(
                    "event"
                  );


                  return {
                    executionAuthorized:
                      false,
                  };
                }
              ),

          completeSession:
            jest
              .fn()
              .mockImplementation(
                async () => {
                  callOrder.push(
                    "complete"
                  );


                  return makeSession({
                    status:
                      "COMPLETED",
                  });
                }
              ),
        };


        const service =
          new HumanInterventionCaptureService({
            repository,
          });


        const result =
          await service
            .completeSession({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sessionId:
                "hint_001",
            });


        expect(
          callOrder
        ).toEqual([
          "event",
          "complete",
        ]);


        expect(
          result.status
        ).toBe(
          "COMPLETED"
        );
      }
    );
  }
);