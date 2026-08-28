"use strict";


const RESOURCE_CAPABILITIES =
  Object.freeze({

    READ_STATE:
      "READ_STATE",

    READ_METRICS:
      "READ_METRICS",

    READ_LOGS:
      "READ_LOGS",

    READ_EVENTS:
      "READ_EVENTS",

    RESTART:
      "RESTART",

    STOP:
      "STOP",

    START:
      "START",

    SCALE:
      "SCALE",

    ROLLBACK:
      "ROLLBACK",

    FAILOVER:
      "FAILOVER",

    EXEC_COMMAND:
      "EXEC_COMMAND",

    UPDATE_CONFIG:
      "UPDATE_CONFIG",

    ROTATE_SECRET:
      "ROTATE_SECRET",

    CORDON:
      "CORDON",

    DRAIN:
      "DRAIN",

    SNAPSHOT:
      "SNAPSHOT",

    RESTORE:
      "RESTORE",

    ROBOT_STOP:
      "ROBOT_STOP",

    ROBOT_RECALIBRATE:
      "ROBOT_RECALIBRATE",

    ROBOT_RETURN_HOME:
      "ROBOT_RETURN_HOME",
  });


const RESOURCE_CAPABILITY_VALUES =
  Object.freeze(
    Object.values(
      RESOURCE_CAPABILITIES
    )
  );


function isKnownResourceCapability(
  value
) {
  return (
    typeof value ===
      "string" &&
    RESOURCE_CAPABILITY_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  RESOURCE_CAPABILITIES,

  RESOURCE_CAPABILITY_VALUES,

  isKnownResourceCapability,
};