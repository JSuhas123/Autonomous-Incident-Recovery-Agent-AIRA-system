"use strict";

/**
 * Kubernetes Knowledge Capability Matrix
 *
 * Phase 13.7
 *
 * Maps desired Kubernetes knowledge coverage against the deterministic
 * execution capabilities currently registered in AIRA.
 *
 * This module is READ ONLY.
 *
 * It does not:
 * - register handlers
 * - execute handlers
 * - modify Runbooks
 * - modify Playbooks
 * - activate knowledge
 */

const {
  getActionHandlerRegistry,
} =
  require(
    "../runbooks/actions/actionHandlerRegistry"
  );


// ============================================================================
// TARGET CAPABILITIES
// ============================================================================

const KUBERNETES_CAPABILITY_TARGETS =
  Object.freeze([
    // ------------------------------------------------------------------------
    // POD
    // ------------------------------------------------------------------------

    {
      domain:
        "pod",

      capability:
        "inspect-pod",

      type:
        "kubernetes",

      action:
        "get_pod",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-CRASHLOOP-001",
        "PB-K8S-POD-PENDING-001",
      ],
    },

    {
      domain:
        "pod",

      capability:
        "read-pod-logs",

      type:
        "kubernetes",

      action:
        "get_logs",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-CRASHLOOP-001",
      ],
    },

    {
      domain:
        "pod",

      capability:
        "read-events",

      type:
        "kubernetes",

      action:
        "get_events",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-CRASHLOOP-001",
        "PB-K8S-POD-PENDING-001",
      ],
    },

    {
      domain:
        "pod",

      capability:
        "verify-pod-ready",

      type:
        "kubernetes",

      action:
        "check_pod_ready",

      mode:
        "VERIFY",

      requiredFor: [
        "PB-K8S-CRASHLOOP-001",
      ],
    },


    // ------------------------------------------------------------------------
    // DEPLOYMENT
    // ------------------------------------------------------------------------

    {
      domain:
        "deployment",

      capability:
        "inspect-deployment",

      type:
        "kubernetes",

      action:
        "get_deployment",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-DEPLOYMENT-RESTART-001",
      ],
    },

    {
      domain:
        "deployment",

      capability:
        "inspect-deployment-status",

      type:
        "kubernetes",

      action:
        "get_deployment_status",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-DEPLOYMENT-RESTART-001",
      ],
    },

    {
      domain:
        "deployment",

      capability:
        "restart-deployment",

      type:
        "kubernetes",

      action:
        "restart_deployment",

      mode:
        "MUTATE",

      requiredFor: [
        "PB-K8S-DEPLOYMENT-RESTART-001",
      ],
    },

    {
      domain:
        "deployment",

      capability:
        "scale-deployment",

      type:
        "kubernetes",

      action:
        "scale_deployment",

      mode:
        "MUTATE",

      requiredFor: [
        "PB-K8S-HPA-SATURATION-001",
        "PB-K8S-CPU-THROTTLING-001",
      ],
    },


    // ------------------------------------------------------------------------
    // NODE
    // ------------------------------------------------------------------------

    {
      domain:
        "node",

      capability:
        "inspect-node",

      type:
        "kubernetes",

      action:
        "get_node",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-NODE-DEGRADED-001",
        "PB-K8S-DISK-PRESSURE-001",
      ],
    },

    {
      domain:
        "node",

      capability:
        "cordon-node",

      type:
        "kubernetes",

      action:
        "cordon_node",

      mode:
        "MUTATE",

      requiredFor: [
        "PB-K8S-NODE-NOTREADY-001",
      ],
    },


    // ------------------------------------------------------------------------
    // STORAGE
    // ------------------------------------------------------------------------

    {
      domain:
        "storage",

      capability:
        "inspect-pvc",

      type:
        "kubernetes",

      action:
        "get_pvc",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-PVC-PENDING-001",
      ],
    },

    {
      domain:
        "storage",

      capability:
        "verify-pvc-bound",

      type:
        "kubernetes",

      action:
        "check_pvc_bound",

      mode:
        "VERIFY",

      requiredFor: [
        "PB-K8S-PVC-PENDING-001",
      ],
    },


    // ------------------------------------------------------------------------
    // DNS
    // ------------------------------------------------------------------------

    {
      domain:
        "dns",

      capability:
        "inspect-dns",

      type:
        "kubernetes",

      action:
        "check_dns",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-DNS-FAILURE-001",
      ],
    },


    // ------------------------------------------------------------------------
    // SERVICE
    // ------------------------------------------------------------------------

    {
      domain:
        "service",

      capability:
        "inspect-service",

      type:
        "kubernetes",

      action:
        "get_service",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-SERVICE-ENDPOINT-FAILURE-001",
      ],
    },

    {
      domain:
        "service",

      capability:
        "inspect-service-endpoints",

      type:
        "kubernetes",

      action:
        "get_endpoints",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-SERVICE-ENDPOINT-FAILURE-001",
      ],
    },

    {
      domain:
        "service",

      capability:
        "verify-service-endpoints",

      type:
        "kubernetes",

      action:
        "check_service_endpoints",

      mode:
        "VERIFY",

      requiredFor: [
        "PB-K8S-SERVICE-ENDPOINT-FAILURE-001",
      ],
    },


    // ------------------------------------------------------------------------
    // INGRESS
    // ------------------------------------------------------------------------

    {
      domain:
        "ingress",

      capability:
        "inspect-ingress",

      type:
        "kubernetes",

      action:
        "get_ingress",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-INGRESS-FAILURE-001",
      ],
    },

    {
      domain:
        "ingress",

      capability:
        "verify-ingress",

      type:
        "kubernetes",

      action:
        "check_ingress",

      mode:
        "VERIFY",

      requiredFor: [
        "PB-K8S-INGRESS-FAILURE-001",
      ],
    },


    // ------------------------------------------------------------------------
    // RESOURCE / HPA
    // ------------------------------------------------------------------------

    {
      domain:
        "autoscaling",

      capability:
        "inspect-hpa",

      type:
        "kubernetes",

      action:
        "get_hpa",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-HPA-SATURATION-001",
      ],
    },

    {
      domain:
        "namespace",

      capability:
        "inspect-resource-quota",

      type:
        "kubernetes",

      action:
        "get_resource_quota",

      mode:
        "READ",

      requiredFor: [
        "PB-K8S-NAMESPACE-QUOTA-EXHAUSTION-001",
      ],
    },
  ]);


