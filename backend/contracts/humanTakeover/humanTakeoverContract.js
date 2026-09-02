"use strict";

const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
  ASSIGNMENT_STATUS,
  ACKNOWLEDGEMENT_OUTCOME,
  HUMAN_TAKEOVER_INVARIANTS,
} = require("../../constants/humanTakeover");

function assertHumanTakeoverSafetyContract() {
  if (!HUMAN_TAKEOVER_INVARIANTS.NEVER_AUTHORIZES_EXECUTION) {
    throw new Error(
      "Human takeover must never manufacture execution authorization"
    );
  }

  if (!HUMAN_TAKEOVER_INVARIANTS.EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT) {
    throw new Error(
      "Human takeover requires exclusive incident control"
    );
  }

  if (!HUMAN_TAKEOVER_INVARIANTS.POSTGRES_IS_CONTROL_AUTHORITY) {
    throw new Error(
      "PostgreSQL must remain authoritative for control ownership"
    );
  }

  if (!HUMAN_TAKEOVER_INVARIANTS.RETURN_REQUIRES_REEVALUATION) {
    throw new Error(
      "Return control must require complete re-evaluation"
    );
  }

  if (!HUMAN_TAKEOVER_INVARIANTS.STALE_PLAN_RESUME_PROHIBITED) {
    throw new Error(
      "Stale execution plans must never resume after takeover"
    );
  }

  return true;
}

module.exports = {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
  ASSIGNMENT_STATUS,
  ACKNOWLEDGEMENT_OUTCOME,
  HUMAN_TAKEOVER_INVARIANTS,
  assertHumanTakeoverSafetyContract,
};