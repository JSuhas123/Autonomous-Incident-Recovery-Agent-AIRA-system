"use strict";

const express = require("express");
const Joi = require("joi");
const { isDatabaseIdentifier } = require("../utils/identifier");

const {
  CATALOGUE,
  AVAILABLE_PROVIDERS,
  findDefinition,
} = require("../config/integrationCatalogue");

const {
  IntegrationConnection,
  Service,
} = require("../persistence/operational/operationalModels");

const {
  encryptSecret,
  decryptSecret,
  getSecretStorage,
  SECRET_VERSION,
} = require(
  "../services/integrations/secretStorage");
const {
  getAdapter,
} = require("../services/integrations/adapterRegistry");

const {
  record: auditRecord,
} = require("../services/identity/identityAuditService");

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const {
  browserEnvironmentContext,
} = require("../middleware/contextMiddleware");

const kubernetesDiscoveryService =
  require("../services/discovery/kubernetesDiscoveryService");

const kubernetesInventoryService =
  require("../services/discovery/kubernetesInventoryService");

const kubernetesRelationshipService =
  require("../services/discovery/kubernetesRelationshipService");

// Keep legacy webhook ingestion service for backwards compatibility.
const webhookIngestionService =
  require("../services/integrations/webhookIngestionService");

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Serialisers
// ─────────────────────────────────────────────────────────────────────────────

