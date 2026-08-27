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


function assertValidSemanticMemory(
  value
) {
  return assertValidMemory({
    ...value,

    memoryType:
      MEMORY_TYPES.SEMANTIC,
  });
}


module.exports = {
  assertValidSemanticMemory,
};