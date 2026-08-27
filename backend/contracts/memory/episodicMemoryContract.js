"use strict";


const {
  MEMORY_TYPES,
} =
  require(
    "../../constants/memoryTypes"
  );


const {
  assertValidMemory,
} =
  require(
    "./memoryContract"
  );


function assertValidEpisodicMemory(
  value
) {
  return assertValidMemory({
    ...value,

    memoryType:
      MEMORY_TYPES.EPISODIC,
  });
}


module.exports = {
  assertValidEpisodicMemory,
};