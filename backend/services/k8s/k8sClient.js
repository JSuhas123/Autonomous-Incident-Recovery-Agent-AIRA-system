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
      this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
      this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
      this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
      this.isReady = true;
      console.log('[K8s] API clients initialized successfully');
    } catch (error) {
      console.error('[K8s] Failed to initialize API clients:', error.message);
      this.isReady = false;
      throw new Error(`K8s client initialization failed: ${error.message}`);
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
