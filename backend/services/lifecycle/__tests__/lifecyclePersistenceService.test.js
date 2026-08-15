"use strict";

const {
  LifecyclePersistenceService,
} =
  require(
    "../lifecyclePersistenceService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

function transition(
  overrides = {}
) {
  return {
    allowed:
      true,

    fromState:
      INCIDENT_LIFECYCLE_STATE
        .RECOVERED,

    toState:
      INCIDENT_LIFECYCLE_STATE
        .STABILITY_OBSERVATION,

    reason:
      "Begin stability observation.",

    actor: {
      type:
        "SYSTEM",

      id:
        "aira",
    },

    source: {
      phase:
        10,

      component:
        "test",
    },

    transitionedAt:
      new Date(),

    executionAuthorized:
      false,

    ...overrides,
  };
}

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

    verificationId:
      "verification-1",

    transition:
      transition(),

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "LifecyclePersistenceService",
  () => {
    test(
      "requires input",
      async () => {
        const service =
          new LifecyclePersistenceService();

        await expect(
          service.persistTransition()
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_PERSISTENCE_INPUT_REQUIRED",
          });
      }
    );

    test(
      "requires lifecycle scope",
      async () => {
        const service =
          new LifecyclePersistenceService();

        await expect(
          service.persistTransition({
            transition:
              transition(),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_PERSISTENCE_SCOPE_REQUIRED",
          });
      }
    );

    test(
      "requires transition",
      async () => {
        const service =
          new LifecyclePersistenceService();

        const input =
          baseInput();

        delete input
          .transition;

        await expect(
          service.persistTransition(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_PERSISTENCE_TRANSITION_REQUIRED",
          });
      }
    );

    test(
      "rejects invalid transition state",
      async () => {
        const service =
          new LifecyclePersistenceService();

        await expect(
          service.persistTransition(
            baseInput({
              transition:
                transition({
                  toState:
                    "INVALID",
                }),
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_PERSISTENCE_TRANSITION_INVALID",
          });
      }
    );

    test(
      "generates unique transition ids",
      () => {
        const service =
          new LifecyclePersistenceService();

        const first =
          service
            .generateTransitionId(
              baseInput()
            );

        const second =
          service
            .generateTransitionId(
              baseInput()
            );

        expect(
          first
        )
          .toMatch(
            /^transition_/
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
      "rejects execution authorization",
      async () => {
        const service =
          new LifecyclePersistenceService();

        await expect(
          service.persistTransition({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "LIFECYCLE_PERSISTENCE_UNSAFE_INPUT",
          });
      }
    );
  }
);