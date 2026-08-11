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

const handlers = [
  restartPod,
  restartDeployment,
  scaleDeployment,
  listPods,
  getLogs,
  checkPodHealth,
  getDeploymentStatus,
];

module.exports = { handlers };
