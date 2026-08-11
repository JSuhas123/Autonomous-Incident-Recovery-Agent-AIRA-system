'use strict';

/**
 * Runbook Security Validator
 *
 * Answers: "Is this structurally and semantically valid Runbook safe enough
 * to store, approve, activate, and eventually execute?"
 *
 * Precondition: runbook has already passed validateRunbookStructure() and
 * validateRunbookSemantics(). This validator does NOT repeat those checks.
 *
 * Contract:
 *   validateRunbookSecurity(runbook, context = {}) → { valid, diagnostics }
 *
 * This validator NEVER executes actions, network calls, secret lookups,
 * or any infrastructure operation — static analysis only.
 *
 * Context (all fields optional — dependency injection):
 *   actionRegistry        – { resolve(type, action) → securityMetadata | null }
 *   endpointAllowlist     – Set<string> of explicitly allowed hostnames
 *   secretReferenceSchemes – string[] e.g. ['vault://', 'env://']
 *   tenantContext         – { tenantId: string }
 *   securityLimits        – Partial<DEFAULT_LIMITS> to override defaults
 *   targetLifecycle       – string
 *   maxBlastRadius        – string (blast-radius taxonomy key) — caps the maximum
 *                           allowed action blast radius; violations → RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED
 *
 * Deferred (not yet emitted, reserved for future capability):
 *   RUNBOOK_NOTIFICATION_SECRET_EXPOSURE — notification-channel secret exfiltration
 *     via out-of-band sinks (e.g. Slack webhook bodies, PagerDuty payloads with
 *     data enrichment). Currently subsumed by RUNBOOK_SECRET_DESTINATION_FORBIDDEN.
 *     Will be promoted once the notification-channel registry is implemented.
 *
 * actionRegistry security metadata shape:
 *   {
 *     automationSafe: boolean,
 *     requiresConfirmation: boolean,
 *     allowedEnvironments: string[],
 *     blastRadius: string,           // taxonomy key
 *     destructive: boolean,
 *     reversible: boolean,
 *     retrySafe: boolean,
 *     outputMayContainSecrets: boolean,
 *     privileges: string[],
 *     allowsBulkOperation: boolean,
 *   }
 */

const { error, warning, buildResult } = require('./validationResult');
const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_ROLLBACK_STRATEGY,
  RUNBOOK_PARAM_TYPE,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── Blast-radius taxonomy (ordered: higher rank = broader scope) ────────────
const BLAST_RADIUS_RANK = Object.freeze({
  resource:   1,
  container:  2,
  pod:        2,
  service:    3,
  namespace:  4,
  node:       5,
  cluster:    6,
  region:     7,
  account:    8,
});

// ── Security limits (configurable via context.securityLimits) ──────────────
const DEFAULT_LIMITS = Object.freeze({
  maxSteps:               50,
  maxParameters:          30,
  maxRollbackSteps:       20,
  maxVerificationChecks:  20,
  maxStringLength:        10000,
  maxNestingDepth:        10,
  maxTags:               20,
  maxNotificationEntries: 10,
});

// ── Secret-reference grammar ────────────────────────────────────────────────
// Canonical form: scheme://path
// Default approved schemes: vault://, env://
// path must match [a-zA-Z0-9/_.\-]+  (no spaces, no shell metacharacters)
const DEFAULT_SECRET_REF_SCHEMES = Object.freeze(['vault://', 'env://']);
const SECRET_REF_PATH_RE = /^[a-zA-Z0-9/_.\-]+$/;

// ── Lifecycle sets ──────────────────────────────────────────────────────────
const PRODUCTION_LIFECYCLES = new Set([
  RUNBOOK_LIFECYCLE.APPROVED,
  RUNBOOK_LIFECYCLE.ACTIVE,
]);

