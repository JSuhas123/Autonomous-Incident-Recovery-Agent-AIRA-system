"use strict";


const {
  INTEGRATION_SDK_VERSION,

  INTEGRATION_CAPABILITIES,

  INTEGRATION_OPERATION,

  INTEGRATION_OPERATION_CAPABILITY_MAP,

  INTEGRATION_RESULT_STATUS,
} =
  require(
    "../../constants/integrationPlatform"
  );


const REQUIRED_SCOPE_FIELDS =
  Object.freeze([
    "organizationId",

    "environmentId",

    "integrationId",

    "provider",
  ]);


function normalizeProvider(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  return (
    normalized ||
    null
  );
}


function validateIntegrationInvocationContext(
  context = {}
) {
  const errors =
    [];


  if (
    !context ||
    typeof context !==
      "object" ||
    Array.isArray(
      context
    )
  ) {
    return {
      valid:
        false,

      errors: [
        "context must be an object",
      ],
    };
  }


  for (
    const field
    of REQUIRED_SCOPE_FIELDS
  ) {
    if (
      !context[
        field
      ]
    ) {
      errors.push(
        `${field} is required`
      );
    }
  }


  if (
    context.provider &&
    normalizeProvider(
      context.provider
    ) !==
      context.provider
  ) {
    errors.push(
      "provider must be canonical lowercase form"
    );
  }


  /*
   * An Integration SDK invocation is not an authorization object.
   *
   * Actual execution authorization remains a separate deterministic
   * control-plane concern.
   */
  if (
    context
      .executionAuthorized ===
    true
  ) {
    errors.push(
      "integration invocation context cannot grant execution authorization"
    );
  }


  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


function createIntegrationResult({
  provider,

  operation,

  status =
    INTEGRATION_RESULT_STATUS
      .SUCCESS,

  data =
    null,

  warnings =
    [],

  provenance =
    {},

  observedAt =
    new Date()
      .toISOString(),
} = {}) {
  const normalizedProvider =
    normalizeProvider(
      provider
    );


  if (
    !normalizedProvider
  ) {
    throw new TypeError(
      "provider is required"
    );
  }


  if (
    !Object
      .values(
        INTEGRATION_OPERATION
      )
      .includes(
        operation
      )
  ) {
    throw new TypeError(
      `unknown integration operation: ${operation}`
    );
  }


  if (
    !Object
      .values(
        INTEGRATION_RESULT_STATUS
      )
      .includes(
        status
      )
  ) {
    throw new TypeError(
      `unknown integration result status: ${status}`
    );
  }


  return {
    schemaVersion:
      INTEGRATION_SDK_VERSION,

    provider:
      normalizedProvider,

    operation,

    status,

    data,

    warnings:
      Array.isArray(
        warnings
      )
        ? [
            ...warnings,
          ]
        : [],

    provenance:
      provenance &&
      typeof provenance ===
        "object"
        ? {
            ...provenance,
          }
        : {},

    observedAt,

    /*
     * Result objects are evidence about provider activity.
     *
     * They are never execution authorization.
     */
    executionAuthorized:
      false,
  };
}


function validateIntegrationResult(
  result
) {
  const errors =
    [];


  if (
    !result ||
    typeof result !==
      "object" ||
    Array.isArray(
      result
    )
  ) {
    return {
      valid:
        false,

      errors: [
        "result must be an object",
      ],
    };
  }


  if (
    result
      .schemaVersion !==
    INTEGRATION_SDK_VERSION
  ) {
    errors.push(
      "invalid schemaVersion"
    );
  }


  if (
    !normalizeProvider(
      result.provider
    )
  ) {
    errors.push(
      "provider is required"
    );
  }


  if (
    !Object
      .values(
        INTEGRATION_OPERATION
      )
      .includes(
        result.operation
      )
  ) {
    errors.push(
      "operation is invalid"
    );
  }


  if (
    !Object
      .values(
        INTEGRATION_RESULT_STATUS
      )
      .includes(
        result.status
      )
  ) {
    errors.push(
      "status is invalid"
    );
  }


  if (
    result
      .executionAuthorized !==
    false
  ) {
    errors.push(
      "executionAuthorized must be false"
    );
  }


  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


function capabilityForOperation(
  operation
) {
  return (
    INTEGRATION_OPERATION_CAPABILITY_MAP[
      operation
    ] ||
    null
  );
}


function isKnownIntegrationCapability(
  capability
) {
  return (
    INTEGRATION_CAPABILITIES
      .includes(
        capability
      )
  );
}


module.exports = {
  REQUIRED_SCOPE_FIELDS,

  normalizeProvider,

  validateIntegrationInvocationContext,

  createIntegrationResult,

  validateIntegrationResult,

  capabilityForOperation,

  isKnownIntegrationCapability,
};