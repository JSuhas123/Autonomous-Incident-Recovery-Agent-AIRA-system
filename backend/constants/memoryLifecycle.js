"use strict";


const MEMORY_STATUSES =
  Object.freeze({

    ACTIVE:
      "ACTIVE",

    SUPERSEDED:
      "SUPERSEDED",

    ARCHIVED:
      "ARCHIVED",

    INVALIDATED:
      "INVALIDATED",
  });


const MEMORY_STATUS_VALUES =
  Object.freeze(
    Object.values(
      MEMORY_STATUSES
    )
  );


const TERMINAL_MEMORY_STATUSES =
  Object.freeze([
    MEMORY_STATUSES.SUPERSEDED,
    MEMORY_STATUSES.ARCHIVED,
    MEMORY_STATUSES.INVALIDATED,
  ]);


function isKnownMemoryStatus(
  value
) {
  return (
    typeof value ===
      "string" &&
    MEMORY_STATUS_VALUES
      .includes(
        value
      )
  );
}


function isActiveMemory(
  value
) {
  return (
    value ===
    MEMORY_STATUSES.ACTIVE
  );
}


function isTerminalMemoryStatus(
  value
) {
  return (
    typeof value ===
      "string" &&
    TERMINAL_MEMORY_STATUSES
      .includes(
        value
      )
  );
}


module.exports = {
  MEMORY_STATUSES,

  MEMORY_STATUS_VALUES,

  TERMINAL_MEMORY_STATUSES,

  isKnownMemoryStatus,

  isActiveMemory,

  isTerminalMemoryStatus,
};