"use strict";

/**
 * Phase 18.19
 *
 * Defines the minimum completeness rules for production domain packs.
 *
 * Note:
 * "database.mongodb" means CUSTOMER MongoDB infrastructure support.
 * It does NOT mean MongoDB is an AIRA internal persistence authority.
 */
const PRODUCTION_DOMAIN_PACKS =
  Object.freeze({
    KUBERNETES: {
      domain:
        "kubernetes",

      required:
        true,
    },

    POSTGRESQL: {
      domain:
        "database.postgresql",

      required:
        true,
    },

    MONGODB_CUSTOMER_INFRASTRUCTURE: {
      domain:
        "database.mongodb",

      required:
        true,
    },

    NETWORKING: {
      domain:
        "networking",

      required:
        true,
    },

    OBSERVABILITY: {
      domain:
        "observability",

      required:
        true,
    },

    MESSAGING: {
      domain:
        "messaging",

      required:
        true,
    },

    CLOUD: {
      domain:
        "cloud",

      required:
        false,
    },

    CI_CD: {
      domain:
        "ci_cd",

      required:
        false,
    },

    SECURITY: {
      domain:
        "security",

      required:
        false,
    },

    ROBOTICS: {
      domain:
        "robotics",

      required:
        false,
    },
  });


function validateProductionDomainPack(
  pack = {}
) {
  const errors = [];

  if (
    !pack.packId &&
    !pack.id
  ) {
    errors.push(
      "PACK_ID_REQUIRED"
    );
  }

  if (
    !pack.domain
  ) {
    errors.push(
      "DOMAIN_REQUIRED"
    );
  }

  if (
    !Array.isArray(
      pack.failureModes
    ) ||
    !pack.failureModes.length
  ) {
    errors.push(
      "FAILURE_MODES_REQUIRED"
    );
  }

  if (
    !Array.isArray(
      pack.playbooks
    ) ||
    !pack.playbooks.length
  ) {
    errors.push(
      "PLAYBOOKS_REQUIRED"
    );
  }

  if (
    !Array.isArray(
      pack.runbooks
    ) ||
    !pack.runbooks.length
  ) {
    errors.push(
      "RUNBOOKS_REQUIRED"
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    executionAuthorized:
      false,
  };
}


module.exports = {
  PRODUCTION_DOMAIN_PACKS,
  validateProductionDomainPack,
};