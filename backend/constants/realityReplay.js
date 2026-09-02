"use strict";


const REALITY_REPLAY_VERSION =
  "23R.4.0";


const REPLAY_RUN_STATUS =
  Object.freeze({
    READY:
      "READY",

    RUNNING:
      "RUNNING",

    PAUSED:
      "PAUSED",

    COMPLETED:
      "COMPLETED",

    FAILED:
      "FAILED",
  });


const REPLAY_EVENT_STATUS =
  Object.freeze({
    PENDING:
      "PENDING",

    RELEASED:
      "RELEASED",
  });


const REPLAY_COMMAND =
  Object.freeze({
    PLAY:
      "PLAY",

    PAUSE:
      "PAUSE",

    RESUME:
      "RESUME",

    STEP:
      "STEP",

    CHECKPOINT:
      "CHECKPOINT",

    RESTART:
      "RESTART",
  });


const SEALED_REPLAY_KEYS =
  Object.freeze(
    [
      "sealedEvaluation",

      "evaluationRubric",

      "groundTruth",

      "knownFault",

      "expectedDiagnosis",

      "acceptableDiagnoses",

      "expectedRecoveryFamily",

      "rootCause",

      "trustedGroundTruth",
    ]
  );


function isReplayRunStatus(
  value
) {
  return Object.values(
    REPLAY_RUN_STATUS
  ).includes(
    value
  );
}


function isReplayEventStatus(
  value
) {
  return Object.values(
    REPLAY_EVENT_STATUS
  ).includes(
    value
  );
}


module.exports = {
  REALITY_REPLAY_VERSION,

  REPLAY_RUN_STATUS,

  REPLAY_EVENT_STATUS,

  REPLAY_COMMAND,

  SEALED_REPLAY_KEYS,

  isReplayRunStatus,

  isReplayEventStatus,
};