// ── Dangerous execution patterns ────────────────────────────────────────────
// Applied to string values in executable-context fields only — not all strings.
const DANGEROUS_EXEC_PATTERNS = [
  /\b(bash|sh|zsh|ksh)\s+-c\b/i,
  /\b(cmd\.exe|powershell|pwsh)\b/i,
  /\bpython\s+-c\b/i,
  /\bnode\s+-e\b/i,
  /\bperl\s+-e\b/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /\bspawn\s*\(/i,
  /\bchild_process\b/i,
  /\bRuntime\.getRuntime\s*\(\)/i,
  /\bos\.system\s*\(/i,
  /\bsubprocess\b/i,
  /\brm\s+-[rRfF]{1,4}\b/,
  /\bsudo\s+/i,
  /\bcurl\s+.*\|\s*(bash|sh)\b/i,
  /\bwget\s+.*\|\s*(bash|sh)\b/i,
];

// ── Dangerous object keys (prototype pollution) ─────────────────────────────
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// ── Sensitive field-key patterns (credential-bearing fields) ────────────────
const SENSITIVE_KEY_RE = [
  /^password$/i,
  /^passwd$/i,
  /^pwd$/i,
  /^secret$/i,
  /^secret[_-]key$/i,
  /token$/i,
  /^api[_-]?key$/i,
  /^private[_-]?key$/i,
  /^bearer$/i,
  /^credentials?$/i,
  /^auth(orization)?$/i,
  /^access[_-]?key$/i,
  /^client[_-]?secret$/i,
];

// ── Endpoint URL fields ─────────────────────────────────────────────────────
const ENDPOINT_FIELDS = new Set([
  'endpoint', 'url', 'baseUrl', 'base_url',
  'webhookUrl', 'webhook_url', 'callbackUrl', 'notificationUrl',
]);

// ── Resource-scope param keys (wildcard targeting check) ────────────────────
const RESOURCE_SCOPE_KEYS = new Set([
  'namespace', 'namespaces', 'cluster', 'clusters',
  'service', 'services', 'pod', 'pods', 'node', 'nodes',
  'resource', 'resources', 'target', 'targets',
  'selector', 'labelSelector',
]);

// ── Wildcard values ─────────────────────────────────────────────────────────
const WILDCARD_VALUES = new Set(['*', 'all', 'ALL', 'any', 'ANY', '*/*', '.*']);

// ── Forbidden URI schemes ───────────────────────────────────────────────────
const UNSUPPORTED_SCHEMES = new Set(['ftp:', 'file:', 'gopher:', 'data:', 'javascript:']);

// ── Forbidden hostname patterns (loopback + cloud metadata) ─────────────────
const LOOPBACK_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^::1$/,
];
const METADATA_PATTERNS = [
  /^169\.254\.\d+\.\d+$/,        // AWS / Azure IMDS
  /^metadata\.google\.internal$/i,
  /^metadata\b/i,                 // conservative catch-all
];

// ── Privileged param-key patterns ───────────────────────────────────────────
const PRIVILEGED_KEY_RE = [
  /^kubeconfig$/i,
  /^iam[_-]?role$/i,
  /^service[_-]?account[_-]?key$/i,
  /^cluster[_-]?admin[_-]?token$/i,
  /^(root|admin)[_-]?password$/i,
];

// ── Redaction constant ──────────────────────────────────────────────────────
// Security diagnostics MUST NOT echo secret values. Use this placeholder.
const REDACTED = '[REDACTED]';

// ── Pure helpers ────────────────────────────────────────────────────────────

function effectiveTarget(runbook, context) {
  return context.targetLifecycle || runbook.lifecycle || RUNBOOK_LIFECYCLE.DRAFT;
}

function isProduction(runbook, context) {
  return PRODUCTION_LIFECYCLES.has(effectiveTarget(runbook, context));
}

function resolvedSchemes(context) {
  return context.secretReferenceSchemes || DEFAULT_SECRET_REF_SCHEMES;
}

function isApprovedSecretRef(value, schemes) {
  if (typeof value !== 'string') return false;
  return schemes.some(scheme => {
    if (!value.startsWith(scheme)) return false;
    const rest = value.slice(scheme.length);
    return rest.length > 0 && SECRET_REF_PATH_RE.test(rest);
  });
}

function isSensitiveKey(key) {
  return typeof key === 'string' && SENSITIVE_KEY_RE.some(p => p.test(key));
}

function matchesDangerousExecPattern(str) {
  if (typeof str !== 'string') return false;
  return DANGEROUS_EXEC_PATTERNS.some(p => p.test(str));
}

function analyzeUrl(str) {
  if (typeof str !== 'string') return null;
  try { return new URL(str); } catch { return null; }
}

function isForbiddenHost(hostname, allowlist) {
  if (!hostname) return { forbidden: false };
  if (allowlist && allowlist.has(hostname)) return { forbidden: false };
  if (LOOPBACK_PATTERNS.some(p => p.test(hostname))) return { forbidden: true, reason: 'loopback' };
  if (METADATA_PATTERNS.some(p => p.test(hostname))) return { forbidden: true, reason: 'cloud-metadata' };
  return { forbidden: false };
}

/** Returns maximum object-nesting depth without executing anything. */
function nestingDepth(value, depth = 0, seen = new WeakSet()) {
  if (depth > 30) return depth;
  if (Array.isArray(value)) {
    if (seen.has(value)) return depth;
    seen.add(value);
    let max = depth;
    for (const v of value) max = Math.max(max, nestingDepth(v, depth + 1, seen));
    return max;
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return depth;
    seen.add(value);
    let max = depth;
    for (const v of Object.values(value)) max = Math.max(max, nestingDepth(v, depth + 1, seen));
    return max;
  }
  return depth;
}

/** Returns paths of any dangerous object keys found in the value tree. */
function findDangerousKeyPaths(value, path = '', seen = new WeakSet()) {
  const found = [];
  if (Array.isArray(value)) {
    if (seen.has(value)) return found;
    seen.add(value);
    value.forEach((v, i) => found.push(...findDangerousKeyPaths(v, `${path}[${i}]`, seen)));
  } else if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return found;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      const kPath = path ? `${path}.${k}` : k;
      if (DANGEROUS_KEYS.has(k)) found.push(kPath);
      found.push(...findDangerousKeyPaths(v, kPath, seen));
    }
  }
  return found;
}

// ── Section: Arbitrary execution ────────────────────────────────────────────

