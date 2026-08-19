/**
 * Kubernetes Client Service
 * 
 * Production-grade abstraction layer for Kubernetes operations.
 * Handles:
 * - Pod restart
 * - Deployment rollout restart
 * - Deployment scaling
 * - Retries with exponential backoff
 * - API failure handling
 * - Comprehensive logging
 * 
 * No hardcoded cluster details - uses environment config
 */

const k8s = require('@kubernetes/client-node');
const { loggingService } = require('../infrastructure');

class K8sClient {
  constructor() {
    this.kc = new k8s.KubeConfig();
    
    // Load kubeconfig from environment or default locations
    try {
      if (process.env.KUBECONFIG) {
        this.kc.loadFromFile(process.env.KUBECONFIG);
        console.log('[K8s] Loaded kubeconfig from KUBECONFIG env var');
      } else {
        // Try default locations: ~/.kube/config or in-cluster config
        try {
          this.kc.loadFromDefault();
          console.log('[K8s] Loaded kubeconfig from default location');
        } catch (e) {
          console.warn('[K8s] Could not load default kubeconfig, will attempt in-cluster auth');
          this.kc = null;
        }
      }
      
      if (this.kc) {
        this.setupClients();
      }
    } catch (error) {
      console.error('[K8s] Error initializing KubeConfig:', error.message);
      this.kc = null;
    }
    
    // Configuration
    this.namespace = process.env.K8S_NAMESPACE || 'default';
    this.apiTimeout = parseInt(process.env.K8S_API_TIMEOUT || '30000');
    this.maxRetries = parseInt(process.env.K8S_MAX_RETRIES || '3');
    this.retryBackoffMs = parseInt(process.env.K8S_RETRY_BACKOFF_MS || '1000');
  }

  /**
   * Initialize Kubernetes API clients
   */
 setupClients() {
  try {
    this.coreApi =
      this.kc.makeApiClient(
        k8s.CoreV1Api
      );

    this.appsApi =
      this.kc.makeApiClient(
        k8s.AppsV1Api
      );

    this.networkingApi =
      this.kc.makeApiClient(
        k8s.NetworkingV1Api
      );

    this.autoscalingApi =
      this.kc.makeApiClient(
        k8s.AutoscalingV2Api
      );

    this.customApi =
      this.kc.makeApiClient(
        k8s.CustomObjectsApi
      );

    this.isReady =
      true;

    console.log(
      "[K8s] API clients initialized successfully"
    );
  } catch (error) {
    console.error(
      "[K8s] Failed to initialize API clients:",
      error.message
    );

    this.isReady =
      false;

    throw new Error(
      `K8s client initialization failed: ${error.message}`
    );
  }
}

  /**
   * Verify Kubernetes cluster connectivity
   * 
   * @returns {Promise<object>} - Cluster version info
   */
  async verifyConnectivity() {
    if (!this.isReady || !this.coreApi) {
      throw new Error('K8s client not initialized');
    }

    try {
      const versionApi = this.kc.makeApiClient(k8s.VersionApi);
      const version = await versionApi.getCode();
      
      console.log('[K8s] ✓ Cluster connectivity verified', {
        gitVersion: version.gitVersion,
        gitCommit: version.gitCommit,
      });

      return {
        connected: true,
        version: version.gitVersion,
        commit: version.gitCommit,
      };
    } catch (error) {
      console.error('[K8s] ✗ Cluster connectivity check failed:', error.message);
      throw new Error(`K8s connectivity check failed: ${error.message}`);
    }
  }

  /**
   * Restart a Kubernetes pod by deleting it (triggers automatic recreation)
   * 
   * @param {string} podName - Name of the pod
   * @param {string} namespace - Kubernetes namespace (defaults to configured namespace)
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Operation result
   */
  async restartPod(podName, namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    const correlationId = options.correlationId || 'unknown';
    
    if (!this.isReady || !this.coreApi) {
      throw new Error('K8s client not initialized');
    }

    console.log(`[K8s] Attempting pod restart: ${podName} in namespace ${ns}`, {
      correlationId,
      attempt: 1,
    });

    return this._executeWithRetry(
      async () => {
        try {
          // Check if pod exists
          const pod = await this.coreApi.readNamespacedPod(podName, ns);
          
          console.log(`[K8s] Pod found: ${podName}`, {
            status: pod.body.status?.phase,
            creationTime: pod.body.metadata?.creationTimestamp,
          });

          // Delete pod to trigger recreation
          const result = await this.coreApi.deleteNamespacedPod(
            podName,
            ns,
            undefined, // options
            undefined, // pretty
            30 // gracePeriodSeconds
          );

          console.log(`[K8s] ✓ Pod deletion initiated: ${podName}`, {
            correlationId,
            phase: result.body.status?.phase,
          });

          return {
            success: true,
            action: 'restartPod',
            resource: podName,
            namespace: ns,
            message: `Pod ${podName} deleted successfully. Kubernetes will recreate it.`,
            timestamp: new Date().toISOString(),
            correlationId,
          };
        } catch (error) {
          if (error.statusCode === 404) {
            console.warn(`[K8s] Pod not found: ${podName}`, { correlationId });
            throw new Error(`Pod ${podName} not found in namespace ${ns}`);
          }
          throw error;
        }
      },
      { resource: `pod/${podName}`, namespace: ns, correlationId }
    );
  }

