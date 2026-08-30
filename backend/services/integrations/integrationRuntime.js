"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.7
 * INTEGRATION RUNTIME
 * ============================================================================
 *
 * One execution boundary for all provider operations.
 *
 * Runtime responsibilities:
 *
 *  1. validate tenant/environment/provider/integration context;
 *  2. load the canonical PostgreSQL integration connection;
 *  3. ensure provider identity matches the stored connection;
 *  4. require capability on BOTH connection and provider adapter;
 *  5. resolve credentials internally;
 *  6. invoke the provider adapter;
 *  7. wrap raw provider responses in the canonical IntegrationResult;
 *  8. ensure execution authorization never leaks into result contracts;
 *  9. redact internal credential material from the returned result.
 *
 * executeCapability() additionally requires a separate deterministic
 * authorization proof. The integration context itself can never grant
 * execution authority.
 * ============================================================================
 */

const crypto =
  require(
    "node:crypto"
  );

const IntegrationConnectionStore =
  require(
    "./integrationConnectionStore"
  );

  const {
  IntegrationRuntimeGovernance,
} =
  require(
    "./integrationRuntimeGovernance"
  );

const {
  IntegrationResilienceService,
} =
  require(
    "./integrationResilienceService"
  );

const {
  IntegrationInvocationAuditService,
} =
  require(
    "./integrationInvocationAuditService"
  );

const {
  sanitizeIntegrationValue,
} =
  require(
    "./integrationSecurity"
  );
const {
  ProviderRegistry,
} =
  require(
    "./providerRegistry"
  );

  const {
  IntegrationExecutionAuthorizationBoundary,
} =
  require(
    "./integrationExecutionAuthorizationBoundary"
  );

const {
  UnsupportedOperationError,
} =
  require(
    "./adapterInterface"
  );

const {
  INTEGRATION_OPERATION,
  INTEGRATION_RESULT_STATUS,
  INTEGRATION_ERROR_CODE,
} =
  require(
    "../../constants/integrationPlatform"
  );

const {
  validateIntegrationInvocationContext,
  createIntegrationResult,
  validateIntegrationResult,
  capabilityForOperation,
  normalizeProvider,
} =
  require(
    "../../contracts/integrations"
  );


const DEFAULT_OPERATION_TIMEOUT_MS =
  15_000;


const LEGACY_OPERATION_FALLBACK =
  Object.freeze({
    receiveSignals:
      "receiveEvent",

    healthCheck:
      "getHealth",
  });


class IntegrationRuntime {
  constructor(
    options = {}
  ) {
    this.connectionStore =
      options.connectionStore ||
      new IntegrationConnectionStore(
        options
      );


    this.providerRegistry =
      options.providerRegistry ||
      new ProviderRegistry(
        options
      );

    this.executionAuthorizationBoundary =
  options
    .executionAuthorizationBoundary ||
  new IntegrationExecutionAuthorizationBoundary(
    options
  );

  this.runtimeGovernance =
  options.runtimeGovernance ||
  new IntegrationRuntimeGovernance(
    options
  );


this.resilienceService =
  options.resilienceService ||
  new IntegrationResilienceService({
    ...options,

    connectionStore:
      this.connectionStore,
  });


this.invocationAuditService =
  options.invocationAuditService ||
  new IntegrationInvocationAuditService(
    options
  );

    this.defaultTimeoutMs =
      normalizePositiveInteger(
        options.defaultTimeoutMs,
        DEFAULT_OPERATION_TIMEOUT_MS
      );


    this.now =
      options.now ||
      (() =>
        new Date());


    this.randomUUID =
      options.randomUUID ||
      (() =>
        crypto.randomUUID());
  }