function checkArbitraryExecution(runbook, context, diag) {
  const production = isProduction(runbook, context);
  const target = effectiveTarget(runbook, context);
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const path = `steps[${i}]`;

    if (step.type === RUNBOOK_STEP_TYPE.SHELL_LEGACY) {
      if (production) {
        diag.push(error('RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN', path,
          `Shell execution (type "shell") is not permitted in ${target} Runbooks. ` +
          'Migrate to a registered action handler before promoting.'));
      } else {
        diag.push(warning('RUNBOOK_ARBITRARY_EXECUTION_FORBIDDEN', path,
          'Step type "shell" will block promotion to APPROVED/ACTIVE. Migrate to a registered handler.'));
      }
      return; // do not scan further for this step type
    }

    // SCRIPT type: scan known content-bearing fields for dangerous patterns
    const contentFields = ['command', 'script', 'content', 'body', 'code'];
    contentFields.forEach(field => {
      if (typeof step[field] !== 'string') return;
      if (matchesDangerousExecPattern(step[field])) {
        if (production) {
          diag.push(error('RUNBOOK_UNSAFE_SCRIPT_CONTENT', `${path}.${field}`,
            `Script/command field "${field}" contains a dangerous execution pattern that is not permitted in ${target} Runbooks.`));
        } else {
          diag.push(warning('RUNBOOK_UNSAFE_SCRIPT_CONTENT', `${path}.${field}`,
            `Script/command field "${field}" contains a dangerous execution pattern that will block promotion.`));
        }
      }
    });

    // All types: scan known executable params
    if (step.params) {
      for (const field of contentFields) {
        if (typeof step.params[field] === 'string' && matchesDangerousExecPattern(step.params[field])) {
          diag.push((production ? error : warning)(
            'RUNBOOK_UNSAFE_SCRIPT_CONTENT', `${path}.params.${field}`,
            production
              ? `Param "${field}" contains a dangerous execution pattern not permitted in ${target} Runbooks.`
              : `Param "${field}" contains a dangerous execution pattern that will block promotion.`,
          ));
        }
      }
    }
  });
}

// ── Section: Action allowlist boundary ─────────────────────────────────────

function checkActionAllowlistBoundary(runbook, context, diag) {
  if (!context.actionRegistry) return;
  const production = isProduction(runbook, context);
  const target = effectiveTarget(runbook, context);
  const environments = runbook.scope?.environments || [];
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const path = `steps[${i}]`;
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta) return; // unknown action handled by semantic validator

    if (meta.automationSafe === false) {
      if (production) {
        diag.push(error('RUNBOOK_ACTION_NOT_AUTOMATION_SAFE', path,
          `Action "${step.type}/${step.action}" is not marked automationSafe and cannot be used in ${target} Runbooks.`));
      } else {
        diag.push(warning('RUNBOOK_ACTION_NOT_AUTOMATION_SAFE', path,
          `Action "${step.type}/${step.action}" is not marked automationSafe and will block promotion.`));
      }
    }

    if (Array.isArray(meta.allowedEnvironments) && environments.length > 0) {
      environments.forEach(env => {
        if (!meta.allowedEnvironments.includes(env)) {
          diag.push(error('RUNBOOK_ACTION_ENVIRONMENT_FORBIDDEN', path,
            `Action "${step.type}/${step.action}" is not permitted in environment "${env}". ` +
            `Allowed: [${meta.allowedEnvironments.join(', ')}].`));
        }
      });
    }

    if (meta.requiresConfirmation === true && production) {
      diag.push(error('RUNBOOK_ACTION_CONFIRMATION_REQUIRED', path,
        `Action "${step.type}/${step.action}" requires manual confirmation and cannot run unattended in ${target} Runbooks.`));
    }
  });
}

// ── Section: Secret safety ──────────────────────────────────────────────────