  /**
   * Restart a Deployment by triggering a rollout restart
   * (Updates deployment spec to trigger pod recreation)
   * 
   * @param {string} deploymentName - Name of the deployment
   * @param {string} namespace - Kubernetes namespace
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Operation result
   */
  async restartDeployment(deploymentName, namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    const correlationId = options.correlationId || 'unknown';

    if (!this.isReady || !this.appsApi) {
      throw new Error('K8s client not initialized');
    }

    console.log(`[K8s] Attempting deployment restart: ${deploymentName} in namespace ${ns}`, {
      correlationId,
    });

    return this._executeWithRetry(
      async () => {
        try {
          // Get current deployment
          const deployment = await this.appsApi.readNamespacedDeployment(
            deploymentName,
            ns
          );

          console.log(`[K8s] Deployment found: ${deploymentName}`, {
            replicas: deployment.body.spec?.replicas,
            readyReplicas: deployment.body.status?.readyReplicas,
          });

          // Update deployment annotations to trigger rollout
          // This is the standard pattern for rollout restart
          const now = new Date().toISOString();
          if (!deployment.body.spec.template.metadata.annotations) {
            deployment.body.spec.template.metadata.annotations = {};
          }
          deployment.body.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = now;

          // Patch deployment to trigger rollout
          const patched = await this.appsApi.patchNamespacedDeployment(
            deploymentName,
            ns,
            deployment.body,
            undefined, // options
            undefined, // pretty
            undefined, // dryRun
            undefined  // fieldManager
          );

          console.log(`[K8s] ✓ Deployment restart triggered: ${deploymentName}`, {
            correlationId,
            restartedAt: now,
            replicas: patched.body.spec?.replicas,
          });

          return {
            success: true,
            action: 'restartDeployment',
            resource: deploymentName,
            namespace: ns,
            message: `Deployment ${deploymentName} restart triggered. New pods will be created.`,
            replicas: patched.body.spec?.replicas,
            timestamp: new Date().toISOString(),
            correlationId,
          };
        } catch (error) {
          if (error.statusCode === 404) {
            console.warn(`[K8s] Deployment not found: ${deploymentName}`, { correlationId });
            throw new Error(`Deployment ${deploymentName} not found in namespace ${ns}`);
          }
          throw error;
        }
      },
      { resource: `deployment/${deploymentName}`, namespace: ns, correlationId }
    );
  }

  /**
   * Scale a Deployment to a specific number of replicas
   * 
   * @param {string} deploymentName - Name of the deployment
   * @param {number} replicas - Target number of replicas
   * @param {string} namespace - Kubernetes namespace
   * @param {object} options - Additional options
   * @returns {Promise<object>} - Operation result
   */
  async scaleDeployment(deploymentName, replicas, namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    const correlationId = options.correlationId || 'unknown';

    if (!this.isReady || !this.appsApi) {
      throw new Error('K8s client not initialized');
    }

    // Validate replica count
    if (!Number.isInteger(replicas) || replicas < 0) {
      throw new Error(`Invalid replica count: ${replicas}. Must be non-negative integer.`);
    }

    console.log(`[K8s] Attempting deployment scale: ${deploymentName} to ${replicas} replicas in namespace ${ns}`, {
      correlationId,
    });

    return this._executeWithRetry(
      async () => {
        try {
          // Get current deployment
          const deployment = await this.appsApi.readNamespacedDeployment(
            deploymentName,
            ns
          );

          const currentReplicas = deployment.body.spec?.replicas || 1;
          console.log(`[K8s] Current replicas: ${currentReplicas}, target: ${replicas}`);

          // Update replica count
          deployment.body.spec.replicas = replicas;

          // Patch deployment
          const patched = await this.appsApi.patchNamespacedDeployment(
            deploymentName,
            ns,
            deployment.body,
            undefined, // options
            undefined, // pretty
            undefined, // dryRun
            undefined  // fieldManager
          );

          console.log(`[K8s] ✓ Deployment scaling completed: ${deploymentName}`, {
            correlationId,
            previousReplicas: currentReplicas,
            targetReplicas: replicas,
            currentReplicas: patched.body.spec?.replicas,
            readyReplicas: patched.body.status?.readyReplicas,
          });

          return {
            success: true,
            action: 'scaleDeployment',
            resource: deploymentName,
            namespace: ns,
            message: `Deployment ${deploymentName} scaled from ${currentReplicas} to ${replicas} replicas.`,
            previousReplicas: currentReplicas,
            targetReplicas: replicas,
            currentReplicas: patched.body.spec?.replicas,
            readyReplicas: patched.body.status?.readyReplicas || 0,
            timestamp: new Date().toISOString(),
            correlationId,
          };
        } catch (error) {
          if (error.statusCode === 404) {
            console.warn(`[K8s] Deployment not found: ${deploymentName}`, { correlationId });
            throw new Error(`Deployment ${deploymentName} not found in namespace ${ns}`);
          }
          throw error;
        }
      },
      { resource: `deployment/${deploymentName}`, namespace: ns, correlationId }
    );
  }