function safeConnection(
  doc
) {
  /*
   * encryptedSecretReference normally has select:false.
   *
   * Therefore secretVersion/secretUpdatedAt are the safe
   * indicators that credentials exist.
   */
  const hasSecret =
    Boolean(
      doc.secretUpdatedAt ||
      doc.secretVersion ||
      doc.encryptedSecretReference
    );

  return {
    id:
      doc._id
        ?.toString?.() ??
      doc._id,

    organizationId:
      doc.organizationId
        ?.toString?.() ??
      doc.organizationId,

    environmentId:
      doc.environmentId
        ?.toString?.() ??
      null,

    tenantId:
      doc.tenantId,

    provider:
      doc.provider,

    name:
      doc.name,

    externalAccountId:
      doc.externalAccountId ??
      null,

    serviceIds:
      (
        doc.serviceIds ??
        []
      ).map(
        (id) =>
          id?.toString?.() ??
          id
      ),

    status:
      doc.status,

    capabilities:
      doc.capabilities,

    nonSecretConfig:
      doc.nonSecretConfig,

    hasSecret,

    secretVersion:
      doc.secretVersion ??
      null,

    secretUpdatedAt:
      doc.secretUpdatedAt ??
      null,

    healthStatus:
      doc.healthStatus,

    lastHealthCheckAt:
      doc.lastHealthCheckAt,

    lastLatencyMs:
      doc.lastLatencyMs,

    lastEventAt:
      doc.lastEventAt,

    lastSuccessfulEventAt:
      doc.lastSuccessfulEventAt,

    lastErrorAt:
      doc.lastErrorAt,

    consecutiveFailures:
      doc.consecutiveFailures ??
      0,

    errorSummary:
      doc.errorSummary,

    connectedAt:
      doc.connectedAt,

    disconnectedAt:
      doc.disconnectedAt,

    disabledAt:
      doc.disabledAt,

    disabledReason:
      doc.disabledReason,

    createdBy:
      doc.createdBy
        ?.toString?.() ??
      doc.createdBy,

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection isolation helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadConnection(
  req,
  res,
  {
    includeSecret = false,
  } = {}
) {
  const {
    integrationId,
  } =
    req.params;

  if (
    !mongoose.Types.ObjectId
      .isValid(
        integrationId
      )
  ) {
    res
      .status(404)
      .json({
        error:
          "Integration not found",

        code:
          "INTEGRATION_NOT_FOUND",
      });

    return null;
  }

  const organizationId =
    req.context
      ?.organizationId ||
    req.auth
      ?.organizationId;

  const environmentId =
    req.context
      ?.environmentId;

  if (
    !organizationId ||
    !environmentId
  ) {
    res
      .status(400)
      .json({
        error:
          "Environment context is required",

        code:
          "ENVIRONMENT_REQUIRED",
      });

    return null;
  }

  let query =
    IntegrationConnection
      .findOne({
        _id:
          integrationId,

        organizationId,

        environmentId,
      });

  /*
   * Credential access is opt-in.
   *
   * Ordinary GET/PATCH requests cannot accidentally read ciphertext.
   */
  if (
    includeSecret
  ) {
    query =
      query.select(
        "+encryptedSecretReference"
      );
  }

  const connection =
    await query;

  if (!connection) {
    res
      .status(404)
      .json({
        error:
          "Integration not found",

        code:
          "INTEGRATION_NOT_FOUND",
      });

    return null;
  }

  return connection;
}

async function validateScopedServiceIds(
  req,
  res,
  rawServiceIds = []
) {
  if (
    !Array.isArray(rawServiceIds) ||
    rawServiceIds.length === 0
  ) {
    return [];
  }

  const uniqueIds = [
    ...new Set(
      rawServiceIds.map(String)
    ),
  ];

  const invalidId =
    uniqueIds.find(
      (id) =>
        !isDatabaseIdentifier(
          id
        )
    );

  if (invalidId) {
    res.status(422).json({
      error:
        "One or more service IDs are invalid",
      code:
        "INVALID_SERVICE_ID",
    });

    return null;
  }

  const organizationId =
    req.context?.organizationId ||
    req.auth?.organizationId;

  const environmentId =
    req.context?.environmentId;

  if (
    !organizationId ||
    !environmentId
  ) {
    res.status(400).json({
      error:
        "Environment context is required",
      code:
        "ENVIRONMENT_REQUIRED",
    });

    return null;
  }

  const services =
    await Service.find({
      _id: {
        $in:
          uniqueIds,
      },

      organizationId,

      environmentId,

      status: {
        $ne:
          "archived",
      },
    })
      .select("_id")
      .lean();

  if (
    services.length !==
    uniqueIds.length
  ) {
    res.status(422).json({
      error:
        "One or more services are unavailable in the selected environment",
      code:
        "SERVICE_SCOPE_MISMATCH",
    });

    return null;
  }

  return services.map(
    (service) =>
      service._id
  );
}

/**
 * Attach decrypted secret to the connection object.
 *
 * IMPORTANT:
 * - In-memory only.
 * - Never persisted.
 * - Must be cleared after use.
 */
function withDecryptedSecret(
  connection
) {
  if (!connection) {
    return connection;
  }

  if (
    connection
      .encryptedSecretReference
  ) {
    connection
      ._decryptedSecret =
      decryptSecret(
        connection
          .encryptedSecretReference
      );
  } else {
    connection
      ._decryptedSecret =
      null;
  }

  return connection;
}

function clearRuntimeSecret(
  connection
) {
  if (connection) {
    connection
      ._decryptedSecret =
      undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const createSchema =
  Joi.object({
    provider:
      Joi.string()
        .max(64)
        .required(),

    name:
      Joi.string()
        .max(128)
        .required(),

    serviceIds:
      Joi.array()
        .items(
          Joi.string()
        )
        .default([]),

    nonSecretConfig:
      Joi.object()
        .unknown(true)
        .default({}),

    secret:
      Joi.string()
        .min(1)
        .max(65536)
        .optional(),
  });

const updateSchema =
  Joi.object({
    name:
      Joi.string()
        .max(128)
        .optional(),

    serviceIds:
      Joi.array()
        .items(
          Joi.string()
        )
        .optional(),

    nonSecretConfig:
      Joi.object()
        .unknown(true)
        .optional(),
  });

const rotateSecretSchema =
  Joi.object({
    secret:
      Joi.string()
        .min(1)
        .max(65536)
        .required(),
  });

// ═════════════════════════════════════════════════════════════════════════════
// CATALOGUE ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  "/definitions",
  async (_req, res) => {
    return res.json({
      definitions:
        CATALOGUE,
    });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION CRUD
//
// Every browser connection request requires:
//
// session
//   ↓
// organization
//   ↓
// environment
//   ↓
// integration
//
// browserEnvironmentContext establishes this context.
// ═════════════════════════════════════════════════════════════════════════════

router.use(
  "/connections",
  ...browserEnvironmentContext
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections",
  async (req, res) => {
    const connections =
      await IntegrationConnection
        .find({
          organizationId:
            req.context.organizationId,

          environmentId:
            req.context.environmentId,
        })
        .sort({
          createdAt:
            -1,
        })
        .lean();

    return res.json({
      integrations:
        connections.map(
          safeConnection
        ),

      count:
        connections.length,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections",
  async (req, res) => {
    const {
      error,
      value,
    } =
      createSchema.validate(
        req.body
      );

    if (error) {
      return res
        .status(422)
        .json({
          error:
            error.details[0]
              .message,
          code:
            "VALIDATION_ERROR",
        });
    }

    const def =
      findDefinition(
        value.provider
      );

    if (!def) {
      return res
        .status(422)
        .json({
          error:
            `Unknown provider: ${value.provider}`,
          code:
            "UNKNOWN_PROVIDER",
        });
    }

    if (
      !AVAILABLE_PROVIDERS.has(
        value.provider
      )
    ) {
      return res
        .status(422)
        .json({
          error:
            `Provider "${def.displayName}" is ${
              def.availabilityStatus ===
              "coming_soon"
                ? "coming soon"
                : "in beta"
            } and cannot be connected yet.`,

          availabilityStatus:
            def.availabilityStatus,

          code:
            "PROVIDER_UNAVAILABLE",
        });
    }

    const adapter =
      getAdapter(
        value.provider
      );

    const validation =
      await adapter
        .validateConfiguration(
          value.nonSecretConfig
        );

    if (!validation.valid) {
      return res
        .status(422)
        .json({
          error:
            "Configuration invalid",

          details:
            validation.errors,

          code:
            "INVALID_CONFIGURATION",
        });
    }

    const scopedServiceIds =
      await validateScopedServiceIds(
        req,
        res,
        value.serviceIds
      );

    if (!scopedServiceIds) {
      return;
    }

    const connection =
      await IntegrationConnection
        .create({
          organizationId:
            req.context.organizationId,

          environmentId:
            req.context.environmentId,

          tenantId:
            req.context.tenantId ||
            req.auth.tenantId,

          provider:
            value.provider,

          name:
            value.name,

          serviceIds:
            scopedServiceIds,

          capabilities:
            def.capabilities,

          nonSecretConfig:
            value.nonSecretConfig,

          encryptedSecretReference:
            value.secret
              ? encryptSecret(
                  value.secret
                )
              : null,

          status:
            "connected",

          createdBy:
            req.auth.userId,
        });

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_CREATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          req.context
            .organizationId,

        tenantId:
          req.context.tenantId ||
          req.auth.tenantId,

        metadata: {
          integrationId:
            connection._id,

          environmentId:
            connection.environmentId,

          provider:
            value.provider,

          name:
            value.name,
        },
      }
    ).catch(() => {});

    return res
      .status(201)
      .json({
        integration:
          safeConnection(
            connection
          ),
      });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections/:integrationId
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections/:integrationId",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res
      );

    if (!connection) {
      return;
    }

    const def =
      findDefinition(
        connection.provider
      );

    return res.json({
      integration: {
        ...safeConnection(
          connection
        ),

        definition:
          def ?? null,
      },
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /connections/:integrationId
// ─────────────────────────────────────────────────────────────────────────────

router.patch(
  "/connections/:integrationId",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res
      );

    if (!connection) {
      return;
    }

    const {
      error,
      value,
    } =
      updateSchema.validate(
        req.body
      );

    if (error) {
      return res
        .status(422)
        .json({
          error:
            error.details[0]
              .message,

          code:
            "VALIDATION_ERROR",
        });
    }

    if (
      value.name != null
    ) {
      connection.name =
        value.name;
    }

    if (
      value.serviceIds != null
    ) {
      const scopedServiceIds =
        await validateScopedServiceIds(
          req,
          res,
          value.serviceIds
        );

      if (!scopedServiceIds) {
        return;
      }

      connection.serviceIds =
        scopedServiceIds;
    }

    if (
      value.nonSecretConfig !=
      null
    ) {
      const adapter =
        getAdapter(
          connection.provider
        );

      const validation =
        await adapter
          .validateConfiguration(
            value.nonSecretConfig
          );

      if (!validation.valid) {
        return res
          .status(422)
          .json({
            error:
              "Configuration invalid",

            details:
              validation.errors,

            code:
              "INVALID_CONFIGURATION",
          });
      }

      connection.nonSecretConfig =
        value.nonSecretConfig;
    }

    await connection.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_UPDATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          connection.organizationId,

        tenantId:
          connection.tenantId,

        metadata: {
          integrationId:
            connection._id,

          environmentId:
            connection.environmentId,
        },
      }
    ).catch(() => {});

    return res.json({
      integration:
        safeConnection(
          connection
        ),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/test
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/test",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res,
        {
          includeSecret:
            true,
        }
      );

    if (!connection) {
      return;
    }

    if (
      connection.status ===
      "disabled"
    ) {
      return res
        .status(409)
        .json({
          error:
            "Integration is disabled",

          code:
            "INTEGRATION_DISABLED",
        });
    }

    let adapter;

    try {
      adapter =
        getAdapter(
          connection.provider
        );
    } catch (error) {
      return res
        .status(
          error.status ??
          501
        )
        .json({
          error:
            error.message,

          code:
            error.code ||
            "ADAPTER_NOT_AVAILABLE",
        });
    }

    try {
      const runtimeConnection =
        withDecryptedSecret(
          connection
        );

      const result =
        await adapter
          .testConnection(
            runtimeConnection
          );

      const now =
        new Date();

      if (
        result.success
      ) {
        await IntegrationConnection
          .findOneAndUpdate(
            {
              _id:
                connection._id,

              organizationId:
                connection
                  .organizationId,

              environmentId:
                connection
                  .environmentId,
            },
            {
              $set: {
                status:
                  "connected",

                healthStatus:
                  "healthy",

                connectedAt:
                  connection
                    .connectedAt ||
                  now,

                disconnectedAt:
                  null,

                lastHealthCheckAt:
                  now,

                lastLatencyMs:
                  result
                    .latencyMs ??
                  null,

                errorSummary:
                  null,

                lastErrorAt:
                  null,

                consecutiveFailures:
                  0,
              },
            }
          );
      } else {
        await IntegrationConnection
          .findOneAndUpdate(
            {
              _id:
                connection._id,

              organizationId:
                connection
                  .organizationId,

              environmentId:
                connection
                  .environmentId,
            },
            {
              $set: {
                status:
                  connection
                    .connectedAt
                    ? "degraded"
                    : "disconnected",

                healthStatus:
                  "unhealthy",

                disconnectedAt:
                  connection
                    .connectedAt
                    ? null
                    : now,

                lastHealthCheckAt:
                  now,

                lastLatencyMs:
                  result
                    .latencyMs ??
                  null,

                lastErrorAt:
                  now,

                errorSummary:
                  String(
                    result.detail ||
                    "Connection test failed"
                  ).slice(
                    0,
                    512
                  ),
              },

              $inc: {
                consecutiveFailures:
                  1,
              },
            }
          );
      }

      return res.json({
        success:
          result.success,

        latencyMs:
          result.latencyMs,

        detail:
          result.detail,

        metadata:
          result.metadata ||
          null,
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          success:
            false,

          error:
            error.message,

          code:
            error.code ||
            "INTEGRATION_TEST_FAILED",
        });
    } finally {
      clearRuntimeSecret(
        connection
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/disable
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/disable",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res
      );

    if (!connection) {
      return;
    }

    if (
      connection.status ===
      "disabled"
    ) {
      return res
        .status(400)
        .json({
          error:
            "Already disabled",
          code:
            "INTEGRATION_ALREADY_DISABLED",
        });
    }

    connection.status =
      "disabled";

    connection.disabledAt =
      new Date();

    await connection.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_DISABLED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          connection.organizationId,

        tenantId:
          connection.tenantId,

        metadata: {
          integrationId:
            connection._id,

          environmentId:
            connection.environmentId,
        },
      }
    ).catch(() => {});

    return res.json({
      integration:
        safeConnection(
          connection
        ),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/rotate-secret
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/rotate-secret",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res,
        {
          includeSecret:
            true,
        }
      );

    if (!connection) {
      return;
    }

    const {
      error,
      value,
    } =
      rotateSecretSchema
        .validate(
          req.body
        );

    if (error) {
      return res
        .status(422)
        .json({
          error:
            error.details[0]
              .message,

          code:
            "VALIDATION_ERROR",
        });
    }

    const secretStorage =
      getSecretStorage();

    await secretStorage
      .rotateSecret(
        connection,
        value.secret
      );

    /*
     * Credentials changed.
     *
     * We cannot trust the old health/connection state
     * until the new credential is tested.
     */
    connection.status =
      "disconnected";

    connection.healthStatus =
      "unknown";

    connection.disconnectedAt =
      new Date();

    connection.errorSummary =
      null;

    connection.lastErrorAt =
      null;

    connection.consecutiveFailures =
      0;

    await connection.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_SECRET_ROTATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          connection
            .organizationId,

        tenantId:
          connection.tenantId,

        metadata: {
          integrationId:
            connection._id,

          environmentId:
            connection
              .environmentId,

          secretVersion:
            connection
              .secretVersion,
        },
      }
    ).catch(
      () => {}
    );

    return res.json({
      success:
        true,

      status:
        connection.status,

      healthStatus:
        connection
          .healthStatus,

      secretVersion:
        connection
          .secretVersion,

      secretUpdatedAt:
        connection
          .secretUpdatedAt,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections/:integrationId/discovery
//
// Kubernetes discovery is scoped to the integration's environment.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections/:integrationId/discovery",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res,
        {
          includeSecret:
            true,
        }
      );

    if (!connection) {
      return;
    }

    if (
      connection.provider !==
      "kubernetes"
    ) {
      return res
        .status(422)
        .json({
          error:
            "Discovery is currently supported only for Kubernetes integrations",

          code:
            "DISCOVERY_NOT_SUPPORTED",
        });
    }

    if (
      connection.status ===
      "disabled"
    ) {
      return res
        .status(409)
        .json({
          error:
            "Integration is disabled",

          code:
            "INTEGRATION_DISABLED",
        });
    }

    try {
      const runtimeConnection =
        withDecryptedSecret(
          connection
        );

      if (
        !runtimeConnection
          ._decryptedSecret &&
        runtimeConnection
          .nonSecretConfig
          ?.authMode !==
          "in_cluster"
      ) {
        return res
          .status(422)
          .json({
            error:
              "Kubernetes credentials are unavailable",

            code:
              "KUBERNETES_CREDENTIALS_UNAVAILABLE",
          });
      }

      const startedAt =
        Date.now();

      const discovery =
        await kubernetesDiscoveryService
          .discoverCluster(
            runtimeConnection
          );

      const tenantId =
        connection.tenantId ||
        req.context?.tenantId ||
        req.auth.tenantId;

      const persisted =
        await kubernetesInventoryService
          .persistDiscovery({
            tenantId,

            organizationId:
              connection
                .organizationId,

            environmentId:
              connection
                .environmentId,

            integrationId:
              connection._id,

            discovery,

            durationMs:
              Date.now() -
              startedAt,
          });

      const relationships =
        await kubernetesRelationshipService
          .rebuildRelationships({
            tenantId,

            organizationId:
              connection
                .organizationId,

            environmentId:
              connection
                .environmentId,

            integrationId:
              connection._id,

            syncId:
              persisted.syncId,
          });

      const now =
        new Date();

      await IntegrationConnection
        .findOneAndUpdate(
          {
            _id:
              connection._id,

            organizationId:
              connection
                .organizationId,

            environmentId:
              connection
                .environmentId,
          },
          {
            $set: {
              status:
                "connected",

              healthStatus:
                "healthy",

              connectedAt:
                connection
                  .connectedAt ||
                now,

              disconnectedAt:
                null,

              lastHealthCheckAt:
                now,

              lastLatencyMs:
                Date.now() -
                startedAt,

              errorSummary:
                null,

              lastErrorAt:
                null,

              consecutiveFailures:
                0,
            },
          }
        );

      return res.json({
        integrationId:
          connection._id,

        environmentId:
          connection
            .environmentId,

        provider:
          connection.provider,

        name:
          connection.name,

        healthStatus:
          "healthy",

        syncId:
          persisted.syncId,

        inventory:
          persisted,

        relationships,

        ...discovery,
      });
    } catch (error) {
      console.error(
        "[integrationRoutes] Kubernetes discovery failed:",
        {
          integrationId:
            connection._id
              ?.toString(),

          organizationId:
            connection
              .organizationId
              ?.toString(),

          environmentId:
            connection
              .environmentId
              ?.toString(),

          error:
            error.message,
        }
      );

      const failedAt =
        new Date();

      await IntegrationConnection
        .findOneAndUpdate(
          {
            _id:
              connection._id,

            organizationId:
              connection
                .organizationId,

            environmentId:
              connection
                .environmentId,
          },
          {
            $set: {
              status:
                "degraded",

              healthStatus:
                "unhealthy",

              lastHealthCheckAt:
                failedAt,

              lastErrorAt:
                failedAt,

              errorSummary:
                String(
                  error.message ||
                  "Discovery failed"
                ).slice(
                  0,
                  512
                ),
            },

            $inc: {
              consecutiveFailures:
                1,
            },
          }
        )
        .catch(
          () => {}
        );

      return res
        .status(502)
        .json({
          error:
            "Kubernetes discovery failed",

          details:
            error.message,

          code:
            "KUBERNETES_DISCOVERY_FAILED",
        });
    } finally {
      clearRuntimeSecret(
        connection
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /connections/:integrationId
// ─────────────────────────────────────────────────────────────────────────────

router.delete(
  "/connections/:integrationId",
  async (req, res) => {
    const connection =
      await loadConnection(
        req,
        res,
        {
          includeSecret:
            true,
        }
      );

    if (!connection) {
      return;
    }

    let adapter =
      null;

    try {
      adapter =
        getAdapter(
          connection.provider
        );
    } catch {
      adapter =
        null;
    }

    if (
      adapter &&
      typeof adapter.revoke ===
        "function"
    ) {
      try {
        const runtimeConnection =
          withDecryptedSecret(
            connection
          );

        await adapter.revoke(
          runtimeConnection
        );
      } catch (error) {
        console.warn(
          "[integrationRoutes] Integration revoke failed:",
          {
            integrationId:
              connection._id
                ?.toString(),

            environmentId:
              connection
                .environmentId
                ?.toString(),

            provider:
              connection.provider,

            error:
              error.message,
          }
        );
      } finally {
        clearRuntimeSecret(
          connection
        );
      }
    }

    await IntegrationConnection
      .deleteOne({
        _id:
          connection._id,

        organizationId:
          connection
            .organizationId,

        environmentId:
          connection
            .environmentId,
      });

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_DELETED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          connection
            .organizationId,

        tenantId:
          connection.tenantId,

        metadata: {
          integrationId:
            connection._id,

          environmentId:
            connection
              .environmentId,

          provider:
            connection.provider,
        },
      }
    ).catch(
      () => {}
    );

    return res
      .status(204)
      .end();
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// WEBHOOK INGESTION ROUTES
//
// Browser management routes:
//   session -> organization -> environment
//
// External ingestion route:
//   sourceId + webhook API key
//       -> registered source
//       -> organization/environment resolved internally
//
// IMPORTANT:
// External senders are never allowed to choose organizationId,
// tenantId, or environmentId in the payload.
// ═════════════════════════════════════════════════════════════════════════════

function webhookEnvironmentContext(req) {
  return {
    organizationId:
      req.context?.organizationId ||
      req.auth?.organizationId,

    environmentId:
      req.context?.environmentId,

    tenantId:
      req.context?.tenantId ||
      req.auth?.tenantId,
  };
}

/**
 * Extract machine webhook credentials.
 *
 * Preferred:
 *
 * X-AIRA-Webhook-Source: whsrc_...
 * X-AIRA-Webhook-Key: aira_wh_...
 *
 * Credentials are intentionally not taken from query params
 * because URLs are commonly logged by proxies/load balancers.
 */
function extractWebhookCredentials(req) {
  const sourceId =
    req.headers[
      "x-aira-webhook-source"
    ];

  const apiKey =
    req.headers[
      "x-aira-webhook-key"
    ];

  return {
    sourceId:
      typeof sourceId ===
      "string"
        ? sourceId.trim()
        : null,

    apiKey:
      typeof apiKey ===
      "string"
        ? apiKey.trim()
        : null,
  };
}

function webhookErrorResponse(
  res,
  error,
  fallbackMessage
) {
  const status =
    error.status ||
    error.statusCode ||
    500;

  return res
    .status(status)
    .json({
      success:
        false,

      error:
        status >= 500
          ? fallbackMessage
          : error.message,

      code:
        error.code ||
        (
          status >= 500
            ? "WEBHOOK_INTERNAL_ERROR"
            : "WEBHOOK_REQUEST_ERROR"
        ),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/register
//
// Browser-authenticated registration.
//
// The selected AIRA environment becomes the permanent ownership
// environment for this webhook source.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/webhooks/register",
  ...browserEnvironmentContext,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        sourceConfig,
      } =
        req.body || {};

      if (
        !sourceConfig ||
        typeof sourceConfig !==
          "object"
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing sourceConfig",

            code:
              "SOURCE_CONFIG_REQUIRED",
          });
      }

      if (
        !sourceConfig.name
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing sourceConfig.name",

            code:
              "SOURCE_NAME_REQUIRED",
          });
      }

      if (
        !sourceConfig.type
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing sourceConfig.type",

            code:
              "SOURCE_TYPE_REQUIRED",
          });
      }

      const result =
        await webhookIngestionService
          .registerWebhookSource(
            webhookEnvironmentContext(
              req
            ),
            sourceConfig
          );

      /**
       * apiKey is intentionally returned only by registration.
       * The service persists only its hash.
       */
      return res
        .status(201)
        .json({
          success:
            true,

          data:
            result,
        });
    } catch (error) {
      if (
        error.status ||
        error.statusCode
      ) {
        return webhookErrorResponse(
          res,
          error,
          "Failed to register webhook source"
        );
      }

      return next(
        error
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/ingest
//
// PUBLIC MACHINE ENDPOINT.
//
// Authentication is performed using the registered webhook source:
//   X-AIRA-Webhook-Source
//   X-AIRA-Webhook-Key
//
// No browser session/environment is required.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/webhooks/ingest",
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        sourceId,
        apiKey,
      } =
        extractWebhookCredentials(
          req
        );

      if (
        !sourceId ||
        !apiKey
      ) {
        return res
          .status(401)
          .json({
            success:
              false,

            error:
              "Webhook authentication required",

            code:
              "WEBHOOK_AUTH_REQUIRED",
          });
      }

      const payload =
        req.body;

      if (
        !payload ||
        typeof payload !==
          "object" ||
        Array.isArray(payload)
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Webhook payload is required",

            code:
              "WEBHOOK_PAYLOAD_REQUIRED",
          });
      }

      /**
       * Critical enterprise invariant:
       *
       * We do NOT pass:
       *
       * organizationId
       * environmentId
       * tenantId
       *
       * from the request.
       *
       * ingestEvent() derives them from sourceId + API key.
       */
      const event =
        await webhookIngestionService
          .ingestEvent(
            sourceId,
            apiKey,
            payload
          );

      return res
        .status(202)
        .json({
          success:
            true,

          eventId:
            event.eventId,

          status:
            event.status,

          receivedAt:
            event.timestamp,
        });
    } catch (error) {
      if (
        error.status ||
        error.statusCode
      ) {
        return webhookErrorResponse(
          res,
          error,
          "Failed to ingest webhook event"
        );
      }

      return next(
        error
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /webhooks/:eventId/decision
//
// Environment-scoped authenticated operation.
//
// This currently represents the legacy path for associating an AIRA
// decision with an ingested webhook event.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/webhooks/:eventId/decision",
  ...browserEnvironmentContext,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        decision,
      } =
        req.body || {};

      if (
        !decision ||
        typeof decision !==
          "object"
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing decision",

            code:
              "DECISION_REQUIRED",
          });
      }

      if (
        !decision.action
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing decision.action",

            code:
              "DECISION_ACTION_REQUIRED",
          });
      }

      const event =
        await webhookIngestionService
          .recordAiiraDecision(
            req.params.eventId,
            decision,
            webhookEnvironmentContext(
              req
            )
          );

      return res.json({
        success:
          true,

        eventId:
          event.eventId,

        action:
          event.aiiraDecision
            ?.action,

        status:
          event.status,
      });
    } catch (error) {
      if (
        error.status ||
        error.statusCode
      ) {
        return webhookErrorResponse(
          res,
          error,
          "Failed to record webhook decision"
        );
      }

      return next(
        error
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /webhooks/history
//
// Browser authenticated and environment scoped.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/webhooks/history",
  ...browserEnvironmentContext,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        sourceId =
          null,

        limit =
          50,
      } =
        req.query;

      const events =
        await webhookIngestionService
          .getEventHistory(
            webhookEnvironmentContext(
              req
            ),

            sourceId,

            limit
          );

      return res.json({
        success:
          true,

        organizationId:
          req.context
            .organizationId,

        environmentId:
          req.context
            .environmentId,

        tenantId:
          req.context
            .tenantId ||
          req.auth
            .tenantId,

        eventsCount:
          events.length,

        events,
      });
    } catch (error) {
      if (
        error.status ||
        error.statusCode
      ) {
        return webhookErrorResponse(
          res,
          error,
          "Failed to load webhook history"
        );
      }

      return next(
        error
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /webhooks/stats
//
// Browser authenticated and environment scoped.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/webhooks/stats",
  ...browserEnvironmentContext,
  async (
    req,
    res,
    next
  ) => {
    try {
      const stats =
        await webhookIngestionService
          .getStatistics(
            webhookEnvironmentContext(
              req
            )
          );

      const total =
        stats.reduce(
          (
            accumulator,
            item
          ) =>
            accumulator +
            (
              item.total ||
              0
            ),
          0
        );

      const processed =
        stats.reduce(
          (
            accumulator,
            item
          ) =>
            accumulator +
            (
              item.processed ||
              0
            ),
          0
        );

      const failed =
        stats.reduce(
          (
            accumulator,
            item
          ) =>
            accumulator +
            (
              item.failed ||
              0
            ),
          0
        );

      return res.json({
        success:
          true,

        organizationId:
          req.context
            .organizationId,

        environmentId:
          req.context
            .environmentId,

        tenantId:
          req.context
            .tenantId ||
          req.auth
            .tenantId,

        summary: {
          total,
          processed,
          failed,
        },

        bySource:
          stats,
      });
    } catch (error) {
      if (
        error.status ||
        error.statusCode
      ) {
        return webhookErrorResponse(
          res,
          error,
          "Failed to load webhook statistics"
        );
      }

      return next(
        error
      );
    }
  }
);

module.exports = router;