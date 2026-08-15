"use strict";

const {
  INCIDENT_LIFECYCLE_STATE,
  LIFECYCLE_ACTION,
  LIFECYCLE_EVENT,
  STABILITY_RESULT,
  CLOSURE_DECISION,
  ESCALATION_REASON,
  VALID_TRANSITIONS,
  isValidLifecycleState,
  canTransition,
} =
  require(
    "../incidentLifecycleContracts"
  );

describe(
  "Incident Lifecycle Contracts",
  () => {
    test(
      "defines canonical lifecycle states",
      () => {
        expect(
          INCIDENT_LIFECYCLE_STATE
            .OPEN
        )
          .toBe(
            "OPEN"
          );

        expect(
          INCIDENT_LIFECYCLE_STATE
            .STABILITY_OBSERVATION
        )
          .toBe(
            "STABILITY_OBSERVATION"
          );

        expect(
          INCIDENT_LIFECYCLE_STATE
            .CLOSED
        )
          .toBe(
            "CLOSED"
          );
      }
    );

    test(
      "defines lifecycle actions",
      () => {
        expect(
          LIFECYCLE_ACTION
            .CLOSE_INCIDENT
        )
          .toBe(
            "CLOSE_INCIDENT"
          );

        expect(
          LIFECYCLE_ACTION
            .REQUEST_ROLLBACK
        )
          .toBe(
            "REQUEST_ROLLBACK"
          );
      }
    );

    test(
      "defines lifecycle events",
      () => {
        expect(
          LIFECYCLE_EVENT
            .INCIDENT_CLOSED
        )
          .toBe(
            "lifecycle.incident.closed"
          );
      }
    );

    test(
      "defines stability results",
      () => {
        expect(
          STABILITY_RESULT
            .STABLE
        )
          .toBe(
            "STABLE"
          );

        expect(
          STABILITY_RESULT
            .UNSTABLE
        )
          .toBe(
            "UNSTABLE"
          );
      }
    );

    test(
      "defines closure decisions",
      () => {
        expect(
          CLOSURE_DECISION
            .WAIT_FOR_STABILITY
        )
          .toBe(
            "WAIT_FOR_STABILITY"
          );
      }
    );

    test(
      "defines escalation reasons",
      () => {
        expect(
          ESCALATION_REASON
            .RETRIES_EXHAUSTED
        )
          .toBe(
            "RETRIES_EXHAUSTED"
          );
      }
    );

    test(
      "recognizes valid lifecycle states",
      () => {
        expect(
          isValidLifecycleState(
            "OPEN"
          )
        )
          .toBe(
            true
          );

        expect(
          isValidLifecycleState(
            "MADE_UP_STATE"
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "allows recovered incident to enter stability observation",
      () => {
        expect(
          canTransition(
            INCIDENT_LIFECYCLE_STATE
              .RECOVERED,

            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "does not allow recovered incident to skip directly to closed",
      () => {
        expect(
          canTransition(
            INCIDENT_LIFECYCLE_STATE
              .RECOVERED,

            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "allows resolved incident to close",
      () => {
        expect(
          canTransition(
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
      "allows stability observation to regress",
      () => {
        expect(
          canTransition(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION,

            INCIDENT_LIFECYCLE_STATE
              .REGRESSED
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "closed incident is terminal for automated lifecycle",
      () => {
        expect(
          VALID_TRANSITIONS[
            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          ]
        )
          .toEqual(
            []
          );

        expect(
          canTransition(
            INCIDENT_LIFECYCLE_STATE
              .CLOSED,

            INCIDENT_LIFECYCLE_STATE
              .OPEN
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "contracts are frozen",
      () => {
        expect(
          Object.isFrozen(
            INCIDENT_LIFECYCLE_STATE
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            LIFECYCLE_ACTION
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            VALID_TRANSITIONS
          )
        )
          .toBe(
            true
          );
      }
    );
  }
);