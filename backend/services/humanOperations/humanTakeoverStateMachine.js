"use strict";

const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
  ASSIGNMENT_STATUS,
} = require(
  "../../constants/humanTakeover"
);


const HUMAN_TASK_TRANSITIONS =
  Object.freeze({
    [HUMAN_TASK_STATUS.OPEN]:
      Object.freeze([
        HUMAN_TASK_STATUS.ASSIGNED,
        HUMAN_TASK_STATUS.WAITING,
        HUMAN_TASK_STATUS.CANCELLED,
        HUMAN_TASK_STATUS.EXPIRED,
      ]),

    [HUMAN_TASK_STATUS.ASSIGNED]:
      Object.freeze([
        HUMAN_TASK_STATUS.ACKNOWLEDGED,
        HUMAN_TASK_STATUS.WAITING,
        HUMAN_TASK_STATUS.CANCELLED,
        HUMAN_TASK_STATUS.EXPIRED,
      ]),

    [HUMAN_TASK_STATUS.ACKNOWLEDGED]:
      Object.freeze([
        HUMAN_TASK_STATUS.IN_PROGRESS,
        HUMAN_TASK_STATUS.WAITING,
        HUMAN_TASK_STATUS.RESOLVED,
        HUMAN_TASK_STATUS.CANCELLED,
        HUMAN_TASK_STATUS.EXPIRED,
      ]),

    [HUMAN_TASK_STATUS.IN_PROGRESS]:
      Object.freeze([
        HUMAN_TASK_STATUS.WAITING,
        HUMAN_TASK_STATUS.RESOLVED,
        HUMAN_TASK_STATUS.CANCELLED,
        HUMAN_TASK_STATUS.EXPIRED,
      ]),

    [HUMAN_TASK_STATUS.WAITING]:
      Object.freeze([
        HUMAN_TASK_STATUS.ASSIGNED,
        HUMAN_TASK_STATUS.ACKNOWLEDGED,
        HUMAN_TASK_STATUS.IN_PROGRESS,
        HUMAN_TASK_STATUS.RESOLVED,
        HUMAN_TASK_STATUS.CANCELLED,
        HUMAN_TASK_STATUS.EXPIRED,
      ]),

    [HUMAN_TASK_STATUS.RESOLVED]:
      Object.freeze([]),

    [HUMAN_TASK_STATUS.CANCELLED]:
      Object.freeze([]),

    [HUMAN_TASK_STATUS.EXPIRED]:
      Object.freeze([]),
  });


const TAKEOVER_SESSION_TRANSITIONS =
  Object.freeze({
    [TAKEOVER_SESSION_STATUS.REQUESTED]:
      Object.freeze([
        TAKEOVER_SESSION_STATUS.AUTHORIZED,
        TAKEOVER_SESSION_STATUS.DENIED,
        TAKEOVER_SESSION_STATUS.EXPIRED,
        TAKEOVER_SESSION_STATUS.REVOKED,
      ]),

    [TAKEOVER_SESSION_STATUS.AUTHORIZED]:
      Object.freeze([
        TAKEOVER_SESSION_STATUS.ACTIVE,
        TAKEOVER_SESSION_STATUS.EXPIRED,
        TAKEOVER_SESSION_STATUS.REVOKED,
      ]),

    [TAKEOVER_SESSION_STATUS.ACTIVE]:
      Object.freeze([
        TAKEOVER_SESSION_STATUS.RELEASING,
        TAKEOVER_SESSION_STATUS.EXPIRED,
        TAKEOVER_SESSION_STATUS.REVOKED,
      ]),

    [TAKEOVER_SESSION_STATUS.RELEASING]:
      Object.freeze([
        TAKEOVER_SESSION_STATUS.RELEASED,
        TAKEOVER_SESSION_STATUS.EXPIRED,
        TAKEOVER_SESSION_STATUS.REVOKED,
      ]),

    [TAKEOVER_SESSION_STATUS.RELEASED]:
      Object.freeze([]),

    [TAKEOVER_SESSION_STATUS.EXPIRED]:
      Object.freeze([]),

    [TAKEOVER_SESSION_STATUS.REVOKED]:
      Object.freeze([]),

    [TAKEOVER_SESSION_STATUS.DENIED]:
      Object.freeze([]),
  });


const CONTROL_LEASE_TRANSITIONS =
  Object.freeze({
    [CONTROL_LEASE_STATUS.PENDING]:
      Object.freeze([
        CONTROL_LEASE_STATUS.ACTIVE,
        CONTROL_LEASE_STATUS.EXPIRED,
        CONTROL_LEASE_STATUS.REVOKED,
      ]),

    [CONTROL_LEASE_STATUS.ACTIVE]:
      Object.freeze([
        CONTROL_LEASE_STATUS.RELEASED,
        CONTROL_LEASE_STATUS.EXPIRED,
        CONTROL_LEASE_STATUS.REVOKED,
      ]),

    [CONTROL_LEASE_STATUS.RELEASED]:
      Object.freeze([]),

    [CONTROL_LEASE_STATUS.EXPIRED]:
      Object.freeze([]),

    [CONTROL_LEASE_STATUS.REVOKED]:
      Object.freeze([]),
  });


