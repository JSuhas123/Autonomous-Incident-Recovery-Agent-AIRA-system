"use strict";

/**
 * ============================================================================
 * AIRA INTEGRATION ADAPTER CONTRACT
 * PHASE 20 — INTEGRATION PLATFORM
 * ============================================================================
 *
 * Canonical Phase 20 provider-facing operations:
 *
 *   receiveSignals()
 *
 *   queryMetrics()
 *   queryLogs()
 *   queryTraces()
 *
 *   discoverResources()
 *   discoverRelationships()
 *
 *   getChanges()
 *
 *   executeCapability()
 *
 *   sendNotification()
 *
 *   healthCheck()
 *
 *
 * BACKWARD COMPATIBILITY
 * ----------------------
 *
 * Existing Phase 14-era adapters currently implement:
 *
 *   receiveEvent()
 *   normalizeEvent()
 *   getHealth()
 *   revoke()
 *
 * These remain part of the adapter contract during Phase 20 migration.
 *
 * They will not be removed until their callers and providers have been
 * migrated to the Phase 20 SDK.
 *
 *
 * SAFETY
 * ------
 *
 * Adapter capability never implies authorization.
 *
 * executeCapability() is only the deterministic technical provider boundary
 * for an execution request which has already passed the appropriate AIRA
 * policy / approval / authorization systems.
 *
 * An adapter must never decide that execution is authorized.
 *
 * Unsupported operations fail explicitly with UnsupportedOperationError.
 * ============================================================================
 */


const {
  INTEGRATION_CAPABILITY,

  INTEGRATION_CAPABILITIES,

  INTEGRATION_OPERATION_CAPABILITY_MAP,
} =
  require(
    "../../constants/integrationPlatform"
  );


const ADAPTER_CAPABILITIES =
  INTEGRATION_CAPABILITIES;


/*
 * Existing method names are retained here so old adapters continue to
 * describe the same persisted capabilities.
 *
 * Phase 20 introduces canonical aliases such as receiveSignals() and
 * healthCheck() without changing existing stored capability values.
 */
const METHOD_CAPABILITY_MAP =
  Object.freeze({
    receiveSignals:
      INTEGRATION_CAPABILITY
        .RECEIVE_SIGNALS,

    receiveEvent:
      INTEGRATION_CAPABILITY
        .RECEIVE_SIGNALS,

    normalizeEvent:
      INTEGRATION_CAPABILITY
        .NORMALIZE_SIGNALS,

    sendNotification:
      INTEGRATION_CAPABILITY
        .SEND_NOTIFICATION,

    healthCheck:
      INTEGRATION_CAPABILITY
        .HEALTH_CHECK,

    getHealth:
      INTEGRATION_CAPABILITY
        .HEALTH_CHECK,

    discoverResources:
      INTEGRATION_CAPABILITY
        .DISCOVER_RESOURCES,

    discoverRelationships:
      INTEGRATION_CAPABILITY
        .DISCOVER_RELATIONSHIPS,

    getChanges:
      INTEGRATION_CAPABILITY
        .GET_CHANGES,

    executeCapability:
      INTEGRATION_CAPABILITY
        .EXECUTE_CAPABILITY,

    queryMetrics:
      INTEGRATION_CAPABILITY
        .QUERY_METRICS,

    queryLogs:
      INTEGRATION_CAPABILITY
        .QUERY_LOGS,

    queryTraces:
      INTEGRATION_CAPABILITY
        .QUERY_TRACES,

    revoke:
      INTEGRATION_CAPABILITY
        .REVOKE,

    ...INTEGRATION_OPERATION_CAPABILITY_MAP,
  });


class UnsupportedOperationError
  extends Error {
  constructor(
    provider,
    method
  ) {
    super(
      `Adapter "${provider}" does not implement "${method}"`
    );


    this.name =
      "UnsupportedOperationError";


    this.code =
      "UNSUPPORTED_OPERATION";


    this.status =
      501;


    this.provider =
      provider;


    this.method =
      method;


    /*
     * Unsupported capability is not an authorization result.
     */
    this.executionAuthorized =
      false;
  }
}


function unsupported(
  provider,
  method
) {
  return async () => {
    throw new UnsupportedOperationError(
      provider,
      method
    );
  };
}


function unsupportedSync(
  provider,
  method
) {
  return () => {
    throw new UnsupportedOperationError(
      provider,
      method
    );
  };
}


function normalizeCapabilities(
  capabilities = []
) {
  const unique = [
    ...new Set(
      Array.isArray(
        capabilities
      )
        ? capabilities
        : []
    ),
  ];


  const invalid =
    unique.filter(
      (
        capability
      ) =>
        !ADAPTER_CAPABILITIES
          .includes(
            capability
          )
    );


  if (
    invalid.length >
    0
  ) {
    throw Object.assign(
      new Error(
        `Unknown adapter capabilities: ${invalid.join(
          ", "
        )}`
      ),
      {
        code:
          "INVALID_ADAPTER_CAPABILITY",

        invalidCapabilities:
          invalid,

        executionAuthorized:
          false,
      }
    );
  }


  return unique;
}


