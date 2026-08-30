"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.9
 * INTEGRATION EVIDENCE QUERY GATEWAY
 * ============================================================================
 *
 * Metrics, logs and traces remain in their authoritative external provider.
 *
 * AIRA queries them on demand.
 *
 * This service:
 *
 * - validates evidence-query scope;
 * - bounds time windows;
 * - bounds result limits;
 * - routes through IntegrationRuntime;
 * - returns canonical evidence envelopes;
 * - preserves provider provenance;
 * - never persists a telemetry warehouse;
 * - never grants execution authorization.
 * ============================================================================
 */

const {
  IntegrationRuntime,
} =
  require(
    "./integrationRuntime"
  );


const EVIDENCE_TYPE =
  Object.freeze({
    METRIC:
      "METRIC",

    LOG:
      "LOG",

    TRACE:
      "TRACE",
  });


const DEFAULT_EVIDENCE_LIMIT =
  100;


const MAX_EVIDENCE_LIMIT =
  1000;


/*
 * A single evidence query should remain bounded.
 *
 * Larger historical analysis should use explicit pagination/windows instead
 * of accidentally pulling huge amounts of customer telemetry into AIRA.
 */
const MAX_EVIDENCE_WINDOW_MS =
  24 *
  60 *
  60 *
  1000;


class IntegrationEvidenceGateway {
  constructor(
    options = {}
  ) {
    this.runtime =
      options.runtime ||
      new IntegrationRuntime(
        options
      );


    this.defaultLimit =
      normalizePositiveInteger(
        options.defaultLimit,
        DEFAULT_EVIDENCE_LIMIT
      );


    this.maxLimit =
      normalizePositiveInteger(
        options.maxLimit,
        MAX_EVIDENCE_LIMIT
      );


    this.maxWindowMs =
      normalizePositiveInteger(
        options.maxWindowMs,
        MAX_EVIDENCE_WINDOW_MS
      );
  }


  async queryMetrics(
    context,
    query =
      {}
  ) {
    return this.queryEvidence({
      context,

      query,

      evidenceType:
        EVIDENCE_TYPE
          .METRIC,

      runtimeMethod:
        "queryMetrics",
    });
  }


  async queryLogs(
    context,
    query =
      {}
  ) {
    return this.queryEvidence({
      context,

      query,

      evidenceType:
        EVIDENCE_TYPE
          .LOG,

      runtimeMethod:
        "queryLogs",
    });
  }


  async queryTraces(
    context,
    query =
      {}
  ) {
    return this.queryEvidence({
      context,

      query,

      evidenceType:
        EVIDENCE_TYPE
          .TRACE,

      runtimeMethod:
        "queryTraces",
    });
  }


  async queryEvidence({
    context,

    query,

    evidenceType,

    runtimeMethod,
  }) {
    validateContext(
      context
    );


    const boundedQuery =
      this.prepareQuery(
        query
      );


    const startedAt =
      new Date();


    const providerResult =
      await this.runtime[
        runtimeMethod
      ](
        {
          ...context,

          executionAuthorized:
            false,
        },

        boundedQuery
      );


    if (
      providerResult
        ?.executionAuthorized ===
      true
    ) {
      throw evidenceError(
        "Integration runtime illegally returned execution authorization",
        "INTEGRATION_EVIDENCE_AUTHORITY_VIOLATION"
      );
    }


    const finishedAt =
      new Date();


    return {
      evidenceType,

      provider:
        context.provider,

      integrationId:
        context.integrationId,

      query:
        sanitizeQueryMetadata(
          boundedQuery
        ),

      evidence:
        providerResult
          ?.data ??
        null,

      providerStatus:
        providerResult
          ?.status ||
        null,

      observedAt:
        providerResult
          ?.observedAt ||
        finishedAt
          .toISOString(),

      provenance: {
        source:
          "EXTERNAL_PROVIDER",

        operation:
          runtimeMethod,

        invocationId:
          providerResult
            ?.provenance
            ?.invocationId ||
          null,

        provider:
          context.provider,

        integrationId:
          context.integrationId,

        queriedAt:
          startedAt
            .toISOString(),

        completedAt:
          finishedAt
            .toISOString(),

        providerProvenance:
          sanitizeProviderProvenance(
            providerResult
              ?.provenance
          ),

        persistedByGateway:
          false,

        executionAuthorized:
          false,
      },

      executionAuthorized:
        false,
    };
  }


