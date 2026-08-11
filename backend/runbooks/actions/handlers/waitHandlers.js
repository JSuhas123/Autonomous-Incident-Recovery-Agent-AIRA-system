'use strict';

/**
 * Wait / Poll Handlers — Phase E/F
 *
 * IMPLEMENTED:
 *   wait/poll_condition — polls a condition function repeatedly with backoff
 */

// ── poll_condition ─────────────────────────────────────────────────────────

const pollCondition = {
  type: 'wait',
  action: 'poll_condition',
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
    description:          'Poll a named condition until it is satisfied or timeout is reached.',
  },

  validate(params) {
    const errors = [];
    if (!params.conditionType) errors.push('Missing required parameter: conditionType');
    return { valid: errors.length === 0, errors };
  },

  /**
   * Execute a polling loop.
   *
   * params.conditionType:
   *   'pod_running'      — polls k8sClient.getPodStatus until phase === Running && ready
   *   'deployment_ready' — polls getDeploymentStatus until readyReplicas === desiredReplicas
   *   'custom'           — evaluates params.conditionFn (not supported in production)
   *
   * params.resource    — resource name (pod or deployment)
   * params.namespace   — namespace
   * params.intervalSeconds — poll interval (default 5)
   * timeoutSeconds is read from context.stepConfig.timeoutSeconds
   */
  async execute(params, context) {
    const intervalMs = (params.intervalSeconds || 5) * 1000;
    const timeoutMs  = (context.stepConfig?.timeoutSeconds || 300) * 1000;
    const deadline   = Date.now() + timeoutMs;

    const conditionType = params.conditionType;
    let lastStatus = null;
    let attempts   = 0;

    while (Date.now() < deadline) {
      attempts++;
      try {
        lastStatus = await _checkCondition(conditionType, params, context);
        if (lastStatus.satisfied) {
          return {
            success:    true,
            satisfied:  true,
            attempts,
            lastStatus,
            conditionType,
          };
        }
      } catch (err) {
        lastStatus = { satisfied: false, error: err.message };
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await _sleep(Math.min(intervalMs, remaining));
    }

    return {
      success:   false,
      satisfied: false,
      timedOut:  true,
      attempts,
      lastStatus,
      conditionType,
      message: `Condition "${conditionType}" not satisfied after ${attempts} attempts`,
    };
  },
};

// ── Condition implementations ──────────────────────────────────────────────

async function _checkCondition(conditionType, params, context) {
  const { getResilientK8sExecutor } = require('../../../services/k8s');
  const exec = getResilientK8sExecutor();

  switch (conditionType) {
    case 'pod_running': {
      const status = await exec.k8sClient.getPodStatus(params.resource, params.namespace);
      const satisfied = status.phase === 'Running' && status.ready === true;
      return { satisfied, phase: status.phase, ready: status.ready };
    }

    case 'deployment_ready': {
      const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
      const satisfied = status.readyReplicas >= status.desiredReplicas && status.desiredReplicas > 0;
      return {
        satisfied,
        readyReplicas:   status.readyReplicas,
        desiredReplicas: status.desiredReplicas,
      };
    }

    default:
      throw new Error(`Unsupported conditionType: "${conditionType}"`);
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Exports ────────────────────────────────────────────────────────────────

const handlers = [pollCondition];

module.exports = { handlers };
