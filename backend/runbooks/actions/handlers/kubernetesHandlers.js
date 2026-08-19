'use strict';

/**
 * Kubernetes Action Handlers — Phase F
 *
 * Registers ONLY capabilities that exist in the current k8sClient / ResilientK8sExecutor.
 *
 * IMPLEMENTED:
 *   kubernetes/restart_pod        — K8sClient.restartPod + ResilientK8sExecutor
 *   kubernetes/restart_deployment — K8sClient.restartDeployment
 *   kubernetes/scale_deployment   — K8sClient.scaleDeployment + ResilientK8sExecutor
 *   kubernetes/list_pods          — K8sClient.listPods
 *   kubernetes/get_logs           — K8sClient.getPodLogs
 *   kubernetes/check_pod_health   — K8sClient.getPodStatus
 *   kubernetes/get_deployment_status — K8sClient.getDeploymentStatus
 */

const { getResilientK8sExecutor } = require('../../../services/k8s');

// ── Shared validator helpers ───────────────────────────────────────────────

function requireParams(params, ...names) {
  const errors = [];
  for (const name of names) {
    if (params[name] == null || params[name] === '') {
      errors.push(`Missing required parameter: ${name}`);
    }
  }
  return errors;
}

// ── restart_pod ───────────────────────────────────────────────────────────

const restartPod = {
  type: 'kubernetes',
  action: 'restart_pod',
  metadata: {
    automationSafe:       true,
    idempotent:           false,  // deleting a running pod is NOT idempotent
    retrySafe:            false,
    destructive:          false,
    reversible:           true,   // controller recreates pod
    builtinRollback:      false,
    requiresConfirmation: true,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'pod',
    outputMayContainSecrets: false,
    description:          'Delete a Kubernetes pod to trigger controller-based recreation.',
  },

  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async capturePreState(params, context) {
    try {
      const exec = getResilientK8sExecutor();
      return await exec.k8sClient.getPodStatus(params.resource, params.namespace);
    } catch {
      return null;
    }
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    return exec.restartPod(params.resource, params.namespace, {
      correlationId: context.correlationId,
      decisionId:    context.executionId,
      timeout:       (params.timeoutSeconds || 60) * 1000,
    });
  },

  async verify(result, context) {
    if (!result?.success) return { passed: false, reason: 'restart_pod returned non-success' };
    return { passed: true };
  },
};

// ── restart_deployment ─────────────────────────────────────────────────────

const restartDeployment = {
  type: 'kubernetes',
  action: 'restart_deployment',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: true,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'deployment',
    outputMayContainSecrets: false,
    description:          'Trigger a rollout restart on a Kubernetes Deployment.',
  },

  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    return exec.k8sClient.restartDeployment(params.resource, params.namespace, {
      correlationId: context.correlationId,
    });
  },
};

// ── scale_deployment ───────────────────────────────────────────────────────

const scaleDeployment = {
  type: 'kubernetes',
  action: 'scale_deployment',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: true,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'deployment',
    outputMayContainSecrets: false,
    description:          'Scale a Kubernetes Deployment to a target replica count.',
  },

  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    if (params.replicas == null) errors.push('Missing required parameter: replicas');
    if (params.replicas != null && (!Number.isInteger(Number(params.replicas)) || Number(params.replicas) < 0)) {
      errors.push('replicas must be a non-negative integer');
    }
    return { valid: errors.length === 0, errors };
  },

  async capturePreState(params, context) {
    try {
      const exec = getResilientK8sExecutor();
      return await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    } catch {
      return null;
    }
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    return exec.scaleDeployment(
      params.resource,
      params.namespace,
      Number(params.replicas),
      {
        correlationId: context.correlationId,
        decisionId:    context.executionId,
        timeout:       (params.timeoutSeconds || 60) * 1000,
      },
    );
  },
};

// ── list_pods ──────────────────────────────────────────────────────────────

const listPods = {
  type: 'kubernetes',
  action: 'list_pods',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: false,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'none',
    outputMayContainSecrets: false,
    description:          'List pods in a Kubernetes namespace, optionally filtered by label selector.',
  },

  validate(params) {
    const errors = requireParams(params, 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const pods = await exec.k8sClient.listPods(params.namespace, {
      labelSelector: params.labelSelector,
      fieldSelector: params.fieldSelector,
    });
    return { success: true, pods, count: pods.length };
  },
};

