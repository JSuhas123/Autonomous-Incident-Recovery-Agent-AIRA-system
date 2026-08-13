"use strict";

/**
 * Canonical AIRA integration adapter contract.
 *
 * Every provider adapter exports an object containing:
 *
 * provider
 * capabilities
 *
 * getCapabilities()
 *
 * validateConfiguration()
 * testConnection()
 * getHealth()
 *
 * receiveEvent()
 * normalizeEvent()
 * sendNotification()
 *
 * discoverResources()
 * queryMetrics()
 * queryLogs()
 * queryTraces()
 *
 * revoke()
 *
 * Unsupported operations MUST throw UnsupportedOperationError.
 */

const ADAPTER_CAPABILITIES =
  Object.freeze([
    "receive_events",
    "normalize_events",
    "send_notifications",
    "get_health",
    "discover_resources",
    "query_metrics",
    "query_logs",
    "query_traces",
    "revoke",
  ]);

const METHOD_CAPABILITY_MAP =
  Object.freeze({
    receiveEvent:
      "receive_events",

    normalizeEvent:
      "normalize_events",

    sendNotification:
      "send_notifications",

    getHealth:
      "get_health",

    discoverResources:
      "discover_resources",

    queryMetrics:
      "query_metrics",

    queryLogs:
      "query_logs",

    queryTraces:
      "query_traces",

    revoke:
      "revoke",
  });

class UnsupportedOperationError extends Error {
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
  const unique =
    [
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
      (capability) =>
        !ADAPTER_CAPABILITIES.includes(
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

    sendNotification:
      unsupported(
        provider,
        "sendNotification"
      ),

    getHealth:
      unsupported(
        provider,
        "getHealth"
      ),

    discoverResources:
      unsupported(
        provider,
        "discoverResources"
      ),

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

  const errors = [];

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
  const errors = [];

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
  } catch (error) {
    errors.push(
      error.message
    );
  }

  const requiredMethods = [
    "getCapabilities",
    "validateConfiguration",
    "testConnection",
    "receiveEvent",
    "normalizeEvent",
    "sendNotification",
    "getHealth",
    "discoverResources",
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