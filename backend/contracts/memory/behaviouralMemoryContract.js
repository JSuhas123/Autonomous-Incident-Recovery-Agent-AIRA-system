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


function assertValidBehaviouralMemory(
  value
) {
  return assertValidMemory({
    ...value,

    memoryType:
      MEMORY_TYPES.BEHAVIOURAL,
  });
}


module.exports = {
  assertValidBehaviouralMemory,
};