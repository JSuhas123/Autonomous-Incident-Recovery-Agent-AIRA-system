"use strict";

class PersistenceIdentifierPolicy {
  isValidOrganizationId(
    _value
  ) {
    throw new Error(
      "PersistenceIdentifierPolicy.isValidOrganizationId() is not implemented"
    );
  }

  isValidEnvironmentId(
    _value
  ) {
    throw new Error(
      "PersistenceIdentifierPolicy.isValidEnvironmentId() is not implemented"
    );
  }

  isValidIncidentId(
    _value
  ) {
    throw new Error(
      "PersistenceIdentifierPolicy.isValidIncidentId() is not implemented"
    );
  }

  isValidResourceId(
    _value
  ) {
    throw new Error(
      "PersistenceIdentifierPolicy.isValidResourceId() is not implemented"
    );
  }
}

module.exports =
  PersistenceIdentifierPolicy;