function checkSecretSafety(runbook, context, diag) {
  const schemes = resolvedSchemes(context);

  function scanObject(obj, basePath, seen = new WeakSet()) {
    if (Array.isArray(obj)) {
      if (seen.has(obj)) return;
      seen.add(obj);
      obj.forEach((v, i) => scanObject(v, `${basePath}[${i}]`, seen));
      return;
    }
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && isSensitiveKey(k) && v.length > 0) {
        if (!isApprovedSecretRef(v, schemes)) {
          diag.push(error('RUNBOOK_RAW_SECRET_FORBIDDEN', `${basePath}.${k}`,
            `Field "${k}" appears to contain a raw credential. ` +
            `Use an approved secret-reference (${schemes.join(', ')}). Value: ${REDACTED}`));
        }
      }
      scanObject(v, `${basePath}.${k}`, seen);
    }
  }

  // Validate secret-reference parameter default values against allowed schemes
  const params = Array.isArray(runbook.parameters) ? runbook.parameters : [];
  params.forEach((param, i) => {
    const path = `parameters[${i}]`;
    if (param.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE && typeof param.default === 'string') {
      if (!isApprovedSecretRef(param.default, schemes)) {
        diag.push(error('RUNBOOK_INVALID_SECRET_REFERENCE', `${path}.default`,
          `Secret-reference parameter "${param.name}" default value does not match an approved scheme ` +
          `(${schemes.join(', ')}). Value: ${REDACTED}`));
      }
    }
    // Also catch non-secret-reference params whose name suggests a credential
    if (param.type !== RUNBOOK_PARAM_TYPE.SECRET_REFERENCE &&
        typeof param.default === 'string' &&
        isSensitiveKey(param.name) &&
        param.default.length > 0 &&
        !isApprovedSecretRef(param.default, schemes)) {
      diag.push(error('RUNBOOK_RAW_SECRET_FORBIDDEN', `${path}.default`,
        `Parameter "${param.name}" name suggests a credential but its default is a raw value. ` +
        `Value: ${REDACTED}`));
    }
  });

  // Scan all param objects for raw credential values
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    if (step.params) scanObject(step.params, `steps[${i}].params`);
    if (step.rollback?.params) scanObject(step.rollback.params, `steps[${i}].rollback.params`);
    if (step.auth) scanObject(step.auth, `steps[${i}].auth`);
  });

  if (runbook.rollbackConfig?.steps) {
    runbook.rollbackConfig.steps.forEach((s, i) => {
      if (s.params) scanObject(s.params, `rollbackConfig.steps[${i}].params`);
    });
  }

  const preconditions = Array.isArray(runbook.preconditions) ? runbook.preconditions : [];
  preconditions.forEach((pre, i) => {
    if (pre.params) scanObject(pre.params, `preconditions[${i}].params`);
  });

  if (runbook.verification?.checks) {
    runbook.verification.checks.forEach((chk, i) => {
      if (chk.params) scanObject(chk.params, `verification.checks[${i}].params`);
    });
  }

  if (runbook.notifications) scanObject(runbook.notifications, 'notifications');
}

// ── Section: Secret interpolation into unsafe destinations ──────────────────

function checkSecretInterpolation(runbook, context, diag) {
  const secretParamNames = new Set(
    (runbook.parameters || [])
      .filter(p => p.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE)
      .map(p => p.name)
      .filter(Boolean),
  );
  if (secretParamNames.size === 0) return;

  const REF_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

  function secretRefsIn(str) {
    if (typeof str !== 'string') return [];
    const found = [];
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(str)) !== null) {
      if (secretParamNames.has(m[1])) found.push(m[1]);
    }
    return found;
  }

  function flagSecretRefs(value, path, seen = new WeakSet()) {
    if (typeof value === 'string') {
      secretRefsIn(value).forEach(ref => {
        diag.push(error('RUNBOOK_SECRET_DESTINATION_FORBIDDEN', path,
          `Secret-reference parameter "${ref}" must not be interpolated into this field. ` +
          'Route secrets only through handler-designated secure inputs.'));
      });
      return;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      value.forEach((v, i) => flagSecretRefs(v, `${path}[${i}]`, seen));
      return;
    }
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      for (const [k, v] of Object.entries(value)) flagSecretRefs(v, `${path}.${k}`, seen);
    }
  }

  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    // Notification bodies are always unsafe destinations for secrets
    if (step.type === RUNBOOK_STEP_TYPE.NOTIFICATION && step.params) {
      flagSecretRefs(step.params, `steps[${i}].params`);
    }
    // Endpoint/URL fields in any step type must not carry secret refs
    for (const field of ENDPOINT_FIELDS) {
      if (typeof step.params?.[field] === 'string') {
        flagSecretRefs(step.params[field], `steps[${i}].params.${field}`);
      }
      if (typeof step[field] === 'string') {
        flagSecretRefs(step[field], `steps[${i}].${field}`);
      }
    }
  });

  // Notification config (top-level)
  if (runbook.notifications) {
    flagSecretRefs(runbook.notifications, 'notifications');
  }
}

// ── Section: Network / HTTP safety ──────────────────────────────────────────

function checkNetworkHttpSafety(runbook, context, diag) {
  const production = isProduction(runbook, context);
  const target = effectiveTarget(runbook, context);
  const allowlist = context.endpointAllowlist || new Set();

  function checkUrl(urlStr, path) {
    if (typeof urlStr !== 'string') return;
    if (/\$\{/.test(urlStr)) return; // skip unresolved references — not a literal URL

    const url = analyzeUrl(urlStr);
    if (!url) return;

    if (UNSUPPORTED_SCHEMES.has(url.protocol)) {
      diag.push(error('RUNBOOK_UNSUPPORTED_URI_SCHEME', path,
        `URI scheme "${url.protocol}" is not supported in Runbook endpoint configuration.`));
      return;
    }

    if (url.protocol === 'http:' && production) {
      diag.push(error('RUNBOOK_INSECURE_ENDPOINT', path,
        `Endpoint uses plaintext HTTP. HTTPS is required in ${target} Runbooks.`));
    }

    if (url.username || url.password) {
      diag.push(error('RUNBOOK_CREDENTIAL_IN_URL', path,
        `Endpoint URL contains embedded credentials (user:password). ` +
        `Use secret-reference parameters instead. URL: ${REDACTED}`));
    }

    const { forbidden, reason } = isForbiddenHost(url.hostname, allowlist);
    if (forbidden) {
      diag.push(error('RUNBOOK_FORBIDDEN_ENDPOINT', path,
        `Endpoint hostname "${url.hostname}" is a restricted ${reason === 'cloud-metadata' ? 'cloud-metadata' : 'loopback'} address.`));
    }
  }

  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    for (const field of ENDPOINT_FIELDS) {
      if (typeof step[field] === 'string') checkUrl(step[field], `steps[${i}].${field}`);
      if (step.params && typeof step.params[field] === 'string') {
        checkUrl(step.params[field], `steps[${i}].params.${field}`);
      }
    }
  });

  const notifs = Array.isArray(runbook.notifications)
    ? runbook.notifications
    : (runbook.notifications ? [runbook.notifications] : []);
  notifs.forEach((notif, i) => {
    if (typeof notif !== 'object' || notif === null) return;
    for (const field of ENDPOINT_FIELDS) {
      if (typeof notif[field] === 'string') checkUrl(notif[field], `notifications[${i}].${field}`);
    }
  });
}

