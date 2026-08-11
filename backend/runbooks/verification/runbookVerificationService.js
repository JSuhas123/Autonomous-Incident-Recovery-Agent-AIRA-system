'use strict';

/**
 * Runbook Verification Engine — Phase I
 *
 * Verifies that a Runbook execution actually achieved the desired recovery
 * state.  Action success ≠ recovery success.
 *
 * Supported check types (based on existing integrations):
 *
 *   Kubernetes:
 *     pod_exists           — pod is present in namespace
 *     pod_running          — pod phase=Running AND ready=true
 *     pod_ready            — pod ready condition = true
 *     restart_count_stable — restart count unchanged over poll window
 *     deployment_available — deployment available condition = true
 *     replicas_ready       — all desired replicas are ready
 *     rollout_complete     — all replicas updated + available
 *
 *   HTTP:
 *     status_2xx           — HTTP GET/POST returns 2xx
 *     latency_below        — HTTP response time < threshold ms
 *
 *   Generic:
 *     no_new_incident_signal — placeholder (depends on monitoring integration)
 */

const { getResilientK8sExecutor } = require('../../services/k8s');

// ── Types ──────────────────────────────────────────────────────────────────

const VERIFICATION_CHECK_RESULT = Object.freeze({
  PASSED:  'PASSED',
  FAILED:  'FAILED',
  ERROR:   'ERROR',
  SKIPPED: 'SKIPPED',
});

const STRATEGY = Object.freeze({
  ALL:    'ALL',
  ANY:    'ANY',
  QUORUM: 'QUORUM',
});

// ── Engine ─────────────────────────────────────────────────────────────────

class RunbookVerificationService {
  /**
   * Run all verification checks for a runbook execution.
   *
   * @param {object} verificationConfig  - Runbook.verification (strategy, checks, timeoutSeconds)
   * @param {object} resolvedParams      - Map of param name → resolved value
   * @param {object} context             - { correlationId, executionId, tenantId }
   * @returns {Promise<VerificationResult>}
   */
  async verify(verificationConfig, resolvedParams, context = {}) {
    if (!verificationConfig || !Array.isArray(verificationConfig.checks) || verificationConfig.checks.length === 0) {
      return {
        passed:   true,
        strategy: null,
        checks:   [],
        summary:  'No verification checks defined — skipped',
        skipped:  true,
      };
    }

    const strategy       = verificationConfig.strategy || STRATEGY.ALL;
    const overallTimeout = (verificationConfig.timeoutSeconds || 120) * 1000;
    const deadline       = Date.now() + overallTimeout;

    const checkResults = [];

    for (const checkDef of verificationConfig.checks) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        checkResults.push({
          id:           checkDef.id,
          type:         checkDef.type,
          result:       VERIFICATION_CHECK_RESULT.FAILED,
          observedValue: null,
          expected:     null,
          evidence:     null,
          timestamp:    new Date().toISOString(),
          error:        'Overall verification timeout exceeded',
        });
        continue;
      }

      const checkTimeout = Math.min(
        (checkDef.timeoutSeconds || 30) * 1000,
        remaining,
      );

