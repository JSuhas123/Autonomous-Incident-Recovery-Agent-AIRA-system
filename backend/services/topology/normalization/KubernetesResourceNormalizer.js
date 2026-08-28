"use strict";

const {
  canonicalFingerprint,
} = require(
  "./CanonicalFingerprint"
);


class KubernetesResourceNormalizer {
  normalize(
    input = {}
  ) {
    const {
      organizationId,
      environmentId,
      integrationId,
      resource,
      observedAt =
        new Date(),
    } = input;


    if (
      !organizationId ||
      !environmentId ||
      !integrationId
    ) {
      throw normalizationError(
        "Kubernetes normalization scope is incomplete",
        "KUBERNETES_NORMALIZATION_SCOPE_REQUIRED"
      );
    }


    if (
      !resource ||
      typeof resource !==
        "object"
    ) {
      throw normalizationError(
        "Kubernetes resource is required",
        "KUBERNETES_NORMALIZATION_RESOURCE_REQUIRED"
      );
    }


    const kind =
      normalizeKind(
        resource.kind
      );


    const resourceType =
      mapResourceType(
        kind
      );


    const externalId =
      buildExternalId(
        integrationId,
        kind,
        resource
      );


    const health =
      mapHealth(
        kind,
        resource
      );


    const lifecycle =
      mapLifecycle(
        kind,
        resource
      );


    const configuration =
      resource.spec ||
      {};


    const runtime =
      resource.status ||
      {};


    const stateFingerprint =
      canonicalFingerprint({
        resourceType,

        health,

        lifecycle,

        configuration,

        runtime,

        version:
          extractVersion(
            kind,
            resource
          ),
      });


    return {
      resource: {
        organizationId,

        environmentId,

        provider:
          "kubernetes",

        resourceType,

        externalId,

        name:
          resource.name ||
          null,

        displayName:
          resource.name ||
          null,

        namespace:
          resource.namespace ||
          null,

        labels:
          resource.labels ||
          {},

        attributes: {
          integrationId:
            String(
              integrationId
            ),

          kubernetesKind:
            kind,

          kubernetesUid:
            resource.uid ||
            null,
        },

        metadata: {
          annotations:
            resource.annotations ||
            resource.metadata
              ?.annotations ||
            {},

          provider:
            "kubernetes",
        },

        status:
          resource.active ===
            false
            ? "INACTIVE"
            : "ACTIVE",

        discoveredAt:
          resource.discoveredAt ||
          observedAt,

        firstSeenAt:
          resource.discoveredAt ||
          observedAt,

        lastSeenAt:
          resource.lastSeenAt ||
          observedAt,
      },

      state: {
        organizationId,

        environmentId,

        observedAt,

        health,

        lifecycle,

        configuration,

        runtime,

        metrics:
          extractMetrics(
            kind,
            resource
          ),

        attributes: {
          provider:
            "kubernetes",

          kind,

          namespace:
            resource.namespace ||
            null,

          integrationId:
            String(
              integrationId
            ),
        },

        version:
          extractVersion(
            kind,
            resource
          ),

        fingerprint:
          stateFingerprint,

        source:
          `kubernetes:${String(
            integrationId
          )}`,

        evidence: {
          provider:
            "kubernetes",

          integrationId:
            String(
              integrationId
            ),

          externalId,

          observedFrom:
            "kubernetes-discovery",
        },

        metadata: {},
      },
    };
  }
}


function normalizeKind(
  value
) {
  const kind =
    String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();


  const supported =
    new Set([
      "namespace",
      "deployment",
      "replicaset",
      "pod",
      "service",
      "node",
    ]);


  if (
    !supported.has(
      kind
    )
  ) {
    throw normalizationError(
      `Unsupported Kubernetes resource kind: ${kind || "unknown"}`,
      "KUBERNETES_NORMALIZATION_KIND_UNSUPPORTED"
    );
  }


  return kind;
}


function mapResourceType(
  kind
) {
  return {
    namespace:
      "kubernetes.namespace",

    deployment:
      "kubernetes.deployment",

    replicaset:
      "kubernetes.replicaset",

    pod:
      "kubernetes.pod",

    service:
      "kubernetes.service",

    node:
      "kubernetes.node",
  }[kind];
}


function buildExternalId(
  integrationId,
  kind,
  resource
) {
  if (
    resource.uid
  ) {
    return [
      "kubernetes",
      String(
        integrationId
      ),
      String(
        resource.uid
      ),
    ].join(
      ":"
    );
  }


  return [
    "kubernetes",
    String(
      integrationId
    ),
    kind,
    resource.namespace ||
      "_cluster",
    resource.name ||
      "_unknown",
  ].join(
    ":"
  );
}