// ── Section: Resource target safety ─────────────────────────────────────────

function checkResourceTargetSafety(runbook, context, diag) {
  const declaredNamespaces = Array.isArray(runbook.scope?.namespaces)
    ? new Set(runbook.scope.namespaces)
    : null;
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    if (!step.params) return;
    for (const [key, value] of Object.entries(step.params)) {
      if (!RESOURCE_SCOPE_KEYS.has(key)) continue;
      const strVal = typeof value === 'string' ? value.trim() : '';

      // Wildcard targeting check
      if (WILDCARD_VALUES.has(strVal)) {
        const meta = context.actionRegistry?.resolve(step.type, step.action);
        if (!meta?.allowsBulkOperation) {
          diag.push(error('RUNBOOK_UNBOUNDED_RESOURCE_TARGET', `steps[${i}].params.${key}`,
            `Resource selector "${key}" has a wildcard value "${strVal}". ` +
            'Unconstrained resource targeting is not permitted without explicit bulk-operation authorization.'));
        }
        continue;
      }

      // Scope mismatch: step targets a resource outside the runbook's declared scope
      if (declaredNamespaces && declaredNamespaces.size > 0 &&
          key === 'namespace' &&
          strVal.length > 0 &&
          !strVal.startsWith('${') &&
          !declaredNamespaces.has(strVal)) {
        diag.push(error('RUNBOOK_RESOURCE_SCOPE_MISMATCH', `steps[${i}].params.${key}`,
          `Step targets namespace "${strVal}" which is not declared in runbook scope.namespaces ` +
          `[${[...declaredNamespaces].join(', ')}].`));
      }
    }
  });
}

// ── Section: Blast-radius threshold ────────────────────────────────────────
// RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED fires when an action's blast radius
// exceeds a configurable upper bound (context.maxBlastRadius).
// This is distinct from RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW, which checks
// that the runbook's declared scope is wide enough to cover the action.

function checkBlastRadiusThreshold(runbook, context, diag) {
  if (!context.actionRegistry || !context.maxBlastRadius) return;
  const maxRank = BLAST_RADIUS_RANK[context.maxBlastRadius];
  if (maxRank === undefined) return;

  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta?.blastRadius) return;
    const actionRank = BLAST_RADIUS_RANK[meta.blastRadius];
    if (actionRank === undefined) return;
    if (actionRank > maxRank) {
      diag.push(error('RUNBOOK_ACTION_BLAST_RADIUS_EXCEEDED', `steps[${i}]`,
        `Action "${step.type}/${step.action}" has blast radius "${meta.blastRadius}" ` +
        `(rank ${actionRank}) which exceeds the configured maximum blast radius ` +
        `"${context.maxBlastRadius}" (rank ${maxRank}).`));
    }
  });
}

// ── Section: Blast-radius consistency ────────────────────────────────────────

function checkBlastRadiusConsistency(runbook, context, diag) {
  if (!context.actionRegistry) return;
  const declaredBlastRadius = runbook.risk?.blastRadius;
  if (!declaredBlastRadius) return;
  const declaredRank = BLAST_RADIUS_RANK[declaredBlastRadius];
  if (declaredRank === undefined) return;

  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta?.blastRadius) return;
    const actionRank = BLAST_RADIUS_RANK[meta.blastRadius];
    if (actionRank === undefined) return;
    if (actionRank > declaredRank) {
      diag.push(error('RUNBOOK_DECLARED_BLAST_RADIUS_TOO_LOW', `steps[${i}]`,
        `Action "${step.type}/${step.action}" has blast radius "${meta.blastRadius}" ` +
        `(rank ${actionRank}) but Runbook declares risk.blastRadius "${declaredBlastRadius}" ` +
        `(rank ${declaredRank}). Declared scope is too narrow.`));
    }
  });
}

// ── Section: Production environment safety ───────────────────────────────────

