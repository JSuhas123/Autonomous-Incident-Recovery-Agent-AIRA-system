"use strict";

const PersistenceIdentifierPolicy =
  require(
    "../identifiers/PersistenceIdentifierPolicy"
  );

class PostgresIdentifierPolicy
  extends PersistenceIdentifierPolicy {
  isValid(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return false;
    }

    const normalized =
      String(
        value
      )
        .trim();

    if (
      normalized.length ===
        0 ||
      normalized.length >
        255
    ) {
      return false;
    }

    return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
      .test(
        normalized
      );
  }

  isValidOrganizationId(
    value
  ) {
    return this.isValid(
      value
    );
  }

  isValidEnvironmentId(
    value
  ) {
    return this.isValid(
      value
    );
  }

  isValidIncidentId(
    value
  ) {
    return this.isValid(
      value
    );
  }

  isValidResourceId(
    value
  ) {
    return this.isValid(
      value
    );
  }
}

module.exports =
  PostgresIdentifierPolicy;