// ── get_logs ───────────────────────────────────────────────────────────────

const getLogs = {
  type: 'kubernetes',
  action: 'get_logs',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: false,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'none',
    outputMayContainSecrets: true,  // logs may contain sensitive data
    description:          'Retrieve log output from a Kubernetes pod.',
  },

  validate(params) {
    const errors = requireParams(params, 'pod', 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const logs = await exec.k8sClient.getPodLogs(params.pod, params.namespace, {
      tailLines:   params.tailLines   || 100,
      sinceSeconds: params.sinceSeconds,
      container:   params.container,
      previous:    params.previous    || false,
    });
    return { success: true, logs };
  },
};

// ── check_pod_health ───────────────────────────────────────────────────────

const checkPodHealth = {
  type: 'kubernetes',
  action: 'check_pod_health',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: false,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'none',
    outputMayContainSecrets: false,
    description:          'Check pod readiness and health status.',
  },

  validate(params) {
    const errors = requireParams(params, 'pod', 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const status = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    const healthy = status.ready && status.phase === 'Running';
    return {
      success: healthy,
      healthy,
      phase: status.phase,
      ready: status.ready,
      restartCount: status.containerStatuses?.[0]?.restartCount ?? 0,
      podStatus: status,
    };
  },
};

// ── get_deployment_status ──────────────────────────────────────────────────

const getDeploymentStatus = {
  type: 'kubernetes',
  action: 'get_deployment_status',
  metadata: {
    automationSafe:       true,
    idempotent:           true,
    retrySafe:            true,
    destructive:          false,
    reversible:           true,
    builtinRollback:      false,
    requiresConfirmation: false,
    allowedEnvironments:  ['production', 'staging', 'dev'],
    blastRadius:          'none',
    outputMayContainSecrets: false,
    description:          'Retrieve Kubernetes Deployment status including replica counts.',
  },

  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    return { valid: errors.length === 0, errors };
  },

  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    return { success: true, ...status };
  },
};

// ── Exports ────────────────────────────────────────────────────────────────

// ── get_pod ────────────────────────────────────────────────────────────────

const getPod = {
  type: 'kubernetes',
  action: 'get_pod',
  metadata: {
    automationSafe: true, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: false,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'none',
    outputMayContainSecrets: false,
    description: 'Get full pod detail including resource limits, probe config, and container states.',
  },
  validate(params) {
    return { valid: !!(params.pod && params.namespace), errors: (!params.pod ? ['Missing pod'] : []).concat(!params.namespace ? ['Missing namespace'] : []) };
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const detail = await exec.k8sClient.getPod(params.pod, params.namespace);
    return { success: true, ...detail };
  },
};

// ── get_events ─────────────────────────────────────────────────────────────

const getEvents = {
  type: 'kubernetes',
  action: 'get_events',
  metadata: {
    automationSafe: true, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: false,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'none',
    outputMayContainSecrets: false,
    description: 'Get Kubernetes events for a pod (e.g. OOMKilled, BackOff, Pull errors).',
  },
  validate(params) {
    return { valid: !!(params.pod && params.namespace), errors: (!params.pod ? ['Missing pod'] : []).concat(!params.namespace ? ['Missing namespace'] : []) };
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const events = await exec.k8sClient.getPodEvents(params.pod, params.namespace);
    return { success: true, events, count: events.length };
  },
};

// ── get_deployment ─────────────────────────────────────────────────────────

const getDeployment = {
  type: 'kubernetes',
  action: 'get_deployment',
  metadata: {
    automationSafe: true, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: false,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'none',
    outputMayContainSecrets: false,
    description: 'Get Kubernetes Deployment detail including replica counts and conditions.',
  },
  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    return { valid: errors.length === 0, errors };
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    return { success: true, ...status };
  },
};

// ── check_pod_ready ────────────────────────────────────────────────────────

const checkPodReady = {
  type: 'kubernetes',
  action: 'check_pod_ready',
  metadata: {
    automationSafe: true, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: false,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'none',
    outputMayContainSecrets: false,
    description: 'Check if a pod is in Running phase and its Ready condition is true.',
  },
  validate(params) {
    const errors = requireParams(params, 'pod', 'namespace');
    return { valid: errors.length === 0, errors };
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const status = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    const ready = status.phase === 'Running' && status.ready === true;
    return { success: ready, ready, phase: status.phase, podStatus: status };
  },
};