function checkProductionEnvironmentSafety(runbook, context, diag) {
  const environments = runbook.scope?.environments || [];
  if (!environments.includes('production')) return;

  const riskLevel = runbook.risk?.level;
  const isHighRisk = riskLevel === RUNBOOK_RISK_LEVEL.HIGH || riskLevel === RUNBOOK_RISK_LEVEL.CRITICAL;

  if (isHighRisk) {
    const hasEnabledRollback = runbook.rollbackConfig?.enabled === true &&
      runbook.rollbackConfig?.strategy !== RUNBOOK_ROLLBACK_STRATEGY.NONE;
    const nonReversibleAcknowledged = runbook.rollbackConfig?.nonReversibleAcknowledged === true;

    if (!hasEnabledRollback && !nonReversibleAcknowledged) {
      diag.push(error('RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING', 'rollbackConfig',
        `HIGH/CRITICAL risk Runbook targeting production must have an enabled rollback strategy ` +
        'or explicitly set rollbackConfig.nonReversibleAcknowledged=true.'));
    }

    if (!(runbook.verification?.checks?.length > 0)) {
      diag.push(error('RUNBOOK_PRODUCTION_SAFETY_REQUIREMENT_MISSING', 'verification',
        'HIGH/CRITICAL risk Runbook targeting production must define verification checks.'));
    }
  }

  if (context.actionRegistry) {
    const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
    steps.forEach((step, i) => {
      const meta = context.actionRegistry.resolve(step.type, step.action);
      if (meta?.requiresConfirmation === true) {
        diag.push(error('RUNBOOK_HIGH_RISK_CONFIRMATION_REQUIRED', `steps[${i}]`,
          `Action "${step.type}/${step.action}" requires confirmation in production environments.`));
      }
    });
  }
}

// ── Section: Privilege metadata ──────────────────────────────────────────────

function checkPrivilegeMetadata(runbook, context, diag) {
  const production = isProduction(runbook, context);
  const target = effectiveTarget(runbook, context);
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    // Detect privileged raw-config param keys
    if (step.params) {
      for (const key of Object.keys(step.params)) {
        if (PRIVILEGED_KEY_RE.some(p => p.test(key))) {
          diag.push(error('RUNBOOK_EXCESSIVE_PRIVILEGE', `steps[${i}].params.${key}`,
            `Param key "${key}" suggests a privileged credential or configuration that must not ` +
            'appear inline in Runbook definitions.'));
        }
      }
    }

    if (!context.actionRegistry) return;
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta) return;

    if (Array.isArray(meta.privileges) && meta.privileges.includes('cluster-admin')) {
      if (production) {
        diag.push(error('RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW', `steps[${i}]`,
          `Action "${step.type}/${step.action}" requires cluster-admin privileges. ` +
          `Privileged actions require review before use in ${target} Runbooks.`));
      } else {
        diag.push(warning('RUNBOOK_PRIVILEGED_ACTION_REQUIRES_REVIEW', `steps[${i}]`,
          `Action "${step.type}/${step.action}" requires cluster-admin privileges. Review before promoting.`));
      }
    }
  });
}

// ── Section: Destructive action safety ──────────────────────────────────────

function checkDestructiveActionSafety(runbook, context, diag) {
  if (!context.actionRegistry) return;
  const production = isProduction(runbook, context);
  const target = effectiveTarget(runbook, context);
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta?.destructive) return;

    if (meta.reversible === false && production) {
      diag.push(error('RUNBOOK_IRREVERSIBLE_DESTRUCTIVE_ACTION', `steps[${i}]`,
        `Action "${step.type}/${step.action}" is destructive and irreversible. ` +
        `Irreversible destructive actions require explicit confirmation and review in ${target} Runbooks.`));
      return;
    }

    if (production) {
      const hasRollback = runbook.rollbackConfig?.enabled === true &&
        runbook.rollbackConfig?.strategy !== RUNBOOK_ROLLBACK_STRATEGY.NONE;
      if (!hasRollback) {
        diag.push(error('RUNBOOK_DESTRUCTIVE_ACTION_UNSAFE', `steps[${i}]`,
          `Action "${step.type}/${step.action}" is destructive. ` +
          `${target} Runbooks with destructive steps must define an enabled rollback strategy.`));
      }
    }
  });
}

// ── Section: Retry + security interaction ────────────────────────────────────

function checkRetrySecurityInteraction(runbook, context, diag) {
  if (!context.actionRegistry) return;
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const retry = step.retry;
    if (!retry || typeof retry !== 'object') return;
    const maxAttempts = typeof retry.maxAttempts === 'number' ? retry.maxAttempts : 1;
    if (maxAttempts <= 1) return;

    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta?.destructive) return;

    if (meta.retrySafe !== true) {
      diag.push(error('RUNBOOK_DESTRUCTIVE_RETRY_FORBIDDEN', `steps[${i}].retry`,
        `Action "${step.type}/${step.action}" is destructive and not declared retrySafe. ` +
        'Retrying a destructive action may amplify blast radius. Remove retry or mark handler retrySafe.'));
    }
  });
}

// ── Section: Output / audit data safety ─────────────────────────────────────

