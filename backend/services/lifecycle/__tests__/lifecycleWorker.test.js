"use strict";

const {
  LifecycleWorker,
} =
  require(
    "../../../workers/lifecycleWorker"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

function queryRepository(
  value
) {
  return {
    findOne:
      jest.fn(
        async () =>
          value
      ),
  };
}

function queue() {
  return {
    publishStarted:
      jest.fn(),

    publishCompleted:
      jest.fn(),

    publishFailed:
      jest.fn(),

    publishBlocked:
      jest.fn(),
  };
}

function recoveredVerification() {
  return {
    verificationId:
      "verification-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    decision:
      "RECOVERED",

    recovered:
      true,

    recoveryConfirmed:
      true,

    criticResult: {
      accepted:
        true,

      rejected:
        false,

      requiresManualReview:
        false,

      recoveryConfirmed:
        true,
    },

    evidencePackage: {
      required: {
        failed:
          0,

        missing:
          0,

        inconclusive:
          0,
      },

      hasConflicts:
        false,
    },

    routingResult: {
      route:
        "CLOSE_INCIDENT",
    },
  };
}

describe(
  "LifecycleWorker",
  () => {
    test(
      "moves recovered incident into stability observation",
      async () => {
        const q =
          queue();

        const worker =
          new LifecycleWorker({
            RecoveryVerification:
              queryRepository(
                recoveredVerification()
              ),

            IncidentLifecycle:
              queryRepository({
                lifecycleState:
                  INCIDENT_LIFECYCLE_STATE
                    .RECOVERED,
              }),

            persistence: {
              persistTransition:
                jest.fn(
                  async () => ({
                    persisted:
                      true,
                  })
                ),
            },

            auditService: {
              record:
                jest.fn(),
            },

            notificationService: {
              notify:
                jest.fn(),
            },

            queue:
              q,
          });

        const result =
          await worker.process(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              verificationId:
                "verification-1",
            },
            {
              getIncident:
                jest.fn(
                  async () => ({
                    lifecycleState:
                      INCIDENT_LIFECYCLE_STATE
                        .RECOVERED,
                  })
                ),
            }
          );

        expect(
          result.type
        )
          .toBe(
            "STABILITY_STARTED"
          );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const worker =
          new LifecycleWorker();

        await expect(
          worker.process({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_JOB_UNSAFE_INPUT",
          });
      }
    );

    test(
      "missing verification fails safely",
      async () => {
        const worker =
          new LifecycleWorker({
            RecoveryVerification:
              queryRepository(
                null
              ),

            queue:
              queue(),
          });

        await expect(
          worker.process({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          })
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_VERIFICATION_NOT_FOUND",
          });
      }
    );

    test(
      "worker output never starts infrastructure execution",
      async () => {
        const worker =
          new LifecycleWorker({
            RecoveryVerification:
              queryRepository(
                recoveredVerification()
              ),

            IncidentLifecycle:
              queryRepository({
                lifecycleState:
                  INCIDENT_LIFECYCLE_STATE
                    .RECOVERED,
              }),

            persistence: {
              persistTransition:
                jest.fn(
                  async () => ({
                    persisted:
                      true,
                  })
                ),
            },

            auditService: {
              record:
                jest.fn(),
            },

            notificationService: {
              notify:
                jest.fn(),
            },

            queue:
              queue(),
          });

        const result =
          await worker.process(
            {
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",
            },
            {
              getIncident:
                jest.fn(
                  async () => ({
                    lifecycleState:
                      INCIDENT_LIFECYCLE_STATE
                        .RECOVERED,
                  })
                ),
            }
          );

        expect(
          result.recoveryStarted
        )
          .toBe(
            false
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
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