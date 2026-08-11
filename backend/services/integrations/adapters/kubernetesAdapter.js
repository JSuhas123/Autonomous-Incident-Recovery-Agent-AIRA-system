"use strict";

const k8s = require("@kubernetes/client-node");

const {
  UnsupportedOperationError,
} = require("../adapterInterface");

const PROVIDER = "kubernetes";

/**
 * Kubernetes Integration Adapter
 *
 * Phase 2 scope:
 * - Validate connection configuration
 * - Test cluster connectivity
 * - Read-only health access
 *
 * NO mutation/execution is exposed through this adapter.
 */

async function validateConfiguration(config = {}) {
  const errors = [];

  const authMode = config.authMode || "kubeconfig";

  if (!["kubeconfig", "in_cluster"].includes(authMode)) {
    errors.push(
      'authMode must be either "kubeconfig" or "in_cluster"'
    );
  }

  if (
    config.allowedNamespaces &&
    !Array.isArray(config.allowedNamespaces)
  ) {
    errors.push(
      "allowedNamespaces must be an array"
    );
  }

  if (
    Array.isArray(config.allowedNamespaces) &&
    config.allowedNamespaces.some(
      (ns) =>
        typeof ns !== "string" ||
        !ns.trim()
    )
  ) {
    errors.push(
      "allowedNamespaces entries must be non-empty strings"
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build a KubeConfig specifically for this integration connection.
 *
 * Important:
 * Do NOT use the global singleton K8s client here.
 * Every tenant integration needs isolated credentials/configuration.
 */
function buildKubeConfig(connection) {
  const kc = new k8s.KubeConfig();

  const config =
    connection.nonSecretConfig || {};

  const authMode =
    config.authMode || "kubeconfig";

  if (authMode === "in_cluster") {
    kc.loadFromCluster();
    return kc;
  }

  const rawKubeconfig =
    connection._decryptedSecret;

  if (
    !rawKubeconfig ||
    typeof rawKubeconfig !== "string"
  ) {
    throw new Error(
      "Kubernetes kubeconfig secret is missing"
    );
  }

  kc.loadFromString(
    rawKubeconfig
  );

  return kc;
}

async function testConnection(connection) {
  const startedAt = Date.now();

  try {
    const kc =
      buildKubeConfig(connection);

    const versionApi =
      kc.makeApiClient(
        k8s.VersionApi
      );

    const version =
      await versionApi.getCode();

    return {
      success: true,
      latencyMs:
        Date.now() - startedAt,
      detail:
        `Connected to Kubernetes ${version.gitVersion}`,
      version:
        version.gitVersion,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs:
        Date.now() - startedAt,
      detail:
        error.message,
    };
  }
}

async function getHealth(connection) {
  const result =
    await testConnection(
      connection
    );

  return {
    status:
      result.success
        ? "healthy"
        : "unhealthy",

    detail:
      result.detail,
  };
}

/**
 * Kubernetes events will be added later in Phase 2.
 * For now we fail closed.
 */
async function receiveEvent() {
  throw new UnsupportedOperationError(
    PROVIDER,
    "receiveEvent"
  );
}

function normalizeEvent() {
  throw new UnsupportedOperationError(
    PROVIDER,
    "normalizeEvent"
  );
}

async function sendNotification() {
  throw new UnsupportedOperationError(
    PROVIDER,
    "sendNotification"
  );
}

async function revoke() {
  // There is no remote credential to revoke from AIRA.
  // Connection disable/delete already removes AIRA access.
  return;
}

module.exports = {
  validateConfiguration,
  testConnection,
  getHealth,
  receiveEvent,
  normalizeEvent,
  sendNotification,
  revoke,

  // Exported for discovery service reuse later.
  buildKubeConfig,
};