 async invoke({
  organizationId,

  environmentId,

  integrationId,

  provider,

  operation,

  input =
    {},

  headers =
    {},

  authorizationReference =
    null,

  timeoutMs =
    null,
} = {}) {
    const normalizedProvider =
      normalizeProvider(
        provider
      );


    const context = {
      organizationId,

      environmentId,

      integrationId,

      provider:
        normalizedProvider,

      executionAuthorized:
        false,
    };


    const contextValidation =
      validateIntegrationInvocationContext(
        context
      );


    if (
      !contextValidation.valid
    ) {
      throw runtimeError(
        contextValidation
          .errors
          .join(
            "; "
          ),
        "INTEGRATION_RUNTIME_CONTEXT_INVALID",
        {
          contextErrors:
            contextValidation
              .errors,
        }
      );
    }


    const capability =
      capabilityForOperation(
        operation
      );


    if (
      !capability
    ) {
      throw runtimeError(
        `Unknown integration operation "${operation}"`,
        "INTEGRATION_RUNTIME_OPERATION_UNKNOWN",
        {
          operation,
        }
      );
    }


    const connection =
      await this
        .loadConnection({
          organizationId,

          environmentId,

          integrationId,
        });


    if (
      !connection
    ) {
      throw runtimeError(
        `Integration connection "${integrationId}" was not found`,
        "INTEGRATION_CONNECTION_NOT_FOUND",
        {
          integrationId,
        }
      );
    }


    if (
      normalizeProvider(
        connection.provider
      ) !==
      normalizedProvider
    ) {
      throw runtimeError(
        `Integration provider mismatch: requested "${normalizedProvider}", connection belongs to "${connection.provider}"`,
        "INTEGRATION_PROVIDER_CONNECTION_MISMATCH",
        {
          requestedProvider:
            normalizedProvider,

          connectionProvider:
            connection.provider,
        }
      );
    }


    this.assertConnectionUsable(
      connection
    );


    this.assertConnectionCapability(
      connection,
      capability
    );


    const {
      adapter,
      provider:
        providerRecord,
    } =
      this.providerRegistry
        .requireRuntimeCapability(
          normalizedProvider,
          capability
        );

        await this
  .runtimeGovernance
  .assertAllowed({
    organizationId,

    environmentId,

    integrationId:
      connection.publicId ||
      integrationId,

    provider:
      normalizedProvider,

    operation,

    capability,
  });


   let authorizationProof =
  null;


if (
  operation ===
  INTEGRATION_OPERATION
    .EXECUTE_CAPABILITY
) {
  authorizationProof =
    await this
      .executionAuthorizationBoundary
      .verify({
        organizationId,

        environmentId,

        incidentId:
          authorizationReference
            ?.incidentId,

        authorizationId:
          authorizationReference
            ?.authorizationId,

        executionRequestId:
          authorizationReference
            ?.executionRequestId,

        planId:
          authorizationReference
            ?.planId,

        planHash:
          authorizationReference
            ?.planHash,

        capability:
          input
            ?.capability ||
          null,
      });
      await this
  .runtimeGovernance
  .assertCredentialAccess({
    organizationId,

    environmentId,

    integrationId:
      connection.publicId ||
      integrationId,
  });
}


    const credential =
      await this
        .resolveCredential({
          organizationId,

          environmentId,

          connectionId:
            connection.id,
        });


    const runtimeConnection =
      buildRuntimeConnection({
        connection,

        decryptedSecret:
          credential,
      });


    const invocationId =
      "int_inv_" +
      this.randomUUID();


    const startedAt =
      this.now();


   const effectiveTimeoutMs =
  normalizePositiveInteger(
    timeoutMs,
    this.defaultTimeoutMs
  );


let attemptCount =
  1;


try {
  const resilient =
    await this
      .resilienceService
      .execute({
        operation,

        connection,

        invoke:
          async ({
            attempt,
          }) => {
            attemptCount =
              attempt;


            return withTimeout(
              () =>
                this.invokeAdapterOperation({
                  adapter,

                  operation,

                  runtimeConnection,

                  input,

                  headers,

                  authorizationProof,

                  invocationId,

                  context,
                }),

              effectiveTimeoutMs,

              {
                provider:
                  normalizedProvider,

                operation,

                invocationId,

                attempt,
              }
            );
          },
      });


  attemptCount =
    resilient
      .attemptCount;


  const rawResult =
    resilient.value;


  const finishedAt =
    this.now();


  const durationMs =
    Math.max(
      0,
      finishedAt.getTime() -
      startedAt.getTime()
    );


  const result =
    this.normalizeResult({
      provider:
        normalizedProvider,

      operation,

      rawResult,

      invocationId,

      providerRecord,

      connection,

      startedAt,

      finishedAt,
    });


  await this
    .resilienceService
    .recordSuccess({
      organizationId,

      environmentId,

      connection,

      operation,

      durationMs,
    })
    .catch(
      () => null
    );


  await this
    .invocationAuditService
    .record({
      organizationId,

      environmentId,

      invocationId,

      connectionId:
        connection.id,

      integrationPublicId:
        connection.publicId,

      provider:
        normalizedProvider,

      operation,

      capability,

      outcome:
        result.status ===
          INTEGRATION_RESULT_STATUS
            .PARTIAL
          ? "PARTIAL"
          : "SUCCESS",

      attemptCount,

      durationMs,

      authorizationId:
        authorizationProof
          ?.authorizationId ||
        null,

      executionRequestId:
        authorizationProof
          ?.executionRequestId ||
        null,

      metadata: {
        providerAvailability:
          providerRecord
            ?.availabilityStatus ||
          null,

        providerCertification:
          providerRecord
            ?.certificationStatus ||
          null,

        resultStatus:
          result.status,

        executionAuthorized:
          false,
      },
    });


  return {
    ...result,

    executionAuthorized:
      false,
  };
} catch (
  error
) {
  const finishedAt =
    this.now();


  const durationMs =
    Math.max(
      0,
      finishedAt.getTime() -
      startedAt.getTime()
    );


  const normalizedError =
    normalizeRuntimeError({
      error,

      provider:
        normalizedProvider,

      operation,

      invocationId,
    });


  await this
    .resilienceService
    .recordFailure({
      organizationId,

      environmentId,

      connection,

      operation,

      durationMs,

      error:
        normalizedError,
    })
    .catch(
      () => null
    );


  const auditOutcome =
    normalizedError
      ?.code ===
      "INTEGRATION_CIRCUIT_OPEN"
      ? "CIRCUIT_OPEN"
      : normalizedError
          ?.code ===
          INTEGRATION_ERROR_CODE
            .TIMEOUT
        ? "TIMEOUT"
        : "FAILED";


  await this
    .invocationAuditService
    .record({
      organizationId,

      environmentId,

      invocationId,

      connectionId:
        connection.id,

      integrationPublicId:
        connection.publicId,

      provider:
        normalizedProvider,

      operation,

      capability,

      outcome:
        auditOutcome,

      attemptCount:
        Number(
          error
            ?.integrationAttemptCount ||
          attemptCount ||
          1
        ),

      durationMs,

      errorCode:
        normalizedError
          ?.code ||
        "INTEGRATION_RUNTIME_FAILED",

      authorizationId:
        authorizationProof
          ?.authorizationId ||
        null,

      executionRequestId:
        authorizationProof
          ?.executionRequestId ||
        null,

      metadata: {
        error:
          sanitizeIntegrationValue({
            code:
              normalizedError
                ?.code ||
              null,

            message:
              normalizedError
                ?.message ||
              "Integration operation failed",
          }),

        executionAuthorized:
          false,
      },
    });


  throw normalizedError;
}
  }