// ============================================================================
// BUILD MATRIX
// ============================================================================

function buildKubernetesCapabilityMatrix(
  options = {}
) {
  const registry =
    options.registry ||
    getActionHandlerRegistry();

  const capabilities =
    KUBERNETES_CAPABILITY_TARGETS
      .map(
        (
          target
        ) => {
          const available =
            registry.has(
              target.type,
              target.action
            );

          return {
            ...target,

            handlerKey:
              `${target.type}/${target.action}`,

            available,
          };
        }
      );

  const available =
    capabilities
      .filter(
        (
          capability
        ) =>
          capability.available
      );

  const missing =
    capabilities
      .filter(
        (
          capability
        ) =>
          !capability.available
      );

  const byDomain =
    {};

  for (
    const capability
    of capabilities
  ) {
    if (
      !byDomain[
        capability.domain
      ]
    ) {
      byDomain[
        capability.domain
      ] = {
        total: 0,
        available: 0,
        missing: 0,
      };
    }

    byDomain[
      capability.domain
    ].total += 1;

    if (
      capability.available
    ) {
      byDomain[
        capability.domain
      ].available += 1;
    } else {
      byDomain[
        capability.domain
      ].missing += 1;
    }
  }

  return {
    schemaVersion:
      "13.7-kubernetes-capability-matrix-v1",

    generatedAt:
      new Date()
        .toISOString(),

    counts: {
      total:
        capabilities.length,

      available:
        available.length,

      missing:
        missing.length,
    },

    capabilities,

    available,

    missing,

    byDomain,
  };
}


module.exports = {
  KUBERNETES_CAPABILITY_TARGETS,
  buildKubernetesCapabilityMatrix,
};