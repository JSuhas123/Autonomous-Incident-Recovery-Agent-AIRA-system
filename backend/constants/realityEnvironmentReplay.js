"use strict";


const REALITY_ENVIRONMENT_REPLAY_VERSION =
  "23R.5.0";


const ENVIRONMENT_REPLAY_MODE =
  Object.freeze({
    DOCKER:
      "DOCKER",

    KUBERNETES:
      "KUBERNETES",
  });


const ENVIRONMENT_REPLAY_STAGE =
  Object.freeze({
    VALIDATING:
      "VALIDATING",

    LAB_RESERVED:
      "LAB_RESERVED",

    FAULT_INJECTED:
      "FAULT_INJECTED",

    FAILED:
      "FAILED",
  });


const ENVIRONMENT_REPLAY_AUTHORITY =
  Object.freeze({
    REALITY_REPLAY:
      "PHASE_23R_REPLAY_IDENTITY",

    LAB_ENVIRONMENT:
      "PHASE_21_RELIABILITY_LAB",

    FAILURE_INJECTION:
      "PHASE_21_FAILURE_INJECTION_ENGINE",
  });


function isEnvironmentReplayMode(
  value
) {
  return Object.values(
    ENVIRONMENT_REPLAY_MODE
  ).includes(
    value
  );
}


module.exports = {
  REALITY_ENVIRONMENT_REPLAY_VERSION,

  ENVIRONMENT_REPLAY_MODE,

  ENVIRONMENT_REPLAY_STAGE,

  ENVIRONMENT_REPLAY_AUTHORITY,

  isEnvironmentReplayMode,
};