  async receiveSignals(
    context,
    input,
    headers =
      {}
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .RECEIVE_SIGNALS,

      input,

      headers,
    });
  }


  async queryMetrics(
    context,
    query
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .QUERY_METRICS,

      input:
        query,
    });
  }


  async queryLogs(
    context,
    query
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .QUERY_LOGS,

      input:
        query,
    });
  }


  async queryTraces(
    context,
    query
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .QUERY_TRACES,

      input:
        query,
    });
  }


  async discoverResources(
    context,
    input =
      {}
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .DISCOVER_RESOURCES,

      input,
    });
  }


  async discoverRelationships(
    context,
    input =
      {}
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .DISCOVER_RELATIONSHIPS,

      input,
    });
  }


  async getChanges(
    context,
    input =
      {}
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .GET_CHANGES,

      input,
    });
  }


 async executeCapability(
  context,
  executionRequest,
  authorizationReference
) {
  return this.invoke({
    ...context,

    operation:
      INTEGRATION_OPERATION
        .EXECUTE_CAPABILITY,

    input:
      executionRequest,

    authorizationReference,
  });
}


  async sendNotification(
    context,
    notification
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .SEND_NOTIFICATION,

      input:
        notification,
    });
  }


  async healthCheck(
    context
  ) {
    return this.invoke({
      ...context,

      operation:
        INTEGRATION_OPERATION
          .HEALTH_CHECK,

      input:
        {},
    });
  }


  async loadConnection({
    organizationId,

    environmentId,

    integrationId,
  }) {
    /*
     * Phase 20 APIs should normally use the stable public integration ID.
     */
    let connection =
      await this
        .connectionStore
        .getConnection({
          organizationId,

          environmentId,

          publicId:
            integrationId,
        });


    /*
     * Internal callers may still hold the canonical PostgreSQL UUID during
     * migration. Preserve that path without confusing public and canonical IDs.
     */
    if (
      !connection
    ) {
      connection =
        await this
          .connectionStore
          .getConnection({
            organizationId,

            environmentId,

            connectionId:
              integrationId,
          });
    }


    return connection;
  }


  async resolveCredential({
    organizationId,

    environmentId,

    connectionId,
  }) {
    try {
      return await this
        .connectionStore
        .resolveCredential({
          organizationId,

          environmentId,

          connectionId,
        });
    } catch (
      error
    ) {
      throw runtimeError(
        "Integration credential resolution failed",
        "INTEGRATION_CREDENTIAL_RESOLUTION_FAILED",
        {
          causeCode:
            error?.code ||
            null,
        }
      );
    }
  }


  assertConnectionUsable(
    connection
  ) {
    if (
      connection.status ===
      "disabled"
    ) {
      throw runtimeError(
        "Integration connection is disabled",
        "INTEGRATION_CONNECTION_DISABLED",
        {
          connectionId:
            connection.publicId,
        }
      );
    }


    if (
      connection.status ===
      "disconnected"
    ) {
      throw runtimeError(
        "Integration connection is disconnected",
        "INTEGRATION_CONNECTION_DISCONNECTED",
        {
          connectionId:
            connection.publicId,
        }
      );
    }


    if (
      connection.executionAuthorized ===
      true
    ) {
      throw runtimeError(
        "Integration connection illegally contains execution authority",
        "INTEGRATION_CONNECTION_AUTHORITY_VIOLATION",
        {
          connectionId:
            connection.publicId,
        }
      );
    }
  }


  assertConnectionCapability(
    connection,
    capability
  ) {
    const capabilities =
      Array.isArray(
        connection.capabilities
      )
        ? connection.capabilities
        : [];


    if (
      !capabilities.includes(
        capability
      )
    ) {
      throw runtimeError(
        `Integration connection does not enable capability "${capability}"`,
        "INTEGRATION_CONNECTION_CAPABILITY_DISABLED",
        {
          capability,

          connectionId:
            connection.publicId,
        }
      );
    }
  }


  async invokeAdapterOperation({
    adapter,

    operation,

    runtimeConnection,

    input,

    headers,

    authorizationProof,

    invocationId,

    context,
  }) {
    const canonicalMethod =
      adapter[
        operation
      ];


    if (
      typeof canonicalMethod !==
      "function"
    ) {
      throw new UnsupportedOperationError(
        adapter.provider,
        operation
      );
    }


    try {
      return await this
        .callAdapterMethod({
          adapter,

          method:
            operation,

          runtimeConnection,

          input,

          headers,

          authorizationProof,

          invocationId,

          context,
        });
    } catch (
      error
    ) {
      /*
       * Existing adapters from the earlier integration implementation expose
       * receiveEvent() and getHealth().
       *
       * The Phase 20 SDK names are receiveSignals() and healthCheck().
       *
       * makeStubAdapter provides canonical unsupported stubs, so attempt the
       * legacy implementation only when the canonical method explicitly says
       * it is unsupported.
       */
      const fallback =
        LEGACY_OPERATION_FALLBACK[
          operation
        ];


      if (
        fallback &&
        isUnsupportedError(
          error
        ) &&
        typeof adapter[
          fallback
        ] ===
          "function"
      ) {
        return this
          .callAdapterMethod({
            adapter,

            method:
              fallback,

            runtimeConnection,

            input,

            headers,

            authorizationProof,

            invocationId,

            context,
          });
      }


      throw error;
    }
  }


  async callAdapterMethod({
    adapter,

    method,

    runtimeConnection,

    input,

    headers,

    authorizationProof,

    invocationId,

    context,
  }) {
    switch (
      method
    ) {
      case "receiveSignals":
      case "receiveEvent":
        return adapter[
          method
        ](
          runtimeConnection,
          input,
          headers,
          buildAdapterMetadata({
            invocationId,

            context,
          })
        );


      case "healthCheck":
      case "getHealth":
        return adapter[
          method
        ](
          runtimeConnection,
          buildAdapterMetadata({
            invocationId,

            context,
          })
        );


      case "executeCapability":
        return adapter
          .executeCapability(
            runtimeConnection,

            input,

            {
              authorizationProof,

              ...buildAdapterMetadata({
                invocationId,

                context,
              }),
            }
          );


      default:
        return adapter[
          method
        ](
          runtimeConnection,
          input,
          buildAdapterMetadata({
            invocationId,

            context,
          })
        );
    }
  }


  normalizeResult({
    provider,

    operation,

    rawResult,

    invocationId,

    providerRecord,

    connection,

    startedAt,

    finishedAt,
  }) {
    /*
     * Providers may later return the canonical IntegrationResult directly.
     */
    if (
      rawResult &&
      typeof rawResult ===
        "object" &&
      rawResult.schemaVersion
    ) {
      const validation =
        validateIntegrationResult(
          rawResult
        );


      if (
        !validation.valid
      ) {
        throw runtimeError(
          `Provider returned invalid integration result: ${validation.errors.join(
            "; "
          )}`,
          INTEGRATION_ERROR_CODE
            .INVALID_RESULT,
          {
            resultErrors:
              validation.errors,
          }
        );
      }


      /*
       * Never trust an adapter to inject authorization.
       */
      return {
        ...sanitizeIntegrationValue(
          rawResult
        ),

        executionAuthorized:
          false,
      };
    }


    return createIntegrationResult({
      provider,

      operation,

      status:
        INTEGRATION_RESULT_STATUS
          .SUCCESS,

      data:
        sanitizeResult(
          rawResult
        ),

      provenance: {
        invocationId,

        integrationPublicId:
          connection.publicId,

        integrationCanonicalId:
          connection.id,

        provider,

        providerAvailability:
          providerRecord
            .availabilityStatus,

        providerCertification:
          providerRecord
            .certificationStatus,

        runtime:
          "AIRA_PHASE_20_INTEGRATION_RUNTIME",

        startedAt:
          toISOString(
            startedAt
          ),

        finishedAt:
          toISOString(
            finishedAt
          ),

        durationMs:
          Math.max(
            0,
            finishedAt.getTime() -
            startedAt.getTime()
          ),
      },

      observedAt:
        toISOString(
          finishedAt
        ),
    });
  }
}