// ── rollback_deployment ────────────────────────────────────────────────────

const rollbackDeployment = {
  type: 'kubernetes',
  action: 'rollback_deployment',
  metadata: {
    automationSafe: true, idempotent: false, retrySafe: false, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: true,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'deployment',
    outputMayContainSecrets: false,
    description: 'Roll back a Kubernetes Deployment to its previous known-good revision.',
  },
  validate(params) {
    const errors = requireParams(params, 'resource', 'namespace');
    return { valid: errors.length === 0, errors };
  },
  async capturePreState(params, context) {
    try {
      const exec = getResilientK8sExecutor();
      return await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    } catch { return null; }
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    return exec.k8sClient.rollbackDeployment(params.resource, params.namespace, {
      revision:      params.revision,
      correlationId: context.correlationId,
    });
  },
};

// ── cordon_node ────────────────────────────────────────────────────────────

const cordonNode = {
  type: 'kubernetes',
  action: 'cordon_node',
  metadata: {
    automationSafe: false, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: true,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'cluster',
    outputMayContainSecrets: false,
    description: 'Mark a Kubernetes node as unschedulable (cordon). No pods are evicted.',
  },
  validate(params) {
    const errors = requireParams(params, 'node');
    return { valid: errors.length === 0, errors };
  },
  async capturePreState(params, context) {
    try {
      const exec = getResilientK8sExecutor();
      return await exec.k8sClient.getNode(params.node);
    } catch { return null; }
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    return exec.k8sClient.cordonNode(params.node, true);
  },
  async rollback(params, preState, context) {
    // Uncordon the node to restore scheduling
    try {
      const exec = getResilientK8sExecutor();
      const result = await exec.k8sClient.cordonNode(params.node, false);
      return { success: result.success };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── get_node ───────────────────────────────────────────────────────────────

const getNode = {
  type: 'kubernetes',
  action: 'get_node',
  metadata: {
    automationSafe: true, idempotent: true, retrySafe: true, destructive: false,
    reversible: true, builtinRollback: false, requiresConfirmation: false,
    allowedEnvironments: ['production', 'staging', 'dev'], blastRadius: 'none',
    outputMayContainSecrets: false,
    description: 'Get Kubernetes node detail including conditions, capacity, and readiness.',
  },
  validate(params) {
    const errors = requireParams(params, 'node');
    return { valid: errors.length === 0, errors };
  },
  async execute(params, context) {
    const exec = getResilientK8sExecutor();
    const node = await exec.k8sClient.getNode(params.node);
    return { success: true, ...node };
  },
};

// ============================================================================
// PHASE 13 — EXTENDED KUBERNETES READ-ONLY CAPABILITIES
// ============================================================================

// ── get_pvc ─────────────────────────────────────────────────────────────────

const getPVC = {
  type: 'kubernetes',
  action: 'get_pvc',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get Kubernetes PersistentVolumeClaim status, storage class, capacity, and binding information.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const pvc =
      await exec.k8sClient.getPVC(
        params.resource,
        params.namespace
      );

    return {
      success: true,
      ...pvc,
    };
  },
};


// ── check_pvc_bound ─────────────────────────────────────────────────────────

const checkPVCBound = {
  type: 'kubernetes',
  action: 'check_pvc_bound',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Check whether a Kubernetes PersistentVolumeClaim is currently Bound.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const result =
      await exec.k8sClient.checkPVCBound(
        params.resource,
        params.namespace
      );

    return {
      success:
        result.bound === true,

      ...result,
    };
  },
};


// ── check_dns ────────────────────────────────────────────────────────────────

const checkDNS = {
  type: 'kubernetes',
  action: 'check_dns',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Inspect Kubernetes cluster DNS Service and backing endpoint health without executing commands in workloads.',
  },

  validate(params) {
    /*
     * Namespace is optional because cluster DNS normally resides
     * in kube-system.
     */
    return {
      valid: true,
      errors: [],
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const result =
      await exec.k8sClient.checkDNS(
        params.namespace ||
        'kube-system'
      );

    return {
      success:
        result.healthy === true,

      ...result,
    };
  },
};


// ── get_service ──────────────────────────────────────────────────────────────

const getService = {
  type: 'kubernetes',
  action: 'get_service',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get Kubernetes Service configuration including selectors, ports, type, and load-balancer state.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const service =
      await exec.k8sClient.getService(
        params.resource,
        params.namespace
      );

    return {
      success: true,
      ...service,
    };
  },
};