const ASSIGNMENT_TRANSITIONS =
  Object.freeze({
    [ASSIGNMENT_STATUS.ACTIVE]:
      Object.freeze([
        ASSIGNMENT_STATUS.REASSIGNED,
        ASSIGNMENT_STATUS.RELEASED,
        ASSIGNMENT_STATUS.EXPIRED,
      ]),

    [ASSIGNMENT_STATUS.REASSIGNED]:
      Object.freeze([]),

    [ASSIGNMENT_STATUS.RELEASED]:
      Object.freeze([]),

    [ASSIGNMENT_STATUS.EXPIRED]:
      Object.freeze([]),
  });


function createTransitionError({
  domain,
  from,
  to,
}) {
  return Object.assign(
    new Error(
      `${domain} transition ${from} -> ${to} is not allowed`
    ),
    {
      code:
        "HUMAN_TAKEOVER_INVALID_STATE_TRANSITION",

      status:
        409,

      domain,
      from,
      to,

      executionAuthorized:
        false,
    }
  );
}


function requireKnownState(
  transitions,
  state,
  domain
) {
  if (
    !Object.prototype
      .hasOwnProperty
      .call(
        transitions,
        state
      )
  ) {
    throw Object.assign(
      new Error(
        `Unknown ${domain} state: ${state}`
      ),
      {
        code:
          "HUMAN_TAKEOVER_UNKNOWN_STATE",

        status:
          422,

        domain,
        state,

        executionAuthorized:
          false,
      }
    );
  }

  return state;
}


function canTransition(
  transitions,
  from,
  to
) {
  requireKnownState(
    transitions,
    from,
    "state machine"
  );

  requireKnownState(
    transitions,
    to,
    "state machine"
  );

  return transitions[
    from
  ].includes(
    to
  );
}


function assertTransition(
  transitions,
  domain,
  from,
  to
) {
  requireKnownState(
    transitions,
    from,
    domain
  );

  requireKnownState(
    transitions,
    to,
    domain
  );

  if (
    !transitions[
      from
    ].includes(
      to
    )
  ) {
    throw createTransitionError({
      domain,
      from,
      to,
    });
  }

  return true;
}


function canHumanTaskTransition(
  from,
  to
) {
  return canTransition(
    HUMAN_TASK_TRANSITIONS,
    from,
    to
  );
}


function assertHumanTaskTransition(
  from,
  to
) {
  return assertTransition(
    HUMAN_TASK_TRANSITIONS,
    "HumanTask",
    from,
    to
  );
}


function canTakeoverSessionTransition(
  from,
  to
) {
  return canTransition(
    TAKEOVER_SESSION_TRANSITIONS,
    from,
    to
  );
}


function assertTakeoverSessionTransition(
  from,
  to
) {
  return assertTransition(
    TAKEOVER_SESSION_TRANSITIONS,
    "TakeoverSession",
    from,
    to
  );
}


function canControlLeaseTransition(
  from,
  to
) {
  return canTransition(
    CONTROL_LEASE_TRANSITIONS,
    from,
    to
  );
}


function assertControlLeaseTransition(
  from,
  to
) {
  return assertTransition(
    CONTROL_LEASE_TRANSITIONS,
    "ControlLease",
    from,
    to
  );
}


function canAssignmentTransition(
  from,
  to
) {
  return canTransition(
    ASSIGNMENT_TRANSITIONS,
    from,
    to
  );
}


function assertAssignmentTransition(
  from,
  to
) {
  return assertTransition(
    ASSIGNMENT_TRANSITIONS,
    "Assignment",
    from,
    to
  );
}


function isTerminalHumanTaskState(
  state
) {
  requireKnownState(
    HUMAN_TASK_TRANSITIONS,
    state,
    "HumanTask"
  );

  return (
    HUMAN_TASK_TRANSITIONS[
      state
    ].length === 0
  );
}


function isTerminalTakeoverSessionState(
  state
) {
  requireKnownState(
    TAKEOVER_SESSION_TRANSITIONS,
    state,
    "TakeoverSession"
  );

  return (
    TAKEOVER_SESSION_TRANSITIONS[
      state
    ].length === 0
  );
}


function isTerminalControlLeaseState(
  state
) {
  requireKnownState(
    CONTROL_LEASE_TRANSITIONS,
    state,
    "ControlLease"
  );

  return (
    CONTROL_LEASE_TRANSITIONS[
      state
    ].length === 0
  );
}


module.exports = {
  HUMAN_TASK_TRANSITIONS,
  TAKEOVER_SESSION_TRANSITIONS,
  CONTROL_LEASE_TRANSITIONS,
  ASSIGNMENT_TRANSITIONS,

  canHumanTaskTransition,
  assertHumanTaskTransition,

  canTakeoverSessionTransition,
  assertTakeoverSessionTransition,

  canControlLeaseTransition,
  assertControlLeaseTransition,

  canAssignmentTransition,
  assertAssignmentTransition,

  isTerminalHumanTaskState,
  isTerminalTakeoverSessionState,
  isTerminalControlLeaseState,
};