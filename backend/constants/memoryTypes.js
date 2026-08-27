"use strict";


const MEMORY_TYPES =
  Object.freeze({

    EPISODIC:
      "EPISODIC",

    SEMANTIC:
      "SEMANTIC",

    PROCEDURAL:
      "PROCEDURAL",

    OUTCOME:
      "OUTCOME",

    HUMAN:
      "HUMAN",

    BEHAVIOURAL:
      "BEHAVIOURAL",
  });


const MEMORY_TYPE_VALUES =
  Object.freeze(
    Object.values(
      MEMORY_TYPES
    )
  );


function isKnownMemoryType(
  value
) {
  return (
    typeof value ===
      "string" &&
    MEMORY_TYPE_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  MEMORY_TYPES,

  MEMORY_TYPE_VALUES,

  isKnownMemoryType,
};