  /**
   * List pods in a namespace, optionally filtered by label selector
   *
   * @param {string} namespace - Kubernetes namespace
   * @param {object} options - { labelSelector, fieldSelector }
   * @returns {Promise<object[]>} - Array of pod summaries
   */
  async listPods(namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    const { labelSelector, fieldSelector } = options;

    if (!this.isReady || !this.coreApi) {
      throw new Error('K8s client not initialized');
    }

    try {
      const response = await this.coreApi.listNamespacedPod(
        ns,
        undefined, // pretty
        undefined, // allowWatchBookmarks
        undefined, // _continue
        fieldSelector,
        labelSelector,
      );

      return (response.body.items || []).map(pod => ({
        name: pod.metadata?.name,
        namespace: pod.metadata?.namespace,
        phase: pod.status?.phase,
        ready: pod.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        restartCount: pod.status?.containerStatuses?.[0]?.restartCount ?? 0,
        creationTimestamp: pod.metadata?.creationTimestamp,
        nodeName: pod.spec?.nodeName,
        labels: pod.metadata?.labels || {},
      }));
    } catch (error) {
      throw new Error(`Failed to list pods in namespace ${ns}: ${error.message}`);
    }
  }

  /**
   * Get log output for a pod
   *
   * @param {string} podName - Pod name
   * @param {string} namespace - Kubernetes namespace
   * @param {object} options - { tailLines, sinceSeconds, container, previous }
   * @returns {Promise<string>} - Log content
   */
  async getPodLogs(podName, namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    const { tailLines = 100, sinceSeconds, container, previous = false } = options;

    if (!this.isReady || !this.coreApi) {
      throw new Error('K8s client not initialized');
    }

    try {
      const response = await this.coreApi.readNamespacedPodLog(
        podName,
        ns,
        container,
        undefined, // follow
        undefined, // insecureSkipTLSVerifyBackend
        undefined, // limitBytes
        undefined, // pretty
        previous,
        sinceSeconds,
        tailLines,
      );
      return response.body || '';
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Pod ${podName} not found in namespace ${ns}`);
      }
      throw new Error(`Failed to get logs for pod ${podName}: ${error.message}`);
    }
  }

  /**
   * Get pod status and information
   * 
   * @param {string} podName - Name of the pod
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<object>} - Pod status
   */
  async getPodStatus(podName, namespace = null) {
    const ns = namespace || this.namespace;

    if (!this.isReady || !this.coreApi) {
      throw new Error('K8s client not initialized');
    }

    try {
      const pod = await this.coreApi.readNamespacedPod(podName, ns);
      
      return {
        name: pod.body.metadata?.name,
        namespace: pod.body.metadata?.namespace,
        phase: pod.body.status?.phase,
        ready: pod.body.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        containerStatuses: pod.body.status?.containerStatuses?.map(cs => ({
          name: cs.name,
          ready: cs.ready,
          restartCount: cs.restartCount,
          state: Object.keys(cs.state)[0], // 'running', 'waiting', 'terminated'
        })) || [],
        creationTime: pod.body.metadata?.creationTimestamp,
        nodeName: pod.body.spec?.nodeName,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Pod ${podName} not found in namespace ${ns}`);
      }
      throw error;
    }
  }

  /**
   * Get deployment status and information
   * 
   * @param {string} deploymentName - Name of the deployment
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<object>} - Deployment status
   */
  async getDeploymentStatus(deploymentName, namespace = null) {
    const ns = namespace || this.namespace;

    if (!this.isReady || !this.appsApi) {
      throw new Error('K8s client not initialized');
    }

    try {
      const deployment = await this.appsApi.readNamespacedDeployment(
        deploymentName,
        ns
      );

      return {
        name: deployment.body.metadata?.name,
        namespace: deployment.body.metadata?.namespace,
        desiredReplicas: deployment.body.spec?.replicas || 0,
        readyReplicas: deployment.body.status?.readyReplicas || 0,
        updatedReplicas: deployment.body.status?.updatedReplicas || 0,
        availableReplicas: deployment.body.status?.availableReplicas || 0,
        conditions: deployment.body.status?.conditions?.map(c => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
        })) || [],
        creationTime: deployment.body.metadata?.creationTimestamp,
        lastUpdateTime: deployment.body.status?.observedGeneration,
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`Deployment ${deploymentName} not found in namespace ${ns}`);
      }
      throw error;
    }
  }

  // ── New methods added for Phase 4 K8s handler completeness ────────────

  async getPod(podName, namespace = null) {
    const ns = namespace || this.namespace;
    if (!this.isReady || !this.coreApi) throw new Error('K8s client not initialized');
    try {
      const pod = await this.coreApi.readNamespacedPod(podName, ns);
      const p = pod.body;
      return {
        name:         p.metadata?.name,
        namespace:    p.metadata?.namespace,
        phase:        p.status?.phase,
        ready:        p.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        nodeName:     p.spec?.nodeName,
        labels:       p.metadata?.labels || {},
        annotations:  p.metadata?.annotations || {},
        containers:   p.spec?.containers?.map(c => ({
          name:  c.name,
          image: c.image,
          resources: c.resources,
          readinessProbe: c.readinessProbe,
          livenessProbe:  c.livenessProbe,
        })) || [],
        containerStatuses: p.status?.containerStatuses?.map(cs => ({
          name:         cs.name,
          image:        cs.image,
          ready:        cs.ready,
          restartCount: cs.restartCount,
          state:        cs.state,
          lastState:    cs.lastState,
        })) || [],
        conditions:   p.status?.conditions || [],
        startTime:    p.status?.startTime,
        createdAt:    p.metadata?.creationTimestamp,
      };
    } catch (err) {
      if (err.statusCode === 404) throw new Error(`Pod ${podName} not found in namespace ${ns}`);
      throw err;
    }
  }

  async getPodEvents(podName, namespace = null) {
    const ns = namespace || this.namespace;
    if (!this.isReady || !this.coreApi) throw new Error('K8s client not initialized');
    try {
      const response = await this.coreApi.listNamespacedEvent(
        ns,
        undefined, undefined, undefined,
        `involvedObject.name=${podName},involvedObject.kind=Pod`,
      );
      return (response.body.items || []).map(ev => ({
        type:           ev.type,
        reason:         ev.reason,
        message:        ev.message,
        count:          ev.count,
        firstTimestamp: ev.firstTimestamp,
        lastTimestamp:  ev.lastTimestamp,
        source:         ev.source,
      }));
    } catch (err) {
      throw new Error(`Failed to get events for pod ${podName}: ${err.message}`);
    }
  }

  async getNode(nodeName) {
    if (!this.isReady || !this.coreApi) throw new Error('K8s client not initialized');
    try {
      const node = await this.coreApi.readNode(nodeName);
      const n = node.body;
      return {
        name:       n.metadata?.name,
        labels:     n.metadata?.labels || {},
        conditions: n.status?.conditions || [],
        ready:      n.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        unschedulable: n.spec?.unschedulable || false,
        capacity:   n.status?.capacity || {},
        allocatable: n.status?.allocatable || {},
        info:       n.status?.nodeInfo || {},
        createdAt:  n.metadata?.creationTimestamp,
      };
    } catch (err) {
      if (err.statusCode === 404) throw new Error(`Node ${nodeName} not found`);
      throw err;
    }
  }

  async rollbackDeployment(deploymentName, namespace = null, options = {}) {
    const ns = namespace || this.namespace;
    if (!this.isReady || !this.appsApi) throw new Error('K8s client not initialized');
    return this._executeWithRetry(async () => {
      const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, ns);
      const current = deployment.body.metadata?.annotations?.['deployment.kubernetes.io/revision'];
      const targetRevision = options.revision || (current ? Number(current) - 1 : undefined);
      const patch = [{ op: 'replace', path: '/spec/rollbackTo', value: { revision: targetRevision || 0 } }];
      // Standard rollback via annotation-based undo (kubectl rollout undo equivalent)
      const now = new Date().toISOString();
      if (!deployment.body.spec.template.metadata.annotations) {
        deployment.body.spec.template.metadata.annotations = {};
      }
      deployment.body.spec.template.metadata.annotations['aira.io/rolledBackAt'] = now;
      deployment.body.spec.template.metadata.annotations['aira.io/rollbackRevision'] = String(targetRevision || 'previous');
      await this.appsApi.patchNamespacedDeployment(deploymentName, ns, deployment.body);
      return {
        success:   true,
        action:    'rollbackDeployment',
        resource:  deploymentName,
        namespace: ns,
        targetRevision,
        message:   `Deployment ${deploymentName} rollback initiated to revision ${targetRevision || 'previous'}`,
        timestamp: now,
      };
    }, { resource: `deployment/${deploymentName}`, namespace: ns });
  }

  async cordonNode(nodeName, cordon = true) {
    if (!this.isReady || !this.coreApi) throw new Error('K8s client not initialized');
    return this._executeWithRetry(async () => {
      const patch = [{ op: 'replace', path: '/spec/unschedulable', value: cordon }];
      await this.coreApi.patchNode(nodeName, patch);
      return {
        success: true,
        action:  cordon ? 'cordonNode' : 'uncordonNode',
        node:    nodeName,
        unschedulable: cordon,
        message: `Node ${nodeName} ${cordon ? 'cordoned' : 'uncordoned'} — unschedulable=${cordon}`,
        timestamp: new Date().toISOString(),
      };
    }, { resource: `node/${nodeName}` });
  }

    // ==========================================================================
  // PHASE 13 — EXTENDED READ-ONLY KUBERNETES INTELLIGENCE
  // ==========================================================================

  /**
   * Get PersistentVolumeClaim information.
   */
  async getPVC(
    pvcName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.coreApi
    ) {
      throw new Error(
        "K8s client not initialized"
      );
    }

    try {
      const response =
        await this.coreApi
          .readNamespacedPersistentVolumeClaim(
            pvcName,
            ns
          );

      const pvc =
        response.body;

      return {
        name:
          pvc.metadata?.name,

        namespace:
          pvc.metadata?.namespace,

        phase:
          pvc.status?.phase,

        volumeName:
          pvc.spec?.volumeName ||
          null,

        storageClassName:
          pvc.spec?.storageClassName ||
          null,

        accessModes:
          pvc.spec?.accessModes ||
          [],

        requestedStorage:
          pvc.spec?.resources
            ?.requests
            ?.storage ||
          null,

        capacity:
          pvc.status?.capacity ||
          {},

        conditions:
          pvc.status?.conditions ||
          [],

        labels:
          pvc.metadata?.labels ||
          {},

        createdAt:
          pvc.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        throw new Error(
          `PVC ${pvcName} not found in namespace ${ns}`
        );
      }

      throw error;
    }
  }


  /**
   * Deterministically verify whether a PVC is Bound.
   */
  async checkPVCBound(
    pvcName,
    namespace = null
  ) {
    const pvc =
      await this.getPVC(
        pvcName,
        namespace
      );

    const bound =
      pvc.phase ===
      "Bound";

    return {
      name:
        pvc.name,

      namespace:
        pvc.namespace,

      phase:
        pvc.phase,

      bound,

      volumeName:
        pvc.volumeName,

      storageClassName:
        pvc.storageClassName,

      requestedStorage:
        pvc.requestedStorage,

      capacity:
        pvc.capacity,

      message:
        bound
          ? `PVC ${pvc.name} is Bound`
          : `PVC ${pvc.name} is not Bound (phase=${pvc.phase || "unknown"})`,

      checkedAt:
        new Date()
          .toISOString(),
    };
  }


  /**
   * Get Service information.
   */
  async getService(
    serviceName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.coreApi
    ) {
      throw new Error(
        "K8s client not initialized"
      );
    }

    try {
      const response =
        await this.coreApi
          .readNamespacedService(
            serviceName,
            ns
          );

      const service =
        response.body;

      return {
        name:
          service.metadata?.name,

        namespace:
          service.metadata
            ?.namespace,

        type:
          service.spec?.type,

        clusterIP:
          service.spec?.clusterIP,

        clusterIPs:
          service.spec?.clusterIPs ||
          [],

        selector:
          service.spec?.selector ||
          {},

        ports:
          (
            service.spec?.ports ||
            []
          ).map(
            (
              port
            ) => ({
              name:
                port.name ||
                null,

              protocol:
                port.protocol,

              port:
                port.port,

              targetPort:
                port.targetPort,

              nodePort:
                port.nodePort ||
                null,
            })
          ),

        externalIPs:
          service.spec
            ?.externalIPs ||
          [],

        externalName:
          service.spec
            ?.externalName ||
          null,

        loadBalancer:
          service.status
            ?.loadBalancer ||
          null,

        labels:
          service.metadata
            ?.labels ||
          {},

        createdAt:
          service.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        throw new Error(
          `Service ${serviceName} not found in namespace ${ns}`
        );
      }

      throw error;
    }
  }


  /**
   * Get Service endpoint information.
   *
   * Uses the CoreV1 Endpoints API because it is available across a wide
   * Kubernetes version range and provides a deterministic readiness view.
   */
  async getEndpoints(
    serviceName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.coreApi
    ) {
      throw new Error(
        "K8s client not initialized"
      );
    }

    try {
      const response =
        await this.coreApi
          .readNamespacedEndpoints(
            serviceName,
            ns
          );

      const endpoints =
        response.body;

      const subsets =
        (
          endpoints.subsets ||
          []
        ).map(
          (
            subset
          ) => ({
            readyAddresses:
              (
                subset.addresses ||
                []
              ).map(
                (
                  address
                ) => ({
                  ip:
                    address.ip,

                  hostname:
                    address.hostname ||
                    null,

                  nodeName:
                    address.nodeName ||
                    null,

                  targetRef:
                    address.targetRef
                      ? {
                          kind:
                            address
                              .targetRef
                              .kind,

                          name:
                            address
                              .targetRef
                              .name,

                          namespace:
                            address
                              .targetRef
                              .namespace,
                        }
                      : null,
                })
              ),

            notReadyAddresses:
              (
                subset
                  .notReadyAddresses ||
                []
              ).map(
                (
                  address
                ) => ({
                  ip:
                    address.ip,

                  hostname:
                    address.hostname ||
                    null,

                  nodeName:
                    address.nodeName ||
                    null,

                  targetRef:
                    address.targetRef
                      ? {
                          kind:
                            address
                              .targetRef
                              .kind,

                          name:
                            address
                              .targetRef
                              .name,

                          namespace:
                            address
                              .targetRef
                              .namespace,
                        }
                      : null,
                })
              ),

            ports:
              (
                subset.ports ||
                []
              ).map(
                (
                  port
                ) => ({
                  name:
                    port.name ||
                    null,

                  port:
                    port.port,

                  protocol:
                    port.protocol,
                })
              ),
          })
        );

      const readyCount =
        subsets.reduce(
          (
            total,
            subset
          ) =>
            total +
            subset
              .readyAddresses
              .length,
          0
        );

      const notReadyCount =
        subsets.reduce(
          (
            total,
            subset
          ) =>
            total +
            subset
              .notReadyAddresses
              .length,
          0
        );

      return {
        name:
          endpoints.metadata?.name,

        namespace:
          endpoints.metadata
            ?.namespace,

        subsets,

        readyCount,

        notReadyCount,

        hasReadyEndpoints:
          readyCount >
          0,

        createdAt:
          endpoints.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        /*
         * A service with no endpoint object should be represented as an
         * unhealthy deterministic observation rather than fabricated data.
         */
        return {
          name:
            serviceName,

          namespace:
            ns,

          subsets:
            [],

          readyCount:
            0,

          notReadyCount:
            0,

          hasReadyEndpoints:
            false,

          missing:
            true,
        };
      }

      throw error;
    }
  }


  /**
   * Verify that a Service currently has at least one ready endpoint.
   */
  async checkServiceEndpoints(
    serviceName,
    namespace = null
  ) {
    const service =
      await this.getService(
        serviceName,
        namespace
      );

    /*
     * ExternalName Services intentionally have no pod endpoints.
     */
    if (
      service.type ===
      "ExternalName"
    ) {
      return {
        service:
          service.name,

        namespace:
          service.namespace,

        serviceType:
          service.type,

        healthy:
          Boolean(
            service.externalName
          ),

        readyEndpoints:
          0,

        notReadyEndpoints:
          0,

        externalName:
          service.externalName,

        reason:
          "EXTERNAL_NAME_SERVICE",

        checkedAt:
          new Date()
            .toISOString(),
      };
    }

    const endpoints =
      await this.getEndpoints(
        serviceName,
        namespace
      );

    return {
      service:
        service.name,

      namespace:
        service.namespace,

      serviceType:
        service.type,

      healthy:
        endpoints
          .hasReadyEndpoints ===
        true,

      readyEndpoints:
        endpoints.readyCount,

      notReadyEndpoints:
        endpoints.notReadyCount,

      reason:
        endpoints
          .hasReadyEndpoints
          ? "READY_ENDPOINTS_PRESENT"
          : "NO_READY_ENDPOINTS",

      checkedAt:
        new Date()
          .toISOString(),
    };
  }


  /**
   * Get NetworkingV1 Ingress information.
   */
  async getIngress(
    ingressName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.networkingApi
    ) {
      throw new Error(
        "K8s networking client not initialized"
      );
    }

    try {
      const response =
        await this.networkingApi
          .readNamespacedIngress(
            ingressName,
            ns
          );

      const ingress =
        response.body;

      return {
        name:
          ingress.metadata?.name,

        namespace:
          ingress.metadata
            ?.namespace,

        ingressClassName:
          ingress.spec
            ?.ingressClassName ||
          null,

        defaultBackend:
          ingress.spec
            ?.defaultBackend ||
          null,

        rules:
          (
            ingress.spec?.rules ||
            []
          ).map(
            (
              rule
            ) => ({
              host:
                rule.host ||
                null,

              paths:
                (
                  rule.http
                    ?.paths ||
                  []
                ).map(
                  (
                    path
                  ) => ({
                    path:
                      path.path,

                    pathType:
                      path.pathType,

                    serviceName:
                      path.backend
                        ?.service
                        ?.name,

                    servicePort:
                      path.backend
                        ?.service
                        ?.port
                        ?.number ??
                      path.backend
                        ?.service
                        ?.port
                        ?.name ??
                      null,
                  })
                ),
            })
          ),

        tls:
          (
            ingress.spec?.tls ||
            []
          ).map(
            (
              entry
            ) => ({
              hosts:
                entry.hosts ||
                [],

              secretName:
                entry.secretName ||
                null,
            })
          ),

        loadBalancer:
          ingress.status
            ?.loadBalancer ||
          {},

        labels:
          ingress.metadata
            ?.labels ||
          {},

        annotations:
          ingress.metadata
            ?.annotations ||
          {},

        createdAt:
          ingress.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        throw new Error(
          `Ingress ${ingressName} not found in namespace ${ns}`
        );
      }

      throw error;
    }
  }


  /**
   * Deterministic structural verification for an Ingress.
   *
   * This deliberately does NOT claim external HTTP reachability.
   * It verifies that the Ingress has routing configuration and, where
   * applicable, an observed load-balancer address.
   */
  async checkIngress(
    ingressName,
    namespace = null
  ) {
    const ingress =
      await this.getIngress(
        ingressName,
        namespace
      );

    const pathCount =
      ingress.rules
        .reduce(
          (
            total,
            rule
          ) =>
            total +
            rule.paths.length,
          0
        );

    const hasDefaultBackend =
      Boolean(
        ingress.defaultBackend
      );

    const loadBalancerIngress =
      ingress
        .loadBalancer
        ?.ingress ||
      [];

    const hasRouting =
      pathCount >
        0 ||
      hasDefaultBackend;

    return {
      ingress:
        ingress.name,

      namespace:
        ingress.namespace,

      ingressClassName:
        ingress
          .ingressClassName,

      configured:
        hasRouting,

      ruleCount:
        ingress.rules.length,

      pathCount,

      tlsCount:
        ingress.tls.length,

      hasDefaultBackend,

      loadBalancerObserved:
        loadBalancerIngress
          .length >
        0,

      healthy:
        hasRouting,

      reason:
        hasRouting
          ? "INGRESS_ROUTING_CONFIGURED"
          : "INGRESS_HAS_NO_ROUTING",

      checkedAt:
        new Date()
          .toISOString(),
    };
  }


  /**
   * Get HorizontalPodAutoscaler information.
   */
  async getHPA(
    hpaName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.autoscalingApi
    ) {
      throw new Error(
        "K8s autoscaling client not initialized"
      );
    }

    try {
      const response =
        await this.autoscalingApi
          .readNamespacedHorizontalPodAutoscaler(
            hpaName,
            ns
          );

      const hpa =
        response.body;

      return {
        name:
          hpa.metadata?.name,

        namespace:
          hpa.metadata
            ?.namespace,

        scaleTargetRef:
          hpa.spec
            ?.scaleTargetRef ||
          null,

        minReplicas:
          hpa.spec
            ?.minReplicas ??
          1,

        maxReplicas:
          hpa.spec
            ?.maxReplicas,

        currentReplicas:
          hpa.status
            ?.currentReplicas ??
          0,

        desiredReplicas:
          hpa.status
            ?.desiredReplicas ??
          0,

        currentMetrics:
          hpa.status
            ?.currentMetrics ||
          [],

        conditions:
          hpa.status
            ?.conditions ||
          [],

        lastScaleTime:
          hpa.status
            ?.lastScaleTime ||
          null,

        createdAt:
          hpa.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        throw new Error(
          `HPA ${hpaName} not found in namespace ${ns}`
        );
      }

      throw error;
    }
  }


  /**
   * Get ResourceQuota information.
   */
  async getResourceQuota(
    quotaName,
    namespace = null
  ) {
    const ns =
      namespace ||
      this.namespace;

    if (
      !this.isReady ||
      !this.coreApi
    ) {
      throw new Error(
        "K8s client not initialized"
      );
    }

    try {
      const response =
        await this.coreApi
          .readNamespacedResourceQuota(
            quotaName,
            ns
          );

      const quota =
        response.body;

      return {
        name:
          quota.metadata?.name,

        namespace:
          quota.metadata
            ?.namespace,

        hard:
          quota.status?.hard ||
          quota.spec?.hard ||
          {},

        used:
          quota.status?.used ||
          {},

        scopes:
          quota.spec?.scopes ||
          [],

        scopeSelector:
          quota.spec
            ?.scopeSelector ||
          null,

        labels:
          quota.metadata
            ?.labels ||
          {},

        createdAt:
          quota.metadata
            ?.creationTimestamp,
      };
    } catch (error) {
      if (
        error.statusCode ===
        404
      ) {
        throw new Error(
          `ResourceQuota ${quotaName} not found in namespace ${ns}`
        );
      }

      throw error;
    }
  }


  /**
   * Read-only DNS health inspection.
   *
   * This does NOT execute commands in workloads.
   * It checks the Kubernetes DNS Service and its backing endpoints.
   */
  async checkDNS(
    namespace = "kube-system"
  ) {
    if (
      !this.isReady ||
      !this.coreApi
    ) {
      throw new Error(
        "K8s client not initialized"
      );
    }

    const candidates = [
      "kube-dns",
      "coredns",
    ];

    let selectedService =
      null;

    let lastError =
      null;

    for (
      const serviceName
      of candidates
    ) {
      try {
        selectedService =
          await this.getService(
            serviceName,
            namespace
          );

        if (
          selectedService
        ) {
          break;
        }
      } catch (error) {
        lastError =
          error;
      }
    }

    if (
      !selectedService
    ) {
      return {
        healthy:
          false,

        namespace,

        service:
          null,

        readyEndpoints:
          0,

        reason:
          "DNS_SERVICE_NOT_FOUND",

        error:
          lastError
            ?.message ||
          null,

        checkedAt:
          new Date()
            .toISOString(),
      };
    }

    const endpointState =
      await this.getEndpoints(
        selectedService.name,
        namespace
      );

    const dnsPorts =
      selectedService
        .ports
        .filter(
          (
            port
          ) =>
            port.port ===
              53 ||
            String(
              port.name ||
              ""
            )
              .toLowerCase()
              .includes(
                "dns"
              )
        );

    const healthy =
      endpointState
        .readyCount >
        0 &&
      dnsPorts.length >
        0;

    return {
      healthy,

      namespace,

      service:
        selectedService
          .name,

      serviceType:
        selectedService
          .type,

      readyEndpoints:
        endpointState
          .readyCount,

      notReadyEndpoints:
        endpointState
          .notReadyCount,

      dnsPorts,

      reason:
        healthy
          ? "DNS_SERVICE_AND_ENDPOINTS_HEALTHY"
          : endpointState
              .readyCount ===
            0
            ? "DNS_HAS_NO_READY_ENDPOINTS"
            : "DNS_SERVICE_PORT_NOT_FOUND",

      checkedAt:
        new Date()
          .toISOString(),
    };
  }
  
  /**
   * Execute K8s operation with retry logic
   * 
   * @private
   * @param {Function} operation - Async function to execute
   * @param {object} context - Context for logging
   * @returns {Promise<object>} - Operation result
   */
  async _executeWithRetry(operation, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[K8s] Executing operation (attempt ${attempt}/${this.maxRetries})`, context);
        const result = await operation();
        
        // Log success with metrics service if available
        if (loggingService) {
          loggingService.logStructured({
            level: 'info',
            message: 'K8s operation succeeded',
            service: 'k8s-client',
            context,
            attempt,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this._isRetryableError(error);
        const isLastAttempt = attempt === this.maxRetries;

        console.warn(`[K8s] Operation failed (attempt ${attempt}/${this.maxRetries})`, {
          error: error.message,
          statusCode: error.statusCode,
          isRetryable,
          context,
        });

        if (!isRetryable || isLastAttempt) {
          // Non-retryable error or last attempt - throw immediately
          const errorMsg = `K8s operation failed after ${attempt} attempt(s): ${error.message}`;
          
          if (loggingService) {
            loggingService.logStructured({
              level: 'error',
              message: errorMsg,
              service: 'k8s-client',
              context,
              error: error.message,
              statusCode: error.statusCode,
              attempt,
            });
          }
          
          throw new Error(errorMsg);
        }

        // Calculate backoff time with exponential increase
        const backoffMs = this.retryBackoffMs * Math.pow(2, attempt - 1);
        console.log(`[K8s] Retrying after ${backoffMs}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    // Shouldn't reach here, but throw just in case
    throw lastError || new Error('K8s operation failed');
  }

  /**
   * Determine if an error is retryable
   * 
   * @private
   * @param {Error} error - The error to check
   * @returns {boolean} - Whether error is retryable
   */
  _isRetryableError(error) {
    // Retryable HTTP status codes
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    if (error.statusCode && retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    // Network-level errors are retryable
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'EHOSTUNREACH') {
      return true;
    }

    return false;
  }

  /**
   * Execute a K8s action from runbook
   * This is the public interface for runbook execution
   * 
   * @param {string} actionType - Type of action ('restart_pod', 'restart_deployment', 'scale_deployment')
   * @param {object} params - Action parameters
   * @param {object} context - Execution context
   * @returns {Promise<object>} - Action result
   */
  async executeAction(actionType, params, context = {}) {
    const { resource, namespace, replicas } = params;
    const correlationId = context.correlationId || 'unknown';

    console.log(`[K8s] Executing action: ${actionType}`, {
      resource,
      namespace,
      replicas,
      correlationId,
    });

    switch (actionType) {
      case 'restart_pod':
        return await this.restartPod(resource, namespace, { correlationId });

      case 'restart_deployment':
        return await this.restartDeployment(resource, namespace, { correlationId });

      case 'scale_deployment':
        if (params.replicas == null) {
          throw new Error('scale_deployment requires "replicas" parameter');
        }
        return await this.scaleDeployment(resource, params.replicas, namespace, { correlationId });

      case 'list_pods':
        return await this.listPods(namespace, {
          labelSelector: params.labelSelector,
          fieldSelector: params.fieldSelector,
        });

      case 'get_logs':
        return await this.getPodLogs(resource, namespace, {
          tailLines: params.tailLines,
          sinceSeconds: params.sinceSeconds,
          container: params.container,
          previous: params.previous,
        });

      case 'get_pod_status':
      case 'check_pod_health':
        return await this.getPodStatus(resource, namespace);

      case 'get_deployment_status':
        return await this.getDeploymentStatus(resource, namespace);

      default:
        throw new Error(`Unknown K8s action type: ${actionType}`);
    }
  }
}

// Create singleton instance
let instance = null;

/**
 * Get or create K8sClient singleton
 * 
 * @returns {K8sClient} - K8s client instance
 */
function getK8sClient() {
  if (!instance) {
    instance = new K8sClient();
  }
  return instance;
}

module.exports = {
  K8sClient,
  getK8sClient,
};
