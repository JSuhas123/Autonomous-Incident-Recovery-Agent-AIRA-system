"use strict";

const {
  INTEGRATION_OPERATION,
} =
  require(
    "../../constants/integrationPlatform"
  );

const {
  sanitizeErrorMessage,
} =
  require(
    "./integrationSecurity"
  );


const DEFAULT_MAX_ATTEMPTS =
  3;


const DEFAULT_CIRCUIT_FAILURE_THRESHOLD =
  3;


const DEFAULT_CIRCUIT_COOLDOWN_MS =
  60_000;


const RETRYABLE_OPERATIONS =
  new Set([
    INTEGRATION_OPERATION
      .QUERY_METRICS,

    INTEGRATION_OPERATION
      .QUERY_LOGS,

    INTEGRATION_OPERATION
      .QUERY_TRACES,

    INTEGRATION_OPERATION
      .DISCOVER_RESOURCES,

    INTEGRATION_OPERATION
      .DISCOVER_RELATIONSHIPS,

    INTEGRATION_OPERATION
      .GET_CHANGES,

    INTEGRATION_OPERATION
      .HEALTH_CHECK,
  ]);


/*
 * Explicitly non-retryable by default:
 *
 * receiveSignals:
 *   replay semantics belong to provider/webhook idempotency.
 *
 * sendNotification:
 *   retry may duplicate messages unless a provider-specific idempotency
 *   guarantee exists.
 *
 * executeCapability:
 *   NEVER automatically retry execution side effects here.
 */
const NEVER_RETRY_OPERATIONS =
  new Set([
    INTEGRATION_OPERATION
      .RECEIVE_SIGNALS,

    INTEGRATION_OPERATION
      .SEND_NOTIFICATION,

    INTEGRATION_OPERATION
      .EXECUTE_CAPABILITY,
  ]);


class IntegrationResilienceService {
  constructor(
    options = {}
  ) {
    this.connectionStore =
      options.connectionStore ||
      null;


    this.maxAttempts =
      positiveInteger(
        options.maxIntegrationAttempts,
        DEFAULT_MAX_ATTEMPTS
      );


    this.failureThreshold =
      positiveInteger(
        options.integrationCircuitFailureThreshold,
        DEFAULT_CIRCUIT_FAILURE_THRESHOLD
      );


    this.cooldownMs =
      positiveInteger(
        options.integrationCircuitCooldownMs,
        DEFAULT_CIRCUIT_COOLDOWN_MS
      );


    this.now =
      options.now ||
      (() =>
        new Date());


    this.sleep =
      options.sleep ||
      sleep;
  }


  assertCircuitAvailable({
    connection,

    operation,
  }) {
    /*
     * healthCheck is always allowed through as the recovery probe.
     */
    if (
      operation ===
      INTEGRATION_OPERATION
        .HEALTH_CHECK
    ) {
      return {
        state:
          "PROBE_ALLOWED",

        executionAuthorized:
          false,
      };
    }


    const failures =
      Number(
        connection
          ?.consecutiveFailures ||
        0
      );


    if (
      failures <
      this.failureThreshold
    ) {
      return {
        state:
          "CLOSED",

        executionAuthorized:
          false,
      };
    }


    const lastErrorAt =
      connection
        ?.lastErrorAt
        ? new Date(
            connection.lastErrorAt
          )
        : null;


    if (
      !lastErrorAt ||
      Number.isNaN(
        lastErrorAt.getTime()
      )
    ) {
      throw circuitOpenError();
    }


    const elapsed =
      this.now()
        .getTime() -
      lastErrorAt
        .getTime();


    if (
      elapsed <
      this.cooldownMs
    ) {
      throw circuitOpenError({
        retryAfterMs:
          this.cooldownMs -
          elapsed,
      });
    }


    return {
      state:
        "HALF_OPEN",

      executionAuthorized:
        false,
    };
  }


