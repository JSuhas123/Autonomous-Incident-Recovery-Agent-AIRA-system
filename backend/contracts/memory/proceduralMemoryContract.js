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


function assertValidProceduralMemory(
  value
) {
  return assertValidMemory({
    ...value,

    memoryType:
      MEMORY_TYPES.PROCEDURAL,
  });
}


module.exports = {
  assertValidProceduralMemory,
};