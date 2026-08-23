"use strict";

const {
  isDatabaseIdentifier,
} =
  require(
    "../utils/identifier"
  );

const {
  IntegrationConnection,
} =
  require(
    "../persistence/operational/operationalModels"
  );

const express =
  require("express");

const router =
  express.Router({
    mergeParams:
      true,
  });

const {
  getSecretStorage,
} =
  require(
    "../services/integrations/secretStorage"
  );

const kubernetesDiscoveryService =
  require(
    "../services/discovery/kubernetesDiscoveryService"
  );

const kubernetesInventoryService =
  require(
    "../services/discovery/kubernetesInventoryService"
  );

const kubernetesRelationshipService =
  require(
    "../services/discovery/kubernetesRelationshipService"
  );

// ============================================================================
// CONTEXT
// ============================================================================

function requireInventoryContext(
  req,
  res
) {
  const context =
    req.context;

  if (!context) {
    res
      .status(500)
      .json({
        error:
          "Request context unavailable",

        code:
          "REQUEST_CONTEXT_MISSING",
      });

    return null;
  }

  if (
    !context.organizationId ||
    !context.environmentId ||
    !context.tenantId
  ) {
    res
      .status(500)
      .json({
        error:
          "Complete inventory context unavailable",

        code:
          "INVENTORY_CONTEXT_MISSING",
      });

    return null;
  }

  return context;
}

// ============================================================================
// CONNECTION
// ============================================================================

async function getKubernetesConnection(
  context,
  connectionId
) {
  if (
    !isDatabaseIdentifier(
        connectionId
      )
  ) {
    return null;
  }

  /*
   * Integration ownership is now proven against BOTH
   * organization and environment.
   */
  const connection =
    await IntegrationConnection
      .findOne({
        _id:
          connectionId,

        organizationId:
          context.organizationId,

        environmentId:
          context.environmentId,

        provider:
          "kubernetes",

        status: {
          $ne:
            "deleted",
        },
      });

  if (!connection) {
    return null;
  }

  const secretStorage =
    getSecretStorage();

  /*
   * Secret exists only for the lifetime of this request.
   */
  const decryptedSecret =
    await secretStorage
      .getSecret(
        connection
      );

  connection._decryptedSecret =
    decryptedSecret;

  return connection;
}

// ============================================================================
// GET /:connectionId/discovery
//
// READ-ONLY PREVIEW.
// ============================================================================

router.get(
  "/:connectionId/discovery",

  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        requireInventoryContext(
          req,
          res
        );

      if (!context) {
        return;
      }

      const connection =
        await getKubernetesConnection(
          context,
          req.params
            .connectionId
        );

      if (!connection) {
        return res
          .status(404)
          .json({
            error:
              "Kubernetes integration not found",

            code:
              "KUBERNETES_INTEGRATION_NOT_FOUND",
          });
      }

      const discovery =
        await kubernetesDiscoveryService
          .discoverCluster(
            connection
          );

      return res.json({
        persisted:
          false,

        connectionId:
          connection._id,

        provider:
          "kubernetes",

        organizationId:
          context.organizationId,

        environmentId:
          context.environmentId,

        ...discovery,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// POST /:connectionId/discovery/sync
//
// FULL INVENTORY SYNCHRONIZATION.
// ============================================================================

router.post(
  "/:connectionId/discovery/sync",

  async (
    req,
    res,
    next
  ) => {
    const startedAt =
      Date.now();

    try {
      const context =
        requireInventoryContext(
          req,
          res
        );

      if (!context) {
        return;
      }

      const connection =
        await getKubernetesConnection(
          context,
          req.params
            .connectionId
        );

      if (!connection) {
        return res
          .status(404)
          .json({
            error:
              "Kubernetes integration not found",

            code:
              "KUBERNETES_INTEGRATION_NOT_FOUND",
          });
      }

      // ----------------------------------------------------------------------
      // 1. LIVE DISCOVERY
      // ----------------------------------------------------------------------

      const discovery =
        await kubernetesDiscoveryService
          .discoverCluster(
            connection
          );

      const durationMs =
        Date.now() -
        startedAt;

      // ----------------------------------------------------------------------
      // 2. PROVIDER + CANONICAL RESOURCE INVENTORY
      // ----------------------------------------------------------------------

      const inventory =
        await kubernetesInventoryService
          .persistDiscovery({
            tenantId:
              context.tenantId,

            organizationId:
              context.organizationId,

            environmentId:
              context.environmentId,

            integrationId:
              connection._id,

            discovery,

            durationMs,

            syncCanonical:
              true,
          });

      // ----------------------------------------------------------------------
      // 3. PROVIDER + CANONICAL RELATIONSHIP GRAPH
      // ----------------------------------------------------------------------

      const relationships =
        await kubernetesRelationshipService
          .rebuildRelationships({
            tenantId:
              context.tenantId,

            organizationId:
              context.organizationId,

            environmentId:
              context.environmentId,

            integrationId:
              connection._id,

            syncCanonical:
              true,
          });

      return res
        .status(200)
        .json({
          success:
            true,

          provider:
            "kubernetes",

          connectionId:
            connection._id,

          organizationId:
            context.organizationId,

          environmentId:
            context.environmentId,

          discoveredAt:
            discovery
              .discoveredAt,

          durationMs:
            Date.now() -
            startedAt,

          summary:
            discovery.summary,

          inventory,

          relationships,
        });
    } catch (error) {
      console.error(
        "[kubernetes-discovery] synchronization failed:",
        error
      );

      return next(error);
    }
  }
);

module.exports =
  router;