function makeStubAdapter(
  provider,
  capabilities = []
) {
  const normalizedCapabilities =
    normalizeCapabilities(
      capabilities
    );


  return {
    provider,

    capabilities:
      normalizedCapabilities,


    getCapabilities() {
      return [
        ...normalizedCapabilities,
      ];
    },


    // ========================================================================
    // PROVIDER LIFECYCLE
    // ========================================================================

    validateConfiguration:
      unsupported(
        provider,
        "validateConfiguration"
      ),


    testConnection:
      unsupported(
        provider,
        "testConnection"
      ),


    // ========================================================================
    // SIGNAL INGESTION
    // ========================================================================

    /*
     * Canonical Phase 20 ingress method.
     *
     * Existing providers can continue implementing receiveEvent() until
     * migrated in Phase 20.8.
     */
    receiveSignals:
      unsupported(
        provider,
        "receiveSignals"
      ),


    /*
     * Legacy compatibility method.
     */
    receiveEvent:
      unsupported(
        provider,
        "receiveEvent"
      ),


    normalizeEvent:
      unsupportedSync(
        provider,
        "normalizeEvent"
      ),


    // ========================================================================
    // NOTIFICATIONS
    // ========================================================================

    sendNotification:
      unsupported(
        provider,
        "sendNotification"
      ),


    // ========================================================================
    // HEALTH
    // ========================================================================

    /*
     * Canonical Phase 20 health operation.
     */
    healthCheck:
      unsupported(
        provider,
        "healthCheck"
      ),


    /*
     * Existing compatibility operation.
     */
    getHealth:
      unsupported(
        provider,
        "getHealth"
      ),


    // ========================================================================
    // RESOURCE / TOPOLOGY DISCOVERY
    // ========================================================================

    discoverResources:
      unsupported(
        provider,
        "discoverResources"
      ),


    discoverRelationships:
      unsupported(
        provider,
        "discoverRelationships"
      ),


    getChanges:
      unsupported(
        provider,
        "getChanges"
      ),


    // ========================================================================
    // EXECUTION
    // ========================================================================

    /*
     * IMPORTANT:
     *
     * Presence of this method means only:
     *
     *   "this provider may have a deterministic implementation for a
     *    capability"
     *
     * It NEVER means:
     *
     *   "this provider may decide whether execution is permitted"
     */
    executeCapability:
      unsupported(
        provider,
        "executeCapability"
      ),


    // ========================================================================
    // TELEMETRY
    // ========================================================================

    queryMetrics:
      unsupported(
        provider,
        "queryMetrics"
      ),


    queryLogs:
      unsupported(
        provider,
        "queryLogs"
      ),


    queryTraces:
      unsupported(
        provider,
        "queryTraces"
      ),


    // ========================================================================
    // REVOCATION
    // ========================================================================

    revoke:
      unsupported(
        provider,
        "revoke"
      ),
  };
}


function validateNormalizedEvent(
  event
) {
  if (
    !event ||
    typeof event !==
      "object" ||
    Array.isArray(
      event
    )
  ) {
    return {
      valid:
        false,

      errors: [
        "Normalized event must be an object",
      ],
    };
  }


  const errors =
    [];


  if (
    !event.provider
  ) {
    errors.push(
      "provider is required"
    );
  }


  if (
    !event.eventType
  ) {
    errors.push(
      "eventType is required"
    );
  }


  if (
    !event.title
  ) {
    errors.push(
      "title is required"
    );
  }


  if (
    !event.severity
  ) {
    errors.push(
      "severity is required"
    );
  }


  if (
    !event.receivedAt
  ) {
    errors.push(
      "receivedAt is required"
    );
  }


  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


function validateAdapterContract(
  adapter
) {
  const errors =
    [];


  if (
    !adapter ||
    typeof adapter !==
      "object"
  ) {
    return {
      valid:
        false,

      errors: [
        "Adapter must export an object",
      ],
    };
  }


  if (
    !adapter.provider ||
    typeof adapter.provider !==
      "string"
  ) {
    errors.push(
      "provider must be a non-empty string"
    );
  }


  try {
    normalizeCapabilities(
      adapter.capabilities
    );
  } catch (
    error
  ) {
    errors.push(
      error.message
    );
  }


  /*
   * All adapters expose the same SDK surface.
   *
   * A provider that does not support an operation must expose the stub and
   * fail with UnsupportedOperationError rather than silently omitting the
   * method.
   */
  const requiredMethods = [
    "getCapabilities",

    "validateConfiguration",

    "testConnection",

    "receiveSignals",

    "receiveEvent",

    "normalizeEvent",

    "sendNotification",

    "healthCheck",

    "getHealth",

    "discoverResources",

    "discoverRelationships",

    "getChanges",

    "executeCapability",

    "queryMetrics",

    "queryLogs",

    "queryTraces",

    "revoke",
  ];


  for (
    const method
    of requiredMethods
  ) {
    if (
      typeof adapter[
        method
      ] !==
      "function"
    ) {
      errors.push(
        `${method} must be a function`
      );
    }
  }


  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


module.exports = {
  ADAPTER_CAPABILITIES,

  METHOD_CAPABILITY_MAP,

  UnsupportedOperationError,

  makeStubAdapter,

  normalizeCapabilities,

  validateNormalizedEvent,

  validateAdapterContract,
};