  prepareQuery(
    query
  ) {
    if (
      query ===
        null ||
      query ===
        undefined
    ) {
      query = {};
    }


    if (
      typeof query !==
        "object" ||
      Array.isArray(
        query
      )
    ) {
      throw evidenceError(
        "Evidence query must be an object",
        "INTEGRATION_EVIDENCE_QUERY_INVALID"
      );
    }


    validateTimeWindow(
      query.from,
      query.to,
      this.maxWindowMs
    );


    const requestedLimit =
      query.limit ===
        undefined ||
      query.limit ===
        null
        ? this.defaultLimit
        : Number(
            query.limit
          );


    if (
      !Number.isInteger(
        requestedLimit
      ) ||
      requestedLimit <=
        0
    ) {
      throw evidenceError(
        "Evidence query limit must be a positive integer",
        "INTEGRATION_EVIDENCE_LIMIT_INVALID"
      );
    }


    const boundedLimit =
      Math.min(
        requestedLimit,
        this.maxLimit
      );


    return {
      ...query,

      limit:
        boundedLimit,
    };
  }
}


function validateContext(
  context
) {
  if (
    !context ||
    typeof context !==
      "object" ||
    Array.isArray(
      context
    )
  ) {
    throw evidenceError(
      "Integration evidence context is required",
      "INTEGRATION_EVIDENCE_CONTEXT_INVALID"
    );
  }


  const required = [
    "organizationId",

    "environmentId",

    "integrationId",

    "provider",
  ];


  for (
    const field
    of required
  ) {
    if (
      !context[
        field
      ]
    ) {
      throw evidenceError(
        `${field} is required for integration evidence query`,
        "INTEGRATION_EVIDENCE_CONTEXT_INVALID",
        {
          field,
        }
      );
    }
  }


  if (
    context
      .executionAuthorized ===
    true
  ) {
    throw evidenceError(
      "Evidence query context cannot grant execution authorization",
      "INTEGRATION_EVIDENCE_AUTHORITY_VIOLATION"
    );
  }
}


function validateTimeWindow(
  from,
  to,
  maxWindowMs
) {
  if (
    from ===
      undefined &&
    to ===
      undefined
  ) {
    return;
  }


  if (
    from ===
      undefined ||
    to ===
      undefined
  ) {
    /*
     * Some providers support expressions such as "now-15m".
     *
     * A one-sided provider-native window cannot be reliably measured here,
     * so it is allowed and provider-specific validation remains downstream.
     */
    return;
  }


  const parsedFrom =
    parseEvidenceTimestamp(
      from
    );


  const parsedTo =
    parseEvidenceTimestamp(
      to
    );


  /*
   * Provider-native relative expressions such as "now-15m" cannot be
   * evaluated deterministically by the generic SDK.
   *
   * They remain the provider adapter's responsibility.
   */
  if (
    parsedFrom ===
      null ||
    parsedTo ===
      null
  ) {
    return;
  }


  if (
    parsedFrom >
    parsedTo
  ) {
    throw evidenceError(
      "Evidence query 'from' must not be later than 'to'",
      "INTEGRATION_EVIDENCE_WINDOW_INVALID"
    );
  }


  const windowMs =
    parsedTo -
    parsedFrom;


  if (
    windowMs >
    maxWindowMs
  ) {
    throw evidenceError(
      `Evidence query window exceeds maximum of ${maxWindowMs}ms`,
      "INTEGRATION_EVIDENCE_WINDOW_TOO_LARGE",
      {
        windowMs,

        maxWindowMs,
      }
    );
  }
}