function mapHealth(
  kind,
  resource
) {
  const status =
    resource.status ||
    {};


  if (
    resource.active ===
    false
  ) {
    return "UNKNOWN";
  }


  if (
    kind ===
    "pod"
  ) {
    const serious =
      new Set([
        "CrashLoopBackOff",
        "ImagePullBackOff",
        "ErrImagePull",
        "OOMKilled",
        "Error",
        "CreateContainerError",
        "CreateContainerConfigError",
      ]);


    const failureSignals =
      status.failureSignals ||
      [];


    if (
      failureSignals.some(
        (signal) =>
          serious.has(
            signal?.reason
          )
      )
    ) {
      return "CRITICAL";
    }


    if (
      [
        "Failed",
        "Unknown",
      ].includes(
        status.phase
      )
    ) {
      return "UNHEALTHY";
    }


    if (
      status.phase ===
      "Running"
    ) {
      if (
        Number.isFinite(
          status.totalContainers
        ) &&
        status.totalContainers >
          0 &&
        status.readyContainers <
          status.totalContainers
      ) {
        return "DEGRADED";
      }


      return "HEALTHY";
    }


    if (
      status.phase ===
      "Pending"
    ) {
      return "DEGRADED";
    }
  }


  if (
    kind ===
    "deployment"
  ) {
    const desired =
      resource.spec
        ?.replicas ??
      0;

    const ready =
      status.readyReplicas ??
      0;

    const unavailable =
      status.unavailableReplicas ??
      0;


    if (
      desired >
        0 &&
      ready ===
        0
    ) {
      return "UNHEALTHY";
    }


    if (
      unavailable >
        0 ||
      ready <
        desired
    ) {
      return "DEGRADED";
    }


    return "HEALTHY";
  }


  if (
    kind ===
    "replicaset"
  ) {
    const desired =
      resource.spec
        ?.replicas ??
      status.replicas ??
      0;

    const ready =
      status.readyReplicas ??
      0;


    if (
      desired >
        0 &&
      ready ===
        0
    ) {
      return "UNHEALTHY";
    }


    return ready <
      desired
      ? "DEGRADED"
      : "HEALTHY";
  }


  if (
    kind ===
    "node"
  ) {
    const ready =
      (
        status.conditions ||
        []
      ).find(
        (condition) =>
          condition
            ?.type ===
          "Ready"
      );


    if (
      !ready
    ) {
      return "UNKNOWN";
    }


    return ready.status ===
      "True"
      ? "HEALTHY"
      : "UNHEALTHY";
  }


  if (
    kind ===
    "namespace"
  ) {
    return status.phase ===
      "Active"
      ? "HEALTHY"
      : "UNKNOWN";
  }


  if (
    kind ===
    "service"
  ) {
    return "HEALTHY";
  }


  return "UNKNOWN";
}


function mapLifecycle(
  kind,
  resource
) {
  if (
    resource.active ===
    false
  ) {
    return "DELETED";
  }


  const status =
    resource.status ||
    {};


  if (
    kind ===
    "pod"
  ) {
    switch (
      status.phase
    ) {
      case "Pending":
        return "STARTING";

      case "Running":
        return "RUNNING";

      case "Succeeded":
      case "Failed":
        return "TERMINATED";

      default:
        return "DISCOVERED";
    }
  }


  if (
    kind ===
    "namespace"
  ) {
    return status.phase ===
      "Active"
      ? "RUNNING"
      : "DISCOVERED";
  }


  return "RUNNING";
}


function extractVersion(
  kind,
  resource
) {
  if (
    kind ===
    "deployment"
  ) {
    return (
      resource.revision ||
      resource.metadata
        ?.revision ||
      null
    );
  }


  return (
    resource.resourceVersion ||
    resource.metadata
      ?.resourceVersion ||
    null
  );
}


function extractMetrics(
  kind,
  resource
) {
  if (
    kind ===
    "pod"
  ) {
    return {
      readyContainers:
        resource.status
          ?.readyContainers ??
        null,

      totalContainers:
        resource.status
          ?.totalContainers ??
        null,

      restartCount:
        resource.status
          ?.restartCount ??
        resource.status
          ?.totalRestarts ??
        null,
    };
  }


  if (
    kind ===
    "deployment"
  ) {
    return {
      desiredReplicas:
        resource.spec
          ?.replicas ??
        null,

      readyReplicas:
        resource.status
          ?.readyReplicas ??
        null,

      availableReplicas:
        resource.status
          ?.availableReplicas ??
        null,

      unavailableReplicas:
        resource.status
          ?.unavailableReplicas ??
        null,
    };
  }


  return {};
}


function normalizationError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}


module.exports =
  KubernetesResourceNormalizer;