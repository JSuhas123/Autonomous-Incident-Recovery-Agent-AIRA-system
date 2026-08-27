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


function assertValidHumanMemory(
  value
) {
  return assertValidMemory({
    ...value,

    memoryType:
      MEMORY_TYPES.HUMAN,
  });
}


module.exports = {
  assertValidHumanMemory,
};