"use strict";

const k8s = require("@kubernetes/client-node");

const {
  buildKubeConfig,
} = require("../integrations/adapters/kubernetesAdapter");

/**
 * Kubernetes Discovery Service
 *
 * Phase 2E:
 *
 * READ-ONLY cluster discovery:
 * - Namespaces
 * - Deployments
 * - ReplicaSets
 * - Pods
 * - Kubernetes Services
 * - Nodes
 *
 * Rich investigation context:
 * - ownerReferences
 * - deployment revisions
 * - deployment rollout strategy
 * - pod conditions
 * - container states
 * - previous container states
 * - CrashLoopBackOff reasons
 * - OOMKilled reasons
 * - image pull failures
 * - restart counts
 *
 * SECURITY:
 * - No Kubernetes mutation is exposed here.
 * - Every client is created from one tenant-scoped integration.
 * - allowedNamespaces is enforced for namespaced resources.
 */

class KubernetesDiscoveryService {
  // ───────────────────────────────────────────────────────────────────────────
  // Kubernetes API clients
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Build Kubernetes API clients from one tenant-scoped integration.
   */
  _buildClients(connection) {
    const kc =
      buildKubeConfig(
        connection
      );

    return {
      coreApi:
        kc.makeApiClient(
          k8s.CoreV1Api
        ),

      appsApi:
        kc.makeApiClient(
          k8s.AppsV1Api
        ),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Namespaces
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Return namespaces visible to the supplied integration.
   *
   * If allowedNamespaces is configured, only those namespaces
   * are returned.
   */
  async discoverNamespaces(
    connection
  ) {
    const {
      coreApi,
    } =
      this._buildClients(
        connection
      );

    const response =
      await coreApi.listNamespace();

    const namespaces =
      response.items || [];

    const allowedNamespaces =
      connection.nonSecretConfig
        ?.allowedNamespaces || [];

    const filtered =
      allowedNamespaces.length > 0
        ? namespaces.filter(
            (namespace) =>
              allowedNamespaces.includes(
                namespace.metadata
                  ?.name
              )
          )
        : namespaces;

    return filtered.map(
      (namespace) => ({
        name:
          namespace.metadata
            ?.name ||
          null,

        uid:
          namespace.metadata
            ?.uid ||
          null,

        phase:
          namespace.status
            ?.phase ||
          null,

        labels:
          namespace.metadata
            ?.labels ||
          {},

        annotations:
          namespace.metadata
            ?.annotations ||
          {},

        createdAt:
          namespace.metadata
            ?.creationTimestamp ||
          null,
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Deployments
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Discover deployments.
   *
   * Includes:
   * - revision
   * - owner references
   * - rollout strategy
   * - replica health
   * - images/resources
   */
  async discoverDeployments(
    connection,
    namespace = null
  ) {
    const {
      appsApi,
    } =
      this._buildClients(
        connection
      );

    const namespaces =
      await this._resolveTargetNamespaces(
        connection,
        namespace
      );

    const deployments = [];

    for (
      const ns
      of namespaces
    ) {
      const response =
        await appsApi
          .listNamespacedDeployment({
            namespace: ns,
          });

      for (
        const deployment
        of response.items || []
      ) {
        deployments.push({
          name:
            deployment.metadata
              ?.name ||
            null,

          namespace:
            deployment.metadata
              ?.namespace ||
            ns,

          uid:
            deployment.metadata
              ?.uid ||
            null,

          labels:
            deployment.metadata
              ?.labels ||
            {},

          annotations:
            deployment.metadata
              ?.annotations ||
            {},

          ownerReferences:
            this._normaliseOwnerReferences(
              deployment.metadata
                ?.ownerReferences
            ),

          revision:
            deployment.metadata
              ?.annotations?.[
                "deployment.kubernetes.io/revision"
              ] ||
            null,

          replicas:
            deployment.spec
              ?.replicas ??
            0,

          readyReplicas:
            deployment.status
              ?.readyReplicas ??
            0,

          availableReplicas:
            deployment.status
              ?.availableReplicas ??
            0,

          unavailableReplicas:
            deployment.status
              ?.unavailableReplicas ??
            0,

          updatedReplicas:
            deployment.status
              ?.updatedReplicas ??
            0,

          observedGeneration:
            deployment.status
              ?.observedGeneration ??
            null,

          selector:
            deployment.spec
              ?.selector
              ?.matchLabels ||
            {},

          strategy: {
            type:
              deployment.spec
                ?.strategy
                ?.type ||
              null,

            rollingUpdate:
              deployment.spec
                ?.strategy
                ?.rollingUpdate ||
              null,
          },

          containers:
            (
              deployment.spec
                ?.template
                ?.spec
                ?.containers ||
              []
            ).map(
              (container) => ({
                name:
                  container.name,

                image:
                  container.image,

                imagePullPolicy:
                  container
                    .imagePullPolicy ||
                  null,

                ports:
                  container.ports ||
                  [],

                resources:
                  container.resources ||
                  {},

                envCount:
                  Array.isArray(
                    container.env
                  )
                    ? container.env.length
                    : 0,

                readinessProbe:
                  container
                    .readinessProbe
                    ? true
                    : false,

                livenessProbe:
                  container
                    .livenessProbe
                    ? true
                    : false,

                startupProbe:
                  container
                    .startupProbe
                    ? true
                    : false,
              })
            ),

          conditions:
            (
              deployment.status
                ?.conditions ||
              []
            ).map(
              (condition) =>
                this._normaliseCondition(
                  condition
                )
            ),

          createdAt:
            deployment.metadata
              ?.creationTimestamp ||
            null,
        });
      }
    }

    return deployments;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ReplicaSets
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Discover ReplicaSets.
   *
   * ReplicaSets are essential for authoritative ownership:
   *
   * Deployment
   *      ↓ ownerReference
   * ReplicaSet
   *      ↓ ownerReference
   * Pod
   */
  async discoverReplicaSets(
    connection,
    namespace = null
  ) {
    const {
      appsApi,
    } =
      this._buildClients(
        connection
      );

    const namespaces =
      await this._resolveTargetNamespaces(
        connection,
        namespace
      );

    const replicaSets = [];

    for (
      const ns
      of namespaces
    ) {
      const response =
        await appsApi
          .listNamespacedReplicaSet({
            namespace: ns,
          });

      for (
        const replicaSet
        of response.items || []
      ) {
        replicaSets.push({
          name:
            replicaSet.metadata
              ?.name ||
            null,

          namespace:
            replicaSet.metadata
              ?.namespace ||
            ns,

          uid:
            replicaSet.metadata
              ?.uid ||
            null,

          labels:
            replicaSet.metadata
              ?.labels ||
            {},

          annotations:
            replicaSet.metadata
              ?.annotations ||
            {},

          ownerReferences:
            this._normaliseOwnerReferences(
              replicaSet.metadata
                ?.ownerReferences
            ),

          revision:
            replicaSet.metadata
              ?.annotations?.[
                "deployment.kubernetes.io/revision"
              ] ||
            null,

          replicas:
            replicaSet.spec
              ?.replicas ??
            0,

          fullyLabeledReplicas:
            replicaSet.status
              ?.fullyLabeledReplicas ??
            0,

          readyReplicas:
            replicaSet.status
              ?.readyReplicas ??
            0,

          availableReplicas:
            replicaSet.status
              ?.availableReplicas ??
            0,

          selector:
            replicaSet.spec
              ?.selector
              ?.matchLabels ||
            {},

          containers:
            (
              replicaSet.spec
                ?.template
                ?.spec
                ?.containers ||
              []
            ).map(
              (container) => ({
                name:
                  container.name,

                image:
                  container.image,

                imagePullPolicy:
                  container
                    .imagePullPolicy ||
                  null,

                resources:
                  container.resources ||
                  {},
              })
            ),

          createdAt:
            replicaSet.metadata
              ?.creationTimestamp ||
            null,
        });
      }
    }

    return replicaSets;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pods
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Discover pods with rich incident investigation state.
   *
   * Important examples surfaced here:
   *
   * CrashLoopBackOff
   * ImagePullBackOff
   * ErrImagePull
   * OOMKilled
   * Error
   * Completed
   * ContainerCreating
   */
  async discoverPods(
    connection,
    namespace = null
  ) {
    const {
      coreApi,
    } =
      this._buildClients(
        connection
      );

    const namespaces =
      await this._resolveTargetNamespaces(
        connection,
        namespace
      );

    const pods = [];

    for (
      const ns
      of namespaces
    ) {
      const response =
        await coreApi
          .listNamespacedPod({
            namespace: ns,
          });

      for (
        const pod
        of response.items || []
      ) {
        const containerStatuses =
          pod.status
            ?.containerStatuses ||
          [];

        const initContainerStatuses =
          pod.status
            ?.initContainerStatuses ||
          [];

        pods.push({
          name:
            pod.metadata
              ?.name ||
            null,

          namespace:
            pod.metadata
              ?.namespace ||
            ns,

          uid:
            pod.metadata
              ?.uid ||
            null,

          labels:
            pod.metadata
              ?.labels ||
            {},

          annotations:
            pod.metadata
              ?.annotations ||
            {},

          ownerReferences:
            this._normaliseOwnerReferences(
              pod.metadata
                ?.ownerReferences
            ),

          nodeName:
            pod.spec
              ?.nodeName ||
            null,

          serviceAccountName:
            pod.spec
              ?.serviceAccountName ||
            null,

          restartPolicy:
            pod.spec
              ?.restartPolicy ||
            null,

          phase:
            pod.status
              ?.phase ||
            null,

          reason:
            pod.status
              ?.reason ||
            null,

          message:
            pod.status
              ?.message ||
            null,

          qosClass:
            pod.status
              ?.qosClass ||
            null,

          podIP:
            pod.status
              ?.podIP ||
            null,

          hostIP:
            pod.status
              ?.hostIP ||
            null,

          startTime:
            pod.status
              ?.startTime ||
            null,

          conditions:
            (
              pod.status
                ?.conditions ||
              []
            ).map(
              (condition) =>
                this._normaliseCondition(
                  condition
                )
            ),

          restartCount:
            containerStatuses
              .reduce(
                (
                  total,
                  container
                ) =>
                  total +
                  (
                    container
                      .restartCount ||
                    0
                  ),
                0
              ),

          readyContainers:
            containerStatuses
              .filter(
                (container) =>
                  container.ready
              )
              .length,

          totalContainers:
            containerStatuses.length,

          containers:
            containerStatuses.map(
              (container) => ({
                name:
                  container.name,

                image:
                  container.image,

                imageID:
                  container.imageID ||
                  null,

                containerID:
                  container.containerID ||
                  null,

                ready:
                  Boolean(
                    container.ready
                  ),

                started:
                  container.started ??
                  null,

                restartCount:
                  container
                    .restartCount ??
                  0,

                state:
                  this._normaliseContainerState(
                    container.state
                  ),

                lastState:
                  this._normaliseContainerState(
                    container.lastState
                  ),
              })
            ),

          initContainers:
            initContainerStatuses.map(
              (container) => ({
                name:
                  container.name,

                image:
                  container.image,

                imageID:
                  container.imageID ||
                  null,

                ready:
                  Boolean(
                    container.ready
                  ),

                restartCount:
                  container
                    .restartCount ??
                  0,

                state:
                  this._normaliseContainerState(
                    container.state
                  ),

                lastState:
                  this._normaliseContainerState(
                    container.lastState
                  ),
              })
            ),

          /**
           * Incident-friendly summary so InvestigationAgent
           * does not need to manually inspect every container.
           */
          failureSignals:
            this._extractPodFailureSignals(
              pod
            ),

          createdAt:
            pod.metadata
              ?.creationTimestamp ||
            null,
        });
      }
    }

    return pods;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Kubernetes Services
  // ───────────────────────────────────────────────────────────────────────────

  async discoverServices(
    connection,
    namespace = null
  ) {
    const {
      coreApi,
    } =
      this._buildClients(
        connection
      );

    const namespaces =
      await this._resolveTargetNamespaces(
        connection,
        namespace
      );

    const services = [];

    for (
      const ns
      of namespaces
    ) {
      const response =
        await coreApi
          .listNamespacedService({
            namespace: ns,
          });

      for (
        const service
        of response.items || []
      ) {
        services.push({
          name:
            service.metadata
              ?.name ||
            null,

          namespace:
            service.metadata
              ?.namespace ||
            ns,

          uid:
            service.metadata
              ?.uid ||
            null,

          labels:
            service.metadata
              ?.labels ||
            {},

          annotations:
            service.metadata
              ?.annotations ||
            {},

          ownerReferences:
            this._normaliseOwnerReferences(
              service.metadata
                ?.ownerReferences
            ),

          type:
            service.spec
              ?.type ||
            null,

          clusterIP:
            service.spec
              ?.clusterIP ||
            null,

          clusterIPs:
            service.spec
              ?.clusterIPs ||
            [],

          externalIPs:
            service.spec
              ?.externalIPs ||
            [],

          externalName:
            service.spec
              ?.externalName ||
            null,

          selector:
            service.spec
              ?.selector ||
            {},

          ports:
            (
              service.spec
                ?.ports ||
              []
            ).map(
              (port) => ({
                name:
                  port.name ||
                  null,

                protocol:
                  port.protocol ||
                  null,

                port:
                  port.port,

                targetPort:
                  port.targetPort,

                nodePort:
                  port.nodePort ??
                  null,
              })
            ),

          createdAt:
            service.metadata
              ?.creationTimestamp ||
            null,
        });
      }
    }

    return services;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Nodes
  // ───────────────────────────────────────────────────────────────────────────

  async discoverNodes(
    connection
  ) {
    const {
      coreApi,
    } =
      this._buildClients(
        connection
      );

    const response =
      await coreApi.listNode();

    return (
      response.items || []
    ).map(
      (node) => ({
        name:
          node.metadata
            ?.name ||
          null,

        uid:
          node.metadata
            ?.uid ||
          null,

        labels:
          node.metadata
            ?.labels ||
          {},

        annotations:
          node.metadata
            ?.annotations ||
          {},

        unschedulable:
          Boolean(
            node.spec
              ?.unschedulable
          ),

        taints:
          node.spec
            ?.taints ||
          [],

        capacity:
          node.status
            ?.capacity ||
          {},

        allocatable:
          node.status
            ?.allocatable ||
          {},

        conditions:
          (
            node.status
              ?.conditions ||
            []
          ).map(
            (condition) =>
              this._normaliseCondition(
                condition
              )
          ),

        addresses:
          node.status
            ?.addresses ||
          [],

        kubeletVersion:
          node.status
            ?.nodeInfo
            ?.kubeletVersion ||
          null,

        kubeProxyVersion:
          node.status
            ?.nodeInfo
            ?.kubeProxyVersion ||
          null,

        containerRuntimeVersion:
          node.status
            ?.nodeInfo
            ?.containerRuntimeVersion ||
          null,

        kernelVersion:
          node.status
            ?.nodeInfo
            ?.kernelVersion ||
          null,

        osImage:
          node.status
            ?.nodeInfo
            ?.osImage ||
          null,

        operatingSystem:
          node.status
            ?.nodeInfo
            ?.operatingSystem ||
          null,

        architecture:
          node.status
            ?.nodeInfo
            ?.architecture ||
          null,

        createdAt:
          node.metadata
            ?.creationTimestamp ||
          null,
      })
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Full cluster discovery
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Discover everything Phase 2 currently supports.
   */
  async discoverCluster(
    connection
  ) {
    const [
      namespaces,
      deployments,
      replicaSets,
      pods,
      services,
      nodes,
    ] =
      await Promise.all([
        this.discoverNamespaces(
          connection
        ),

        this.discoverDeployments(
          connection
        ),

        this.discoverReplicaSets(
          connection
        ),

        this.discoverPods(
          connection
        ),

        this.discoverServices(
          connection
        ),

        this.discoverNodes(
          connection
        ),
      ]);

    return {
      discoveredAt:
        new Date()
          .toISOString(),

      namespaces,

      deployments,

      replicaSets,

      pods,

      services,

      nodes,

      summary: {
        namespaces:
          namespaces.length,

        deployments:
          deployments.length,

        replicaSets:
          replicaSets.length,

        pods:
          pods.length,

        services:
          services.length,

        nodes:
          nodes.length,

        unhealthyPods:
          pods.filter(
            (pod) =>
              this._podLooksUnhealthy(
                pod
              )
          ).length,

        unhealthyNodes:
          nodes.filter(
            (node) =>
              this._nodeLooksUnhealthy(
                node
              )
          ).length,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Namespace policy enforcement
  // ───────────────────────────────────────────────────────────────────────────

  async _resolveTargetNamespaces(
    connection,
    requestedNamespace
  ) {
    const allowedNamespaces =
      connection.nonSecretConfig
        ?.allowedNamespaces ||
      [];

    if (
      requestedNamespace
    ) {
      if (
        allowedNamespaces.length >
          0 &&
        !allowedNamespaces.includes(
          requestedNamespace
        )
      ) {
        throw new Error(
          `Namespace "${requestedNamespace}" is not allowed for this integration`
        );
      }

      return [
        requestedNamespace,
      ];
    }

    if (
      allowedNamespaces.length >
      0
    ) {
      return allowedNamespaces;
    }

    const discovered =
      await this.discoverNamespaces(
        connection
      );

    return discovered
      .map(
        (namespace) =>
          namespace.name
      )
      .filter(Boolean);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Kubernetes normalization helpers
  // ───────────────────────────────────────────────────────────────────────────

  _normaliseOwnerReferences(
    references = []
  ) {
    if (
      !Array.isArray(
        references
      )
    ) {
      return [];
    }

    return references.map(
      (reference) => ({
        apiVersion:
          reference.apiVersion ||
          null,

        kind:
          reference.kind ||
          null,

        name:
          reference.name ||
          null,

        uid:
          reference.uid ||
          null,

        controller:
          Boolean(
            reference.controller
          ),

        blockOwnerDeletion:
          Boolean(
            reference
              .blockOwnerDeletion
          ),
      })
    );
  }

  _normaliseContainerState(
    state
  ) {
    if (!state) {
      return null;
    }

    if (
      state.waiting
    ) {
      return {
        type:
          "waiting",

        reason:
          state.waiting
            .reason ||
          null,

        message:
          state.waiting
            .message ||
          null,
      };
    }

    if (
      state.running
    ) {
      return {
        type:
          "running",

        startedAt:
          state.running
            .startedAt ||
          null,
      };
    }

    if (
      state.terminated
    ) {
      return {
        type:
          "terminated",

        reason:
          state.terminated
            .reason ||
          null,

        message:
          state.terminated
            .message ||
          null,

        exitCode:
          state.terminated
            .exitCode ??
          null,

        signal:
          state.terminated
            .signal ??
          null,

        containerID:
          state.terminated
            .containerID ||
          null,

        startedAt:
          state.terminated
            .startedAt ||
          null,

        finishedAt:
          state.terminated
            .finishedAt ||
          null,
      };
    }

    return null;
  }

  _normaliseCondition(
    condition
  ) {
    if (!condition) {
      return null;
    }

    return {
      type:
        condition.type ||
        null,

      status:
        condition.status ||
        null,

      reason:
        condition.reason ||
        null,

      message:
        condition.message ||
        null,

      lastHeartbeatTime:
        condition
          .lastHeartbeatTime ||
        null,

      lastTransitionTime:
        condition
          .lastTransitionTime ||
        null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Incident-oriented helpers
  // ───────────────────────────────────────────────────────────────────────────

  _extractPodFailureSignals(
    pod
  ) {
    const signals = [];

    const allStatuses = [
      ...(
        pod.status
          ?.initContainerStatuses ||
        []
      ),
      ...(
        pod.status
          ?.containerStatuses ||
        []
      ),
    ];

    for (
      const container
      of allStatuses
    ) {
      if (
        container.state
          ?.waiting
          ?.reason
      ) {
        signals.push({
          container:
            container.name,

          type:
            "waiting",

          reason:
            container.state
              .waiting
              .reason,

          message:
            container.state
              .waiting
              .message ||
            null,
        });
      }

      if (
        container.state
          ?.terminated
          ?.reason
      ) {
        signals.push({
          container:
            container.name,

          type:
            "terminated",

          reason:
            container.state
              .terminated
              .reason,

          exitCode:
            container.state
              .terminated
              .exitCode ??
            null,
        });
      }

      if (
        container.lastState
          ?.terminated
          ?.reason
      ) {
        signals.push({
          container:
            container.name,

          type:
            "previous_termination",

          reason:
            container.lastState
              .terminated
              .reason,

          exitCode:
            container.lastState
              .terminated
              .exitCode ??
            null,

          finishedAt:
            container.lastState
              .terminated
              .finishedAt ||
            null,
        });
      }

      if (
        (
          container.restartCount ||
          0
        ) > 0
      ) {
        signals.push({
          container:
            container.name,

          type:
            "restart_count",

          count:
            container.restartCount,
        });
      }
    }

    if (
      pod.status?.reason
    ) {
      signals.push({
        type:
          "pod_reason",

        reason:
          pod.status.reason,

        message:
          pod.status
            ?.message ||
          null,
      });
    }

    return signals;
  }

  _podLooksUnhealthy(
    pod
  ) {
    if (
      [
        "Failed",
        "Unknown",
      ].includes(
        pod.phase
      )
    ) {
      return true;
    }

    if (
      pod.failureSignals
        ?.length > 0
    ) {
      const seriousReasons =
        new Set([
          "CrashLoopBackOff",
          "ImagePullBackOff",
          "ErrImagePull",
          "OOMKilled",
          "Error",
          "CreateContainerConfigError",
          "CreateContainerError",
          "RunContainerError",
        ]);

      if (
        pod.failureSignals.some(
          (signal) =>
            seriousReasons.has(
              signal.reason
            )
        )
      ) {
        return true;
      }
    }

    const readyCondition =
      pod.conditions?.find(
        (condition) =>
          condition?.type ===
          "Ready"
      );

    return (
      readyCondition &&
      readyCondition.status !==
        "True"
    );
  }

  _nodeLooksUnhealthy(
    node
  ) {
    const readyCondition =
      node.conditions?.find(
        (condition) =>
          condition?.type ===
          "Ready"
      );

    if (
      !readyCondition
    ) {
      return true;
    }

    return (
      readyCondition.status !==
      "True"
    );
  }
}

module.exports =
  new KubernetesDiscoveryService();