  async execute({
    operation,

    connection,

    invoke,
  }) {
    if (
      typeof invoke !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Integration resilience invoke function is required"
        ),
        {
          code:
            "INTEGRATION_RESILIENCE_INVOKE_REQUIRED",

          executionAuthorized:
            false,
        }
      );
    }


    this.assertCircuitAvailable({
      connection,
      operation,
    });


    const maxAttempts =
      isRetryableOperation(
        operation
      )
        ? this.maxAttempts
        : 1;


    let lastError =
      null;


    for (
      let attempt =
        1;
      attempt <=
        maxAttempts;
      attempt++
    ) {
      try {
        const value =
          await invoke({
            attempt,
          });


        return {
          value,

          attemptCount:
            attempt,

          executionAuthorized:
            false,
        };
      } catch (
        error
      ) {
        lastError =
          error;


        if (
          attempt >=
            maxAttempts ||
          !isRetryableError(
            error
          )
        ) {
          break;
        }


        await this.sleep(
          calculateRetryDelayMs(
            attempt
          )
        );
      }
    }


    if (
      lastError &&
      typeof lastError ===
        "object"
    ) {
      lastError
        .integrationAttemptCount =
        maxAttempts;
    }


    throw lastError;
  }


  async recordSuccess({
    organizationId,

    environmentId,

    connection,

    operation,

    durationMs,
  }) {
    if (
      !this.connectionStore ||
      !connection?.id
    ) {
      return null;
    }


    const now =
      this.now();


    const patch = {
      healthStatus:
        "healthy",

      status:
        connection.status ===
          "degraded"
          ? "connected"
          : connection.status,

      consecutiveFailures:
        0,

      lastLatencyMs:
        normalizeDuration(
          durationMs
        ),

      errorSummary:
        null,

      metadata: {
        ...(
          connection.metadata ||
          {}
        ),

        resilience: {
          circuitState:
            "CLOSED",

          lastSuccessfulOperation:
            operation,

          lastSuccessAt:
            now
              .toISOString(),
        },
      },
    };


    if (
      operation ===
      INTEGRATION_OPERATION
        .HEALTH_CHECK
    ) {
      patch.lastHealthCheckAt =
        now;
    }


    return this
      .connectionStore
      .updateConnection({
        organizationId,

        environmentId,

        connectionId:
          connection.id,

        patch,
      });
  }


  async recordFailure({
    organizationId,

    environmentId,

    connection,

    operation,

    durationMs,

    error,
  }) {
    if (
      !this.connectionStore ||
      !connection?.id
    ) {
      return null;
    }


    const previousFailures =
      Number(
        connection
          .consecutiveFailures ||
        0
      );


    const failures =
      previousFailures +
      1;


    const now =
      this.now();


    const circuitOpen =
      failures >=
      this.failureThreshold;


    const patch = {
      healthStatus:
        circuitOpen
          ? "unhealthy"
          : "degraded",

      status:
        connection.status ===
          "connected" ||
        connection.status ===
          "degraded"
          ? "degraded"
          : connection.status,

      consecutiveFailures:
        failures,

      lastErrorAt:
        now,

      lastLatencyMs:
        normalizeDuration(
          durationMs
        ),

      errorSummary:
        sanitizeErrorMessage(
          error?.message
        ),

      metadata: {
        ...(
          connection.metadata ||
          {}
        ),

        resilience: {
          circuitState:
            circuitOpen
              ? "OPEN"
              : "CLOSED",

          failureThreshold:
            this.failureThreshold,

          lastFailedOperation:
            operation,

          lastFailureAt:
            now
              .toISOString(),
        },
      },
    };


    if (
      operation ===
      INTEGRATION_OPERATION
        .HEALTH_CHECK
    ) {
      patch.lastHealthCheckAt =
        now;
    }


    return this
      .connectionStore
      .updateConnection({
        organizationId,

        environmentId,

        connectionId:
          connection.id,

        patch,
      });
  }
}


function isRetryableOperation(
  operation
) {
  if (
    NEVER_RETRY_OPERATIONS
      .has(
        operation
      )
  ) {
    return false;
  }


  return RETRYABLE_OPERATIONS
    .has(
      operation
    );
}


function isRetryableError(
  error
) {
  const code =
    String(
      error?.code ||
      ""
    )
      .trim()
      .toUpperCase();


  const status =
    Number(
      error?.status ||
      error?.statusCode ||
      0
    );


  if (
    status ===
      429 ||
    status ===
      502 ||
    status ===
      503 ||
    status ===
      504
  ) {
    return true;
  }


  return [
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "ENETUNREACH",
    "EHOSTUNREACH",

    "INTEGRATION_TIMEOUT",
    "INTEGRATION_PROVIDER_UNAVAILABLE",
    "INTEGRATION_CONNECTION_FAILED",
    "INTEGRATION_RATE_LIMITED",
  ].includes(
    code
  );
}


function calculateRetryDelayMs(
  attempt
) {
  /*
   * Bounded deterministic exponential backoff:
   *
   * attempt 1 → 100ms
   * attempt 2 → 200ms
   *
   * No random jitter here so unit/certification behavior remains deterministic.
   */
  return Math.min(
    100 *
    2 **
      Math.max(
        attempt -
          1,
        0
      ),

    1000
  );
}


function circuitOpenError(
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      "Integration provider circuit is open"
    ),
    {
      name:
        "IntegrationCircuitOpenError",

      code:
        "INTEGRATION_CIRCUIT_OPEN",

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  return Number.isInteger(
    parsed
  ) &&
  parsed >
    0
    ? parsed
    : fallback;
}


function normalizeDuration(
  value
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  ) &&
  parsed >=
    0
    ? Math.floor(
        parsed
      )
    : null;
}


function sleep(
  ms
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


module.exports = {
  IntegrationResilienceService,

  RETRYABLE_OPERATIONS,

  NEVER_RETRY_OPERATIONS,

  DEFAULT_MAX_ATTEMPTS,

  DEFAULT_CIRCUIT_FAILURE_THRESHOLD,

  DEFAULT_CIRCUIT_COOLDOWN_MS,

  isRetryableOperation,

  isRetryableError,

  calculateRetryDelayMs,
};