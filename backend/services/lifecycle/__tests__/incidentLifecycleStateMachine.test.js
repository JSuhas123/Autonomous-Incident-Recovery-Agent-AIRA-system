"use strict";

const {
  IncidentLifecycleStateMachine,
} =
  require(
    "../incidentLifecycleStateMachine"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
} =
  require(
    "../incidentLifecycleContracts"
  );

describe(
  "IncidentLifecycleStateMachine",
  () => {
    test(
      "allows recovered to enter stability observation",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .RECOVERED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            reason:
              "Recovery verification confirmed.",
          });

        expect(
          result.allowed
        )
          .toBe(
            true
          );

        expect(
          result.noOp
        )
          .toBe(
            false
          );
      }
    );

    test(
      "allows stability observation to resolve",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .RESOLVED,
          });

        expect(
          result.toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );
      }
    );

    test(
      "allows resolved incident to close",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          machine.canTransition(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED,

            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "blocks recovered to closed shortcut",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .RECOVERED,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .CLOSED,
            })
        )
          .toThrow(
            "Invalid incident lifecycle transition"
          );
      }
    );

    test(
      "allows stability observation to regress",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .REGRESSED,
          });

        expect(
          result.allowed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "allows regression to request retry",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .REGRESSED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .RETRY_PENDING,
          });

        expect(
          result.toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RETRY_PENDING
          );
      }
    );

    test(
      "closed incident cannot automatically reopen",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .CLOSED,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .OPEN,
            })
        )
          .toThrow();
      }
    );

    test(
      "same-state transition is safe no-op",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .VERIFYING,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .VERIFYING,
          });

        expect(
          result.allowed
        )
          .toBe(
            true
          );

        expect(
          result.noOp
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects unknown from state",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                "INVALID",

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .OPEN,
            })
        )
          .toThrow(
            "Invalid incident lifecycle state"
          );
      }
    );

    test(
      "rejects unknown target state",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .OPEN,

              toState:
                "INVALID",
            })
        )
          .toThrow(
            "Invalid incident lifecycle state"
          );
      }
    );

    test(
      "preserves actor and source metadata",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .RECOVERED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,

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
                "closure-guard",

              referenceId:
                "verification-1",
            },
          });

        expect(
          result.actor.id
        )
          .toBe(
            "aira"
          );

        expect(
          result.source.referenceId
        )
          .toBe(
            "verification-1"
          );
      }
    );

    test(
      "never authorizes execution",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        const result =
          machine.transition({
            fromState:
              INCIDENT_LIFECYCLE_STATE
                .RECOVERED,

            toState:
              INCIDENT_LIFECYCLE_STATE
                .STABILITY_OBSERVATION,
          });

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe execution authorization input",
      () => {
        const machine =
          new IncidentLifecycleStateMachine();

        expect(
          () =>
            machine.transition({
              fromState:
                INCIDENT_LIFECYCLE_STATE
                  .RECOVERED,

              toState:
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION,

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );
  }
);