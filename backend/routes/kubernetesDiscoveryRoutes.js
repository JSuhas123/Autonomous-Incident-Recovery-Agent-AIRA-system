"use strict";

const express = require("express");

const router =
  express.Router({
    mergeParams: true,
  });

const IntegrationConnection =
  require(
    "../models/IntegrationConnection"
  );

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

/**
 * Resolve an active tenant-owned Kubernetes integration
 * and decrypt its secret only for the duration of the request.
 */
async function _getKubernetesConnection(
  tenantId,
  connectionId
) {
  const connection =
    await IntegrationConnection.findOne({
      _id:
        connectionId,

      tenantId,

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

  const decryptedSecret =
    await secretStorage.getSecret(
      connection
    );

  connection._decryptedSecret =
    decryptedSecret;

  return connection;
}

router.get(
  "/:connectionId/discovery",
  async (
    req,
    res
  ) => {
    try {
      const tenantId =
        req.auth?.tenantId ||
        req.tenant?.id;

      if (!tenantId) {
        return res
          .status(401)
          .json({
            error:
              "Unauthorized",
          });
      }

      const connection =
        await _getKubernetesConnection(
          tenantId,
          req.params
            .connectionId
        );

      if (!connection) {
        return res
          .status(404)
          .json({
            error:
              "Kubernetes integration not found",
          });
      }

      const discovery =
        await kubernetesDiscoveryService
          .discoverCluster(
            connection
          );

      return res.json({
        connectionId:
          connection._id,

        provider:
          "kubernetes",

        ...discovery,
      });
    } catch (error) {
      console.error(
        "[kubernetes-discovery] discovery failed:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Kubernetes discovery failed",

          details:
            error.message,
        });
    }
  }
);

module.exports =router;