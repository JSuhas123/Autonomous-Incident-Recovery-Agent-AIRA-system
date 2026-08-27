"use strict";


const MEMORY_SCOPES =
  Object.freeze({

    GLOBAL:
      "GLOBAL",

    TENANT:
      "TENANT",

    ENVIRONMENT:
      "ENVIRONMENT",

    SERVICE:
      "SERVICE",

    RESOURCE:
      "RESOURCE",

    INCIDENT:
      "INCIDENT",
  });


const MEMORY_SCOPE_VALUES =
  Object.freeze(
    Object.values(
      MEMORY_SCOPES
    )
  );


function isKnownMemoryScope(
  value
) {
  return (
    typeof value ===
      "string" &&
    MEMORY_SCOPE_VALUES
      .includes(
        value
      )
  );
}


function isTenantScopedMemory(
  value
) {
  return (
    isKnownMemoryScope(
      value
    ) &&
    value !==
      MEMORY_SCOPES.GLOBAL
  );
}


module.exports = {
  MEMORY_SCOPES,

  MEMORY_SCOPE_VALUES,

  isKnownMemoryScope,

  isTenantScopedMemory,
};