function checkOutputAuditSafety(runbook, context, diag) {
  if (!context.actionRegistry) return;
  const production = isProduction(runbook, context);
  const redactEnabled = runbook.auditConfig?.redactSensitiveValues === true;
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    if (!step.captureOutput) return;
    const meta = context.actionRegistry.resolve(step.type, step.action);
    if (!meta?.outputMayContainSecrets) return;
    if (!redactEnabled && production) {
      diag.push(error('RUNBOOK_SENSITIVE_OUTPUT_NOT_REDACTED', `steps[${i}]`,
        `Step "${step.id || i}" captures output from an action that may return sensitive values, ` +
        'but auditConfig.redactSensitiveValues is not enabled. Enable redaction before promoting.'));
    }
  });
}

// ── Section: Secret-capture exposure risk ────────────────────────────────────
// RUNBOOK_SECRET_EXPOSURE_RISK fires when a step captures its output AND
// at least one of its param values interpolates a SECRET_REFERENCE parameter.
// The concern: output may echo back the secret value passed as an argument.

function checkSecretCaptureExposureRisk(runbook, context, diag) {
  const secretParamNames = new Set(
    (runbook.parameters || [])
      .filter(p => p.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE)
      .map(p => p.name)
      .filter(Boolean),
  );
  if (secretParamNames.size === 0) return;

  const REF_RE = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

  function containsSecretRef(str) {
    if (typeof str !== 'string') return false;
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(str)) !== null) {
      if (secretParamNames.has(m[1])) return true;
    }
    return false;
  }

  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
  steps.forEach((step, i) => {
    if (!step.captureOutput) return;
    if (!step.params) return;
    for (const value of Object.values(step.params)) {
      if (containsSecretRef(value)) {
        diag.push(error('RUNBOOK_SECRET_EXPOSURE_RISK', `steps[${i}]`,
          `Step "${step.id || i}" captures output while passing a secret-reference parameter as an ` +
          'argument. Captured output may expose the secret value in audit logs or notifications.'));
        return; // one diagnostic per step is sufficient
      }
    }
  });
}

// ── Section: Notification safety ─────────────────────────────────────────────

function checkNotificationSafety(runbook, context, diag) {
  // Secret interpolation into notifications is covered by checkSecretInterpolation.
  // Here: scan notification endpoint URLs for embedded credentials.
  if (!runbook.notifications) return;

  const notifs = Array.isArray(runbook.notifications)
    ? runbook.notifications
    : [runbook.notifications];

  notifs.forEach((notif, i) => {
    if (typeof notif !== 'object' || notif === null) return;
    for (const field of ENDPOINT_FIELDS) {
      const urlStr = notif[field];
      if (typeof urlStr !== 'string') continue;
      const url = analyzeUrl(urlStr);
      if (!url) continue;
      if (url.username || url.password) {
        diag.push(error('RUNBOOK_NOTIFICATION_ENDPOINT_UNSAFE', `notifications[${i}].${field}`,
          `Notification endpoint contains embedded credentials. ` +
          `Use secret-reference parameters instead. URL: ${REDACTED}`));
      }
    }
  });
}

// ── Section: Tenant security boundary ────────────────────────────────────────

function checkTenantSecurityBoundary(runbook, context, diag) {
  const ownerType = runbook.owner?.ownerType;
  const runbookTenantId = runbook.tenantId;
  const ctxTenantId = context.tenantContext?.tenantId;

  // Tenant-authored definition claiming system ownership → escalation
  if (ownerType === RUNBOOK_OWNER_TYPE.SYSTEM && runbookTenantId && ctxTenantId) {
    diag.push(error('RUNBOOK_OWNERSHIP_ESCALATION_FORBIDDEN', 'owner',
      `Runbook carries ownerType "system" but has tenantId "${runbookTenantId}" in a tenant context. ` +
      'Tenant-owned definitions cannot declare system ownership.'));
  }

  if (ownerType === RUNBOOK_OWNER_TYPE.TENANT && ctxTenantId) {
    // Tenant mismatch
    if (runbookTenantId && runbookTenantId !== ctxTenantId) {
      diag.push(error('RUNBOOK_CROSS_TENANT_REFERENCE', 'tenantId',
        `Runbook tenantId "${runbookTenantId}" does not match security context tenantId "${ctxTenantId}".`));
    }

    // Steps targeting a different tenant
    const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
    steps.forEach((step, i) => {
      if (!step.params) return;
      const stepTenant = step.params.tenantId || step.params.tenant_id;
      if (typeof stepTenant === 'string' && stepTenant !== ctxTenantId) {
        diag.push(error('RUNBOOK_CROSS_TENANT_REFERENCE', `steps[${i}].params`,
          `Step targets tenant "${stepTenant}" but security context is "${ctxTenantId}".`));
      }
    });
  }

  // System Runbook hard-coding a tenant ID in step params
  if (ownerType === RUNBOOK_OWNER_TYPE.SYSTEM) {
    const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
    steps.forEach((step, i) => {
      if (!step.params) return;
      const stepTenant = step.params.tenantId || step.params.tenant_id;
      if (typeof stepTenant === 'string' && !stepTenant.startsWith('${')) {
        diag.push(error('RUNBOOK_CROSS_TENANT_REFERENCE', `steps[${i}].params`,
          `System Runbook hard-codes tenantId "${stepTenant}" in step params. ` +
          'Use a parameterized resource reference instead.'));
      }
    });
  }
}