function buildRuntimeConnection({
  connection,

  decryptedSecret,
}) {
  /*
   * Preserve the existing adapter compatibility field only inside runtime.
   *
   * It is never persisted and never returned from IntegrationRuntime.
   */
  return {
    ...connection,

    _decryptedSecret:
      decryptedSecret,

    executionAuthorized:
      false,
  };
}


function buildAdapterMetadata({
  invocationId,

  context,
}) {
  return {
    invocationId,

    organizationId:
      context.organizationId,

    environmentId:
      context.environmentId,

    integrationId:
      context.integrationId,

    provider:
      context.provider,

    executionAuthorized:
      false,
  };
}

function isSecretField(
  key
) {
  if (
    typeof key !==
    "string"
  ) {
    return false;
  }


  const normalized =
    key
      .trim()
      .replace(
        /[-_\s]/g,
        ""
      )
      .toLowerCase();


  /*
   * Deliberately match actual credential-bearing fields rather than any
   * property that merely contains words such as "secret", "credential" or
   * "authorization".
   *
   * Safe examples which MUST remain visible:
   *
   *   secretWasAvailable
   *   credentialAvailable
   *   authorizationDecisionId
   *   authorizationStatus
   *
   * Sensitive examples which MUST be redacted:
   *
   *   password
   *   secret
   *   apiKey
   *   accessToken
   *   refreshToken
   *   clientSecret
   *   authorization
   *   authHeader
   *   credentials
   */
  return SECRET_FIELD_NAMES
    .has(
      normalized
    );
}


