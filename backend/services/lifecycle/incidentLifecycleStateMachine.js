"use strict";

/**
 * AIRA Incident Lifecycle State Machine
 *
 * Phase 10.2
 *
 * Central guarded state-transition engine.
 *
 * Responsibilities:
 *
 * - validate current state
 * - validate requested next state
 * - enforce canonical transition graph
 * - preserve transition reason / actor / metadata
 * - produce transition intent only
 *
 * DOES NOT:
 *
 * - persist incidents
 * - execute rollback
 * - trigger recovery
 * - close infrastructure resources
 * - authorize execution
 */

const {
  INCIDENT_LIFECYCLE_STATE,
  canTransition,
  isValidLifecycleState,
} =
  require(
    "./incidentLifecycleContracts"
  );

class IncidentLifecycleStateMachine {
  transition(
    input = {}
  ) {
    this.assertInput(
      input
    );

    const fromState =
      input.fromState;

    const toState =
      input.toState;

    if (
      fromState ===
      toState
    ) {
      return {
        allowed:
          true,

        noOp:
          true,

        fromState,

        toState,

        reason:
          input.reason ||
          "Incident is already in requested lifecycle state.",

        metadata:
          input.metadata ||
          {},

        transitionedAt:
          new Date(),

        executionAuthorized:
          false,
      };
    }

    if (
      !canTransition(
        fromState,
        toState
      )
    ) {
      throw Object.assign(
        new Error(
          `Invalid incident lifecycle transition: ${fromState} -> ${toState}`
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_TRANSITION_FORBIDDEN",

          fromState,

          toState,
        }
      );
    }

    return {
      allowed:
        true,

      noOp:
        false,

      fromState,

      toState,

      reason:
        input.reason ||
        null,

      actor: {
        type:
          input.actor
            ?.type ||
          "SYSTEM",

        id:
          input.actor
            ?.id ||
          null,
      },

      source: {
        phase:
          input.source
            ?.phase ||
          null,

        component:
          input.source
            ?.component ||
          null,

        referenceId:
          input.source
            ?.referenceId ||
          null,
      },

      metadata: {
        ...(
          input.metadata ||
          {}
        ),

        stateMachineVersion:
          "phase10.2-v1",
      },

      transitionedAt:
        new Date(),

      /*
       * Lifecycle transitions never grant
       * infrastructure execution authority.
       */
      executionAuthorized:
        false,
    };
  }

  canTransition(
    fromState,
    toState
  ) {
    return canTransition(
      fromState,
      toState
    );
  }

  assertState(
    state
  ) {
    if (
      !isValidLifecycleState(
        state
      )
    ) {
      throw Object.assign(
        new Error(
          `Invalid incident lifecycle state: ${state}`
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_STATE_INVALID",

          state,
        }
      );
    }

    return true;
  }

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object" ||
      Object.keys(
        input
      ).length ===
        0
    ) {
      throw Object.assign(
        new Error(
          "Incident lifecycle transition input is required"
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_INPUT_REQUIRED",
        }
      );
    }

    if (
      !input.fromState
    ) {
      throw Object.assign(
        new Error(
          "Incident lifecycle transition requires fromState"
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_FROM_STATE_REQUIRED",
        }
      );
    }

    if (
      !input.toState
    ) {
      throw Object.assign(
        new Error(
          "Incident lifecycle transition requires toState"
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_TO_STATE_REQUIRED",
        }
      );
    }

    this.assertState(
      input.fromState
    );

    this.assertState(
      input.toState
    );

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Incident lifecycle state machine cannot authorize execution"
        ),
        {
          code:
            "INCIDENT_LIFECYCLE_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new IncidentLifecycleStateMachine();

module.exports
  .IncidentLifecycleStateMachine =
  IncidentLifecycleStateMachine;