      const checkResult = await this._runCheck(checkDef, resolvedParams, context, checkTimeout);
      checkResults.push(checkResult);
    }

    const passed = this._evaluateStrategy(strategy, checkResults, verificationConfig.minimumSuccessfulChecks);

    return {
      passed,
      strategy,
      checks: checkResults,
      summary: `${checkResults.filter(c => c.result === VERIFICATION_CHECK_RESULT.PASSED).length}/${checkResults.length} checks passed`,
    };
  }

  // ── Strategy evaluation ───────────────────────────────────────────────

  _evaluateStrategy(strategy, results, minSuccessful) {
    // SKIPPED results (unavailable checks) are excluded from pass/fail counting
    const active = results.filter(r => r.result !== VERIFICATION_CHECK_RESULT.SKIPPED);
    const passed = active.filter(r => r.result === VERIFICATION_CHECK_RESULT.PASSED).length;
    const total  = active.length;

    if (total === 0) return true; // all checks skipped — treat as passed

    switch (strategy) {
      case STRATEGY.ALL:    return passed === total;
      case STRATEGY.ANY:    return passed >= 1;
      case STRATEGY.QUORUM: return passed >= (minSuccessful || Math.ceil(total / 2));
      default:              return passed === total;
    }
  }

  // ── Individual check dispatch ─────────────────────────────────────────

  async _runCheck(checkDef, resolvedParams, context, timeoutMs) {
    const start = Date.now();
    const base  = {
      id:        checkDef.id,
      type:      checkDef.type,
      timestamp: new Date().toISOString(),
    };

    try {
      const params = _interpolateParams(checkDef.params || {}, resolvedParams);
      const raw    = await _withTimeout(
        () => this._dispatchCheck(checkDef.type, params, context),
        timeoutMs,
        `Verification check "${checkDef.type}" timed out after ${timeoutMs}ms`,
      );

      return {
        ...base,
        result:        raw.unavailable ? VERIFICATION_CHECK_RESULT.SKIPPED
                       : raw.passed   ? VERIFICATION_CHECK_RESULT.PASSED
                                      : VERIFICATION_CHECK_RESULT.FAILED,
        observedValue: raw.observedValue,
        expected:      raw.expected,
        evidence:      raw.evidence || null,
        error:         raw.error    || null,
        durationMs:    Date.now() - start,
      };
    } catch (err) {
      return {
        ...base,
        result:     VERIFICATION_CHECK_RESULT.ERROR,
        error:      err.message,
        durationMs: Date.now() - start,
      };
    }
  }

  async _dispatchCheck(type, params, context) {
    switch (type) {
      case 'pod_exists':           return this._checkPodExists(params, context);
      case 'pod_running':          return this._checkPodRunning(params, context);
      case 'pod_ready':            return this._checkPodReady(params, context);
      case 'restart_count_stable': return this._checkRestartCountStable(params, context);
      case 'deployment_available': return this._checkDeploymentAvailable(params, context);
      case 'replicas_ready':       return this._checkReplicasReady(params, context);
      case 'rollout_complete':     return this._checkRolloutComplete(params, context);
      case 'status_2xx':           return this._checkHttp2xx(params, context);
      case 'latency_below':        return this._checkLatencyBelow(params, context);
      case 'error_rate_below':     return this._checkErrorRateBelow(params, context);
      case 'service_healthy':      return this._checkServiceHealthy(params, context);
      case 'node_ready':           return this._checkNodeReady(params, context);
      case 'node_cordoned':        return this._checkNodeCordoned(params, context);
      default:
        throw new Error(`Unsupported verification check type: "${type}"`);
    }
  }

  // ── Kubernetes checks ─────────────────────────────────────────────────

  async _checkPodExists(params, context) {
    const exec = getResilientK8sExecutor();
    const pods = await exec.k8sClient.listPods(params.namespace, {
      fieldSelector: `metadata.name=${params.pod}`,
    });
    const exists = pods.some(p => p.name === params.pod);
    return {
      passed:        exists,
      observedValue: exists ? 'exists' : 'not_found',
      expected:      'exists',
    };
  }

  async _checkPodRunning(params, context) {
    const exec   = getResilientK8sExecutor();
    const status = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    const passed = status.phase === 'Running' && status.ready === true;
    return {
      passed,
      observedValue: `phase=${status.phase},ready=${status.ready}`,
      expected:      'phase=Running,ready=true',
      evidence:      status,
    };
  }

  async _checkPodReady(params, context) {
    const exec   = getResilientK8sExecutor();
    const status = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    return {
      passed:        status.ready === true,
      observedValue: String(status.ready),
      expected:      'true',
    };
  }

  async _checkRestartCountStable(params, context) {
    const exec   = getResilientK8sExecutor();
    const before = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    const beforeCount = before.containerStatuses?.[0]?.restartCount ?? 0;

    // Wait the poll window (default 15s)
    const pollWindowMs = (params.pollWindowSeconds || 15) * 1000;
    await new Promise(r => setTimeout(r, Math.min(pollWindowMs, 30000)));

    const after      = await exec.k8sClient.getPodStatus(params.pod, params.namespace);
    const afterCount = after.containerStatuses?.[0]?.restartCount ?? 0;
    const stable     = afterCount === beforeCount;

    return {
      passed:        stable,
      observedValue: `restartCount=${afterCount}`,
      expected:      `restartCount=${beforeCount} (unchanged)`,
    };
  }

  async _checkDeploymentAvailable(params, context) {
    const exec   = getResilientK8sExecutor();
    const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    const available = status.conditions?.some(c => c.type === 'Available' && c.status === 'True');
    return {
      passed:        available || false,
      observedValue: `available=${available}`,
      expected:      'available=true',
      evidence:      { conditions: status.conditions },
    };
  }

  async _checkReplicasReady(params, context) {
    const exec   = getResilientK8sExecutor();
    const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    const passed = status.readyReplicas >= status.desiredReplicas && status.desiredReplicas > 0;
    return {
      passed,
      observedValue: `ready=${status.readyReplicas}/${status.desiredReplicas}`,
      expected:      `ready=${status.desiredReplicas}/${status.desiredReplicas}`,
    };
  }

  async _checkRolloutComplete(params, context) {
    const exec   = getResilientK8sExecutor();
    const status = await exec.k8sClient.getDeploymentStatus(params.resource, params.namespace);
    const passed = status.updatedReplicas >= status.desiredReplicas &&
                   status.availableReplicas >= status.desiredReplicas;
    return {
      passed,
      observedValue: `updated=${status.updatedReplicas},available=${status.availableReplicas}/${status.desiredReplicas}`,
      expected:      'all replicas updated and available',
    };
  }

  // ── HTTP checks ───────────────────────────────────────────────────────

  async _checkHttp2xx(params, context) {
    const url = params.url || `https://${params.host}${params.path || '/health'}`;
    const start = Date.now();
    try {
      const response = await fetch(url, {
        method:  params.method || 'GET',
        headers: { 'User-Agent': 'AIRA-Verification/1.0' },
        signal:  AbortSignal.timeout(params.timeoutMs || 5000),
      });
      const status  = response.status;
      const passed  = status >= 200 && status < 300;
      return {
        passed,
        observedValue: String(status),
        expected:      '2xx',
        evidence:      { url, statusCode: status, durationMs: Date.now() - start },
      };
    } catch (err) {
      return { passed: false, error: err.message };
    }
  }

  async _checkLatencyBelow(params, context) {
    const url       = params.url || `https://${params.host}${params.path || '/health'}`;
    const threshold = params.thresholdMs || 1000;
    const start     = Date.now();
    try {
      await fetch(url, {
        signal: AbortSignal.timeout(threshold * 2),
      });
      const latency = Date.now() - start;
      const passed  = latency < threshold;
      return {
        passed,
        observedValue: `${latency}ms`,
        expected:      `< ${threshold}ms`,
        evidence:      { latencyMs: latency },
      };
    } catch (err) {
      return { passed: false, error: err.message };
    }
  }

  async _checkErrorRateBelow(params, context) {
    // Real implementation requires Prometheus integration — returns UNAVAILABLE until wired
    // Returning passed=false with an explicit unavailable flag so caller can treat as SKIPPED
    return {
      passed:        false,
      unavailable:   true,
      observedValue: 'UNAVAILABLE',
      expected:      `< ${params.threshold || 0.05}`,
      evidence:      { reason: 'Prometheus/monitoring integration not wired. Cannot verify error rate.' },
      error:         'UNAVAILABLE: monitoring integration not configured',
    };
  }

  async _checkServiceHealthy(params, context) {
    // Try HTTP health check if host/url is specified; otherwise UNAVAILABLE
    if (params.host || params.url) {
      return this._checkHttp2xx(params, context);
    }
    return {
      passed:        false,
      unavailable:   true,
      observedValue: 'UNAVAILABLE',
      evidence:      { reason: 'No host/url configured for service health check.' },
      error:         'UNAVAILABLE: no health endpoint configured',
    };
  }

  async _checkNodeReady(params, context) {
    const exec = getResilientK8sExecutor();
    const node = await exec.k8sClient.getNode(params.node);
    const passed = node.ready === true;
    return {
      passed,
      observedValue: `ready=${node.ready}`,
      expected:      'ready=true',
      evidence:      { conditions: node.conditions },
    };
  }

  async _checkNodeCordoned(params, context) {
    const exec = getResilientK8sExecutor();
    const node = await exec.k8sClient.getNode(params.node);
    const expectedCordoned = params.cordoned !== false; // default: expect cordoned=true
    const passed = node.unschedulable === expectedCordoned;
    return {
      passed,
      observedValue: `unschedulable=${node.unschedulable}`,
      expected:      `unschedulable=${expectedCordoned}`,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function _interpolateParams(template, resolvedParams) {
  const out = {};
  for (const [key, val] of Object.entries(template)) {
    if (typeof val === 'string') {
      out[key] = val.replace(/\$\{([^}]+)\}/g, (_, name) =>
        resolvedParams[name] !== undefined ? String(resolvedParams[name]) : val,
      );
    } else {
      out[key] = val;
    }
  }
  return out;
}

function _withTimeout(fn, ms, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    fn().then(
      v  => { clearTimeout(timer); resolve(v); },
      e  => { clearTimeout(timer); reject(e);  },
    );
  });
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _service = null;

function getRunbookVerificationService() {
  if (!_service) _service = new RunbookVerificationService();
  return _service;
}

module.exports = {
  RunbookVerificationService,
  getRunbookVerificationService,
  VERIFICATION_CHECK_RESULT,
  STRATEGY,
};