// ── get_endpoints ────────────────────────────────────────────────────────────

const getEndpoints = {
  type: 'kubernetes',
  action: 'get_endpoints',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get ready and not-ready Kubernetes Service endpoints.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const endpoints =
      await exec.k8sClient.getEndpoints(
        params.resource,
        params.namespace
      );

    return {
      success: true,
      ...endpoints,
    };
  },
};


// ── check_service_endpoints ─────────────────────────────────────────────────

const checkServiceEndpoints = {
  type: 'kubernetes',
  action: 'check_service_endpoints',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Check whether a Kubernetes Service has usable ready endpoints.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const result =
      await exec.k8sClient
        .checkServiceEndpoints(
          params.resource,
          params.namespace
        );

    return {
      success:
        result.healthy === true,

      ...result,
    };
  },
};


// ── get_ingress ──────────────────────────────────────────────────────────────

const getIngress = {
  type: 'kubernetes',
  action: 'get_ingress',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get Kubernetes Ingress routing, TLS, backend, and load-balancer configuration.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const ingress =
      await exec.k8sClient.getIngress(
        params.resource,
        params.namespace
      );

    return {
      success: true,
      ...ingress,
    };
  },
};


// ── check_ingress ────────────────────────────────────────────────────────────

const checkIngress = {
  type: 'kubernetes',
  action: 'check_ingress',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Deterministically check whether an Ingress has usable routing configuration.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const result =
      await exec.k8sClient.checkIngress(
        params.resource,
        params.namespace
      );

    return {
      success:
        result.healthy === true,

      ...result,
    };
  },
};


// ── get_hpa ─────────────────────────────────────────────────────────────────

const getHPA = {
  type: 'kubernetes',
  action: 'get_hpa',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get HorizontalPodAutoscaler configuration, current replicas, desired replicas, metrics, and conditions.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const hpa =
      await exec.k8sClient.getHPA(
        params.resource,
        params.namespace
      );

    return {
      success: true,
      ...hpa,
    };
  },
};


// ── get_resource_quota ──────────────────────────────────────────────────────

const getResourceQuota = {
  type: 'kubernetes',
  action: 'get_resource_quota',

  metadata: {
    automationSafe: true,
    idempotent: true,
    retrySafe: true,
    destructive: false,
    reversible: true,
    builtinRollback: false,
    requiresConfirmation: false,
    allowedEnvironments: [
      'production',
      'staging',
      'dev',
    ],
    blastRadius: 'none',
    outputMayContainSecrets: false,
    description:
      'Get Kubernetes ResourceQuota hard limits, current usage, scopes, and selectors.',
  },

  validate(params) {
    const errors =
      requireParams(
        params,
        'resource',
        'namespace'
      );

    return {
      valid:
        errors.length === 0,

      errors,
    };
  },

  async execute(params, context) {
    const exec =
      getResilientK8sExecutor();

    const quota =
      await exec.k8sClient
        .getResourceQuota(
          params.resource,
          params.namespace
        );

    return {
      success: true,
      ...quota,
    };
  },
};

const handlers = [
  // Existing mutation/read capabilities
  restartPod,
  restartDeployment,
  scaleDeployment,

  // Existing pod/deployment inspection
  listPods,
  getLogs,
  checkPodHealth,
  getDeploymentStatus,
  getPod,
  getEvents,
  getDeployment,
  checkPodReady,

  // Existing controlled recovery
  rollbackDeployment,
  cordonNode,
  getNode,

  // Phase 13 storage intelligence
  getPVC,
  checkPVCBound,

  // Phase 13 DNS intelligence
  checkDNS,

  // Phase 13 service intelligence
  getService,
  getEndpoints,
  checkServiceEndpoints,

  // Phase 13 ingress intelligence
  getIngress,
  checkIngress,

  // Phase 13 autoscaling intelligence
  getHPA,

  // Phase 13 quota intelligence
  getResourceQuota,
];

module.exports = {
  handlers,
};