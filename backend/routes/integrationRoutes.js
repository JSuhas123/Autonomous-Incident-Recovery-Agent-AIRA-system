"use strict";

const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");

const {
  CATALOGUE,
  AVAILABLE_PROVIDERS,
  findDefinition,
} = require("../config/integrationCatalogue");

const {
  IntegrationConnection,
} = require("../models/IntegrationConnection");

const {
  encryptSecret,
  decryptSecret,
  maskSecret,
} = require("../services/integrations/secretStorage");

const {
  getAdapter,
} = require("../services/integrations/adapterRegistry");

const {
  UnsupportedOperationError,
} = require("../services/integrations/adapterInterface");

const {
  record: auditRecord,
} = require("../services/identity/identityAuditService");

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_OUTCOMES,
} = require("../constants/authEvents");

const {
  sessionAuthMiddleware,
} = require("../middleware/sessionAuthMiddleware");

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

function safeConnection(doc) {
  return {
    id: doc._id,

    organizationId:
      doc.organizationId,

    tenantId:
      doc.tenantId,

    provider:
      doc.provider,

    name:
      doc.name,

    serviceIds:
      doc.serviceIds,

    status:
      doc.status,

    capabilities:
      doc.capabilities,

    nonSecretConfig:
      doc.nonSecretConfig,

    // Never expose raw or decrypted secrets.
    hasSecret:
      Boolean(
        doc.encryptedSecretReference
      ),

    lastEventAt:
      doc.lastEventAt,

    lastSuccessfulEventAt:
      doc.lastSuccessfulEventAt,

    healthStatus:
      doc.healthStatus,

    errorSummary:
      doc.errorSummary,

    createdBy:
      doc.createdBy,

    createdAt:
      doc.createdAt,

    updatedAt:
      doc.updatedAt,

    disabledAt:
      doc.disabledAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Load + organisation isolation helper
// ─────────────────────────────────────────────────────────────────────────────

async function loadConnection(
  req,
  res
) {
  const {
    integrationId,
  } = req.params;

  let conn;

  try {
    conn =
      await IntegrationConnection
        .findById(
          integrationId
        );
  } catch {
    res.status(400).json({
      error:
        "Invalid integration ID",
    });

    return null;
  }

  if (!conn) {
    res.status(404).json({
      error:
        "Integration not found",
    });

    return null;
  }

  if (
    conn.organizationId
      .toString() !==
    req.auth.organizationId
      .toString()
  ) {
    res.status(403).json({
      error:
        "Forbidden",
    });

    return null;
  }

  return conn;
}

/**
 * Attach decrypted secret to the connection object.
 *
 * IMPORTANT:
 * - In-memory only.
 * - Never persisted.
 * - Callers should clear _decryptedSecret after use.
 */
function withDecryptedSecret(
  conn
) {
  if (
    conn.encryptedSecretReference
  ) {
    try {
      conn._decryptedSecret =
        decryptSecret(
          conn.encryptedSecretReference
        );
    } catch {
      conn._decryptedSecret =
        null;
    }
  }

  return conn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const createSchema =
  Joi.object({
    provider:
      Joi
        .string()
        .max(64)
        .required(),

    name:
      Joi
        .string()
        .max(128)
        .required(),

    serviceIds:
      Joi
        .array()
        .items(
          Joi.string()
        )
        .default([]),

    nonSecretConfig:
      Joi
        .object()
        .unknown(true)
        .default({}),

    secret:
      Joi
        .string()
        .max(65536)
        .allow("")
        .optional(),
  });

const updateSchema =
  Joi.object({
    name:
      Joi
        .string()
        .max(128)
        .optional(),

    serviceIds:
      Joi
        .array()
        .items(
          Joi.string()
        )
        .optional(),

    nonSecretConfig:
      Joi
        .object()
        .unknown(true)
        .optional(),
  });

const rotateSecretSchema =
  Joi.object({
    secret:
      Joi
        .string()
        .max(65536)
        .allow("")
        .required(),
  });

// ═════════════════════════════════════════════════════════════════════════════
// CATALOGUE ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /integration-definitions
 *
 * Public catalogue of all providers.
 *
 * Mounted through server.js.
 */
router.get(
  "/definitions",
  async (
    _req,
    res
  ) => {
    return res.json({
      definitions:
        CATALOGUE,
    });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION CRUD
// Session auth required.
// ═════════════════════════════════════════════════════════════════════════════

router.use(
  "/connections",
  sessionAuthMiddleware
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections",
  async (
    req,
    res
  ) => {
    const connections =
      await IntegrationConnection
        .find({
          organizationId:
            req.auth
              .organizationId,
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
  async (
    req,
    res
  ) => {
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
        });
    }

    // Validate provider-specific configuration.
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
        });
    }

    const conn =
      await IntegrationConnection
        .create({
          organizationId:
            req.auth
              .organizationId,

          tenantId:
            req.auth
              .tenantId,

          provider:
            value.provider,

          name:
            value.name,

          serviceIds:
            value.serviceIds,

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
          req.auth
            .organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          integrationId:
            conn._id,

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
            conn
          ),
      });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections/:integrationId
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections/:integrationId",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
      return;
    }

    const def =
      findDefinition(
        conn.provider
      );

    return res.json({
      integration: {
        ...safeConnection(
          conn
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
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
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
        });
    }

    if (
      value.name != null
    ) {
      conn.name =
        value.name;
    }

    if (
      value.serviceIds != null
    ) {
      conn.serviceIds =
        value.serviceIds;
    }

    if (
      value.nonSecretConfig !=
      null
    ) {
      const adapter =
        getAdapter(
          conn.provider
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
          });
      }

      conn.nonSecretConfig =
        value.nonSecretConfig;
    }

    await conn.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_UPDATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          req.auth
            .organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          integrationId:
            conn._id,
        },
      }
    ).catch(() => {});

    return res.json({
      integration:
        safeConnection(
          conn
        ),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/test
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/test",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
      return;
    }

    let adapter;

    try {
      adapter =
        getAdapter(
          conn.provider
        );
    } catch (err) {
      return res
        .status(
          err.status ?? 501
        )
        .json({
          error:
            err.message,
        });
    }

    try {
      const connection =
        withDecryptedSecret(
          conn
        );

      const result =
        await adapter
          .testConnection(
            connection
          );

      await IntegrationConnection
        .findByIdAndUpdate(
          conn._id,
          {
            $set: {
              healthStatus:
                result.success
                  ? "healthy"
                  : "unhealthy",

              errorSummary:
                result.success
                  ? null
                  : (
                      result.detail ??
                      "Test failed"
                    ),

              lastEventAt:
                result.success
                  ? new Date()
                  : conn.lastEventAt,

              lastSuccessfulEventAt:
                result.success
                  ? new Date()
                  : conn
                      .lastSuccessfulEventAt,
            },
          }
        );

      return res.json({
        success:
          result.success,

        latencyMs:
          result.latencyMs,

        detail:
          result.detail,
      });
    } catch (err) {
      return res
        .status(500)
        .json({
          success:
            false,

          error:
            err.message,
        });
    } finally {
      conn._decryptedSecret =
        undefined;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/disable
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/disable",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
      return;
    }

    if (
      conn.status ===
      "disabled"
    ) {
      return res
        .status(400)
        .json({
          error:
            "Already disabled",
        });
    }

    conn.status =
      "disabled";

    conn.disabledAt =
      new Date();

    await conn.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_DISABLED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          req.auth
            .organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          integrationId:
            conn._id,
        },
      }
    ).catch(() => {});

    return res.json({
      integration:
        safeConnection(
          conn
        ),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /connections/:integrationId/rotate-secret
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/connections/:integrationId/rotate-secret",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
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
        });
    }

    conn.encryptedSecretReference =
      value.secret
        ? encryptSecret(
            value.secret
          )
        : null;

    await conn.save();

    auditRecord(
      AUTH_EVENT_TYPES
        .INTEGRATION_SECRET_ROTATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          req.auth.userId,

        organizationId:
          req.auth
            .organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          integrationId:
            conn._id,
        },
      }
    ).catch(() => {});

    return res.json({
      success:
        true,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /connections/:integrationId/discovery
//
// Kubernetes-only Phase 2B/2C discovery.
//
// This route:
// - decrypts the kubeconfig in memory
// - queries the live cluster
// - persists resource inventory
// - returns discovery + persisted inventory metadata
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/connections/:integrationId/discovery",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
      return;
    }

    if (
      conn.provider !==
      "kubernetes"
    ) {
      return res
        .status(422)
        .json({
          error:
            "Discovery is currently supported only for Kubernetes integrations",
        });
    }

    if (
      conn.status ===
      "disabled"
    ) {
      return res
        .status(409)
        .json({
          error:
            "Integration is disabled",
        });
    }

    try {
      const connection =
        withDecryptedSecret(
          conn
        );

      if (
        !connection
          ._decryptedSecret &&
        connection
          .nonSecretConfig
          ?.authMode !==
          "in_cluster"
      ) {
        return res
          .status(422)
          .json({
            error:
              "Kubernetes credentials are unavailable",
          });
      }

      const startedAt =
        Date.now();

      const discovery =
        await kubernetesDiscoveryService
          .discoverCluster(
            connection
          );

      const tenantId =
        conn.tenantId ||
        req.auth.tenantId ||
        req.auth
          .organizationId;

      const persisted =
        await kubernetesInventoryService
          .persistDiscovery({
            tenantId,

            organizationId:
              conn.organizationId,

            integrationId:
              conn._id,

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
              conn.organizationId,

            integrationId:
              conn._id,
          });

      await IntegrationConnection
        .findByIdAndUpdate(
          conn._id,
          {
            $set: {
              healthStatus:
                "healthy",

              errorSummary:
                null,

              lastEventAt:
                new Date(),

              lastSuccessfulEventAt:
                new Date(),
            },
          }
        );

      return res.json({
        integrationId:
          conn._id,

        provider:
          conn.provider,

        name:
          conn.name,

        healthStatus:
          "healthy",

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
            conn._id
              ?.toString(),

          organizationId:
            req.auth
              .organizationId
              ?.toString(),

          error:
            error.message,
        }
      );

      await IntegrationConnection
        .findByIdAndUpdate(
          conn._id,
          {
            $set: {
              healthStatus:
                "unhealthy",

              errorSummary:
                error.message,
            },
          }
        )
        .catch(() => {});

      return res
        .status(502)
        .json({
          error:
            "Kubernetes discovery failed",

          details:
            error.message,
        });
    } finally {
      // Ensure decrypted credentials are not retained in memory longer than needed.
      conn._decryptedSecret =
        undefined;
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /connections/:integrationId
// ─────────────────────────────────────────────────────────────────────────────

router.delete(
  "/connections/:integrationId",
  async (
    req,
    res
  ) => {
    const conn =
      await loadConnection(
        req,
        res
      );

    if (!conn) {
      return;
    }

    let adapter;

    try {
      adapter =
        getAdapter(
          conn.provider
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
        await adapter.revoke(
          withDecryptedSecret(
            conn
          )
        );
      } catch (error) {
        console.warn(
          "[integrationRoutes] Integration revoke failed:",
          {
            integrationId:
              conn._id
                ?.toString(),

            provider:
              conn.provider,

            error:
              error.message,
          }
        );
      } finally {
        conn._decryptedSecret =
          undefined;
      }
    }

    await IntegrationConnection
      .deleteOne({
        _id:
          conn._id,
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
          req.auth
            .organizationId,

        tenantId:
          req.auth.tenantId,

        metadata: {
          integrationId:
            conn._id,

          provider:
            conn.provider,
        },
      }
    ).catch(() => {});

    return res
      .status(204)
      .end();
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// LEGACY WEBHOOK INGESTION ROUTES
//
// Kept unchanged for backwards compatibility.
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  "/webhooks/register",
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        tenantId =
          "default",

        sourceConfig,
      } = req.body;

      if (
        !sourceConfig?.name
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing sourceConfig.name",
          });
      }

      const result =
        await webhookIngestionService
          .registerWebhookSource(
            tenantId,
            sourceConfig
          );

      return res.json({
        success:
          true,

        data:
          result,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

router.post(
  "/webhooks/ingest",
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        tenantId =
          "default",

        source,

        payload,
      } = req.body;

      if (
        !source ||
        !payload
      ) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing source or payload",
          });
      }

      const event =
        await webhookIngestionService
          .ingestEvent(
            tenantId,
            source,
            payload
          );

      return res.json({
        success:
          true,

        eventId:
          event.eventId,

        status:
          event.status,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

router.post(
  "/webhooks/:eventId/decision",
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        decision,
      } = req.body;

      if (!decision) {
        return res
          .status(400)
          .json({
            success:
              false,

            error:
              "Missing decision",
          });
      }

      const event =
        await webhookIngestionService
          .recordAiiraDecision(
            req.params
              .eventId,

            decision
          );

      return res.json({
        success:
          true,

        eventId:
          req.params
            .eventId,

        action:
          event
            .aiiraDecision
            .action,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

router.get(
  "/webhooks/history",
  sessionAuthMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        tenantId =
          "default",

        source,

        limit =
          50,
      } = req.query;

      const events =
        await webhookIngestionService
          .getEventHistory(
            tenantId,
            source,
            parseInt(
              limit,
              10
            )
          );

      return res.json({
        success:
          true,

        tenantId,

        eventsCount:
          events.length,

        events,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

router.get(
  "/webhooks/stats",
  sessionAuthMiddleware,
  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        tenantId =
          "default",
      } = req.query;

      const stats =
        await webhookIngestionService
          .getStatistics(
            tenantId
          );

      const total =
        stats.reduce(
          (
            accumulator,
            item
          ) =>
            accumulator +
            item.total,
          0
        );

      const processed =
        stats.reduce(
          (
            accumulator,
            item
          ) =>
            accumulator +
            item.processed,
          0
        );

      return res.json({
        success:
          true,

        tenantId,

        summary: {
          total,
          processed,
        },

        bySource:
          stats,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

module.exports = router;