const SECRET_FIELD_NAMES =
  new Set([
    "password",

    "passwd",

    "pwd",

    "secret",

    "clientsecret",

    "apisecret",

    "webhooksecret",

    "signingsecret",

    "token",

    "accesstoken",

    "refreshtoken",

    "idtoken",

    "bearertoken",

    "apikey",

    "privatekey",

    "privatekeypem",

    "credential",

    "credentials",

    "credentialvalue",

    "referencevalue",

    "authorization",

    "authorizationheader",

    "authheader",

    "proxyauthorization",
  ]);


function withTimeout(
  factory,
  timeoutMs,
  metadata
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let settled =
        false;


      const timer =
        setTimeout(
          () => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            reject(
              runtimeError(
                `Integration operation timed out after ${timeoutMs}ms`,
                INTEGRATION_ERROR_CODE
                  .TIMEOUT,
                metadata
              )
            );
          },

          timeoutMs
        );


      Promise.resolve()
        .then(
          factory
        )
        .then(
          (
            result
          ) => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;

            clearTimeout(
              timer
            );

            resolve(
              result
            );
          }
        )
        .catch(
          (
            error
          ) => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;

            clearTimeout(
              timer
            );

            reject(
              error
            );
          }
        );
    }
  );
}


function normalizeRuntimeError({
  error,

  provider,

  operation,

  invocationId,
}) {
  if (
    error?.executionAuthorized ===
    false
  ) {
    error.provider =
      error.provider ||
      provider;

    error.operation =
      error.operation ||
      operation;

    error.invocationId =
      error.invocationId ||
      invocationId;

    return error;
  }


  return runtimeError(
    error?.message ||
      "Integration provider operation failed",

    error?.code ||
      INTEGRATION_ERROR_CODE
        .PROVIDER_UNAVAILABLE,

    {
      provider,

      operation,

      invocationId,

      causeCode:
        error?.code ||
        null,
    }
  );
}


function runtimeError(
  message,
  code,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationRuntimeError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


function isUnsupportedError(
  error
) {
  return Boolean(
    error instanceof
      UnsupportedOperationError ||
    error?.code ===
      "UNSUPPORTED_OPERATION"
  );
}


function normalizePositiveInteger(
  value,
  fallback
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }


  return parsed;
}


function toISOString(
  value
) {
  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  return new Date(
    value
  )
    .toISOString();
}
function sanitizeResult(
  value
) {
  return sanitizeIntegrationValue(
    value
  );
}


module.exports = {
  IntegrationRuntime,

  DEFAULT_OPERATION_TIMEOUT_MS,

  withTimeout,

  normalizeRuntimeError,

  sanitizeResult,
};