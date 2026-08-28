"use strict";


const RESOURCE_HEALTH =
  Object.freeze({

    UNKNOWN:
      "UNKNOWN",

    HEALTHY:
      "HEALTHY",

    DEGRADED:
      "DEGRADED",

    UNHEALTHY:
      "UNHEALTHY",

    CRITICAL:
      "CRITICAL",
  });


const RESOURCE_HEALTH_VALUES =
  Object.freeze(
    Object.values(
      RESOURCE_HEALTH
    )
  );


const RESOURCE_LIFECYCLE =
  Object.freeze({

    UNKNOWN:
      "UNKNOWN",

    DISCOVERED:
      "DISCOVERED",

    STARTING:
      "STARTING",

    RUNNING:
      "RUNNING",

    STOPPING:
      "STOPPING",

    STOPPED:
      "STOPPED",

    TERMINATED:
      "TERMINATED",

    DELETED:
      "DELETED",
  });


const RESOURCE_LIFECYCLE_VALUES =
  Object.freeze(
    Object.values(
      RESOURCE_LIFECYCLE
    )
  );


const KNOWN_GOOD_STATUSES =
  Object.freeze({

    ACTIVE:
      "ACTIVE",

    SUPERSEDED:
      "SUPERSEDED",

    EXPIRED:
      "EXPIRED",

    REVOKED:
      "REVOKED",
  });


const KNOWN_GOOD_STATUS_VALUES =
  Object.freeze(
    Object.values(
      KNOWN_GOOD_STATUSES
    )
  );


const RELATIONSHIP_CHANGE_TYPES =
  Object.freeze({

    CREATED:
      "CREATED",

    UPDATED:
      "UPDATED",

    REMOVED:
      "REMOVED",

    REACTIVATED:
      "REACTIVATED",
  });


const RELATIONSHIP_CHANGE_TYPE_VALUES =
  Object.freeze(
    Object.values(
      RELATIONSHIP_CHANGE_TYPES
    )
  );


module.exports = {
  RESOURCE_HEALTH,

  RESOURCE_HEALTH_VALUES,

  RESOURCE_LIFECYCLE,

  RESOURCE_LIFECYCLE_VALUES,

  KNOWN_GOOD_STATUSES,

  KNOWN_GOOD_STATUS_VALUES,

  RELATIONSHIP_CHANGE_TYPES,

  RELATIONSHIP_CHANGE_TYPE_VALUES,
};