// ── Section: Dangerous object keys (prototype pollution) ─────────────────────

function checkDangerousObjectKeys(runbook, context, diag) {
  const candidates = [
    { value: runbook.parameters, path: 'parameters' },
    { value: runbook.steps,      path: 'steps' },
    { value: runbook.preconditions, path: 'preconditions' },
    { value: runbook.verification, path: 'verification' },
    { value: runbook.rollbackConfig, path: 'rollbackConfig' },
    { value: runbook.notifications, path: 'notifications' },
  ];

  candidates.forEach(({ value, path }) => {
    if (!value) return;
    const found = findDangerousKeyPaths(value, path);
    found.forEach(kPath => {
      diag.push(error('RUNBOOK_DANGEROUS_OBJECT_KEY', kPath,
        `Dangerous key "${kPath.split('.').pop()}" detected. ` +
        'Keys such as "__proto__", "prototype", and "constructor" can cause prototype pollution.'));
    });
  });
}

// ── Section: Size / resource-exhaustion limits ────────────────────────────────

function checkSizeLimits(runbook, context, diag) {
  const limits = Object.assign({}, DEFAULT_LIMITS, context.securityLimits || {});

  const steps   = Array.isArray(runbook.steps) ? runbook.steps : [];
  const params  = Array.isArray(runbook.parameters) ? runbook.parameters : [];
  const rbSteps = runbook.rollbackConfig?.steps ?? [];
  const checks  = runbook.verification?.checks ?? [];
  const tags    = Array.isArray(runbook.tags) ? runbook.tags : [];
  const notifs  = Array.isArray(runbook.notifications)
    ? runbook.notifications
    : (runbook.notifications ? [runbook.notifications] : []);

  function limitError(field, count, max) {
    diag.push(error('RUNBOOK_SECURITY_LIMIT_EXCEEDED', field,
      `Runbook has ${count} ${field} (limit: ${max}).`));
  }

  if (steps.length  > limits.maxSteps)              limitError('steps', steps.length, limits.maxSteps);
  if (params.length > limits.maxParameters)          limitError('parameters', params.length, limits.maxParameters);
  if (rbSteps.length > limits.maxRollbackSteps)      limitError('rollbackConfig.steps', rbSteps.length, limits.maxRollbackSteps);
  if (checks.length > limits.maxVerificationChecks)  limitError('verification.checks', checks.length, limits.maxVerificationChecks);
  if (tags.length   > limits.maxTags)                limitError('tags', tags.length, limits.maxTags);
  if (notifs.length > limits.maxNotificationEntries) limitError('notifications', notifs.length, limits.maxNotificationEntries);

  // Nesting depth check on step params
  steps.forEach((step, i) => {
    if (!step.params) return;
    const depth = nestingDepth(step.params);
    if (depth > limits.maxNestingDepth) {
      diag.push(error('RUNBOOK_MAX_NESTING_EXCEEDED', `steps[${i}].params`,
        `Step params has nesting depth ${depth} (limit: ${limits.maxNestingDepth}).`));
    }
  });
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Validate security properties of a structurally and semantically valid Runbook.
 *
 * @param {object} runbook  – canonical runbook plain object
 * @param {object} context  – optional capability injection (see module header)
 * @returns {{ valid: boolean, diagnostics: readonly object[] }}
 */
function validateRunbookSecurity(runbook, context = {}) {
  if (runbook === null || typeof runbook !== 'object' || Array.isArray(runbook)) {
    throw new TypeError('validateRunbookSecurity: runbook must be a plain object');
  }

  const diag = [];

  checkArbitraryExecution(runbook, context, diag);
  checkActionAllowlistBoundary(runbook, context, diag);
  checkSecretSafety(runbook, context, diag);
  checkSecretInterpolation(runbook, context, diag);
  checkSecretCaptureExposureRisk(runbook, context, diag);
  checkNetworkHttpSafety(runbook, context, diag);
  checkResourceTargetSafety(runbook, context, diag);
  checkBlastRadiusThreshold(runbook, context, diag);
  checkBlastRadiusConsistency(runbook, context, diag);
  checkProductionEnvironmentSafety(runbook, context, diag);
  checkPrivilegeMetadata(runbook, context, diag);
  checkDestructiveActionSafety(runbook, context, diag);
  checkRetrySecurityInteraction(runbook, context, diag);
  checkOutputAuditSafety(runbook, context, diag);
  checkNotificationSafety(runbook, context, diag);
  checkTenantSecurityBoundary(runbook, context, diag);
  checkDangerousObjectKeys(runbook, context, diag);
  checkSizeLimits(runbook, context, diag);

  return buildResult(diag);
}

module.exports = {
  validateRunbookSecurity,
  // Export constants for tests and downstream consumers
  DEFAULT_LIMITS,
  DEFAULT_SECRET_REF_SCHEMES,
  BLAST_RADIUS_RANK,
};
