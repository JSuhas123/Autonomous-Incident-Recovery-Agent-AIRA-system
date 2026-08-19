"use strict";

const mongoose =
  require(
    "mongoose"
  );

const PersistenceIdentifierPolicy =
  require(
    "./PersistenceIdentifierPolicy"
  );

class MongoIdentifierPolicy
  extends PersistenceIdentifierPolicy {
  isValid(
    value
  ) {
    return Boolean(
      value &&
      mongoose.Types.ObjectId
        .isValid(
          value
        )
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
  MongoIdentifierPolicy;