function parseEvidenceTimestamp(
  value
) {
  if (
    value instanceof
    Date
  ) {
    const timestamp =
      value.getTime();


    return Number.isFinite(
      timestamp
    )
      ? timestamp
      : null;
  }


  if (
    typeof value ===
    "number"
  ) {
    if (
      !Number.isFinite(
        value
      )
    ) {
      return null;
    }


    /*
     * Seconds-since-epoch values are common in metrics APIs.
     */
    return value <
      10_000_000_000
      ? value *
        1000
      : value;
  }


  if (
    typeof value ===
    "string"
  ) {
    const trimmed =
      value.trim();


    if (
      !trimmed
    ) {
      return null;
    }


    if (
      /^\d+(?:\.\d+)?$/
        .test(
          trimmed
        )
    ) {
      return parseEvidenceTimestamp(
        Number(
          trimmed
        )
      );
    }


    const timestamp =
      Date.parse(
        trimmed
      );


    return Number.isNaN(
      timestamp
    )
      ? null
      : timestamp;
  }


  return null;
}


function sanitizeQueryMetadata(
  query
) {
  const safe =
    {};


  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      query
    )
  ) {
    if (
      isSensitiveQueryField(
        key
      )
    ) {
      safe[
        key
      ] =
        "[REDACTED]";

      continue;
    }


    safe[
      key
    ] =
      cloneSafeValue(
        value
      );
  }


  return safe;
}


function sanitizeProviderProvenance(
  provenance
) {
  if (
    !provenance ||
    typeof provenance !==
      "object" ||
    Array.isArray(
      provenance
    )
  ) {
    return {};
  }


  return {
    invocationId:
      provenance
        .invocationId ||
      null,

    integrationPublicId:
      provenance
        .integrationPublicId ||
      null,

    integrationCanonicalId:
      provenance
        .integrationCanonicalId ||
      null,

    provider:
      provenance
        .provider ||
      null,

    providerAvailability:
      provenance
        .providerAvailability ||
      null,

    providerCertification:
      provenance
        .providerCertification ||
      null,

    startedAt:
      provenance
        .startedAt ||
      null,

    finishedAt:
      provenance
        .finishedAt ||
      null,

    durationMs:
      provenance
        .durationMs ??
      null,

    executionAuthorized:
      false,
  };
}


function cloneSafeValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return value;
  }


  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      cloneSafeValue
    );
  }


  if (
    typeof value ===
      "object"
  ) {
    const safe =
      {};


    for (
      const [
        key,
        nested
      ]
      of Object.entries(
        value
      )
    ) {
      safe[
        key
      ] =
        isSensitiveQueryField(
          key
        )
          ? "[REDACTED]"
          : cloneSafeValue(
              nested
            );
    }


    return safe;
  }


  return value;
}


function isSensitiveQueryField(
  key
) {
  const normalized =
    String(
      key ||
      ""
    )
      .replace(
        /[-_\s]/g,
        ""
      )
      .toLowerCase();


  return SENSITIVE_QUERY_FIELDS
    .has(
      normalized
    );
}


const SENSITIVE_QUERY_FIELDS =
  new Set([
    "password",

    "passwd",

    "pwd",

    "secret",

    "clientsecret",

    "apikey",

    "token",

    "accesstoken",

    "refreshtoken",

    "authorization",

    "authheader",

    "credential",

    "credentials",
  ]);


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


function evidenceError(
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
        "IntegrationEvidenceGatewayError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationEvidenceGateway,

  EVIDENCE_TYPE,

  DEFAULT_EVIDENCE_LIMIT,

  MAX_EVIDENCE_LIMIT,

  MAX_EVIDENCE_WINDOW_MS,

  validateTimeWindow,

  parseEvidenceTimestamp,

  sanitizeQueryMetadata,
};