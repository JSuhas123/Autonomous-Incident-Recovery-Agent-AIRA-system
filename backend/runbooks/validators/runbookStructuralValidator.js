'use strict';

/**
 * AIRA Runbook Structural Validator
 *
 * Accepts a parsed runbook-like plain object and returns:
 *   { valid: boolean, diagnostics: Diagnostic[] }
 *
 * Rules:
 *  - Does NOT throw for ordinary validation failures.
 *  - Throws only for programmer errors (non-object input, internal assertion failures).
 *  - Does NOT depend on Mongoose or pre-save hooks.
 *  - Works for YAML imports, REST payloads, DB-loaded docs, system/tenant runbooks, CI.
 *  - Semantic concerns (action registry, handler existence) are deferred.
 */

const {
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_FAILURE_POLICY,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_PARAM_TYPE,
  RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_ROLLBACK_STRATEGY,
  RUNBOOK_OWNER_TYPE,
  RUNBOOK_ID_REGEX,
  SEMVER_REGEX,
  STEP_ID_REGEX,
  LIFECYCLE_VALUES,
  STEP_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  RISK_LEVEL_VALUES,
  PARAM_TYPE_VALUES,
  VERIFICATION_STRATEGY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  OWNER_TYPE_VALUES,
} = require('../../constants/runbook');

const { error, warning, buildResult } = require('./validationResult');

// ── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_API_VERSIONS = new Set([RUNBOOK_API_VERSION]);

// Timeout/delay bounds (seconds)
const STEP_TIMEOUT_MAX = 3600;   // 1 hour
const STEP_TIMEOUT_MIN = 1;
const RETRY_DELAY_MAX  = 3600;
const RETRY_BACKOFF_MAX = 100;
const VERIF_TIMEOUT_MAX = 3600;
const VERIF_INTERVAL_MAX = 3600;

// Legacy fields that should trigger a WARNING (not an error)
const LEGACY_STEP_FIELDS = new Set(['stepNumber', 'timeout', 'retryPolicy', 'onSuccess', 'onFailure']);
const LEGACY_ROOT_FIELDS = new Set(['incidentType', 'serviceId', 'autoTrigger', 'triggerConditions', 'rollback', 'successCriteria', 'executionHistory']);

// ── Internal helpers ────────────────────────────────────────────────────────

function isString(v) { return typeof v === 'string'; }
function isNonEmptyString(v) { return isString(v) && v.trim().length > 0; }
function isBoolean(v) { return typeof v === 'boolean'; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isPositiveInt(v) { return Number.isInteger(v) && v > 0; }
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isArray(v) { return Array.isArray(v); }

// ── Section validators ──────────────────────────────────────────────────────

function validateEnvelope(rb, diag) {
  // apiVersion
  if (!isNonEmptyString(rb.apiVersion)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'apiVersion', 'apiVersion is required'));
  } else if (!SUPPORTED_API_VERSIONS.has(rb.apiVersion)) {
    diag.push(error('RUNBOOK_INVALID_API_VERSION', 'apiVersion',
      `Unsupported apiVersion "${rb.apiVersion}". Supported: ${[...SUPPORTED_API_VERSIONS].join(', ')}`));
  }

  // kind
  if (!isNonEmptyString(rb.kind)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'kind', 'kind is required'));
  } else if (rb.kind !== RUNBOOK_KIND) {
    diag.push(error('RUNBOOK_INVALID_KIND', 'kind',
      `kind must be "${RUNBOOK_KIND}", got "${rb.kind}"`));
  }
}

function validateIdentity(rb, diag) {
  // name — required
  if (!isNonEmptyString(rb.name)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'name', 'name is required'));
  }

  // runbookId — optional but must match pattern if present
  if (rb.runbookId != null) {
    if (!isString(rb.runbookId) || !RUNBOOK_ID_REGEX.test(rb.runbookId)) {
      diag.push(error('RUNBOOK_INVALID_ID', 'runbookId',
        `runbookId "${rb.runbookId}" does not match pattern RB-{CATEGORY}-{NAME}[-{QUALIFIER}]`));
    }
  }

  // semver — optional but must be valid if present
  if (rb.semver != null) {
    if (!isString(rb.semver) || !SEMVER_REGEX.test(rb.semver)) {
      diag.push(error('RUNBOOK_INVALID_SEMVER', 'semver',
        `semver "${rb.semver}" is not a valid semantic version (e.g. 1.0.0, 2.3.1-beta.1)`));
    }
  }

  // ownership
  if (rb.owner != null) {
    if (!isPlainObject(rb.owner)) {
      diag.push(error('RUNBOOK_INVALID_OWNERSHIP', 'owner', 'owner must be an object'));
    } else {
      if (rb.owner.ownerType != null && !OWNER_TYPE_VALUES.includes(rb.owner.ownerType)) {
        diag.push(error('RUNBOOK_INVALID_OWNERSHIP', 'owner.ownerType',
          `owner.ownerType must be one of: ${OWNER_TYPE_VALUES.join(', ')}`));
      }
      if (rb.owner.name != null && !isNonEmptyString(rb.owner.name)) {
        diag.push(error('RUNBOOK_INVALID_OWNERSHIP', 'owner.name', 'owner.name must be a non-empty string'));
      }
    }
  }

  // tenantId conditional requirement
  const isSystemOwned = rb.owner && rb.owner.ownerType === RUNBOOK_OWNER_TYPE.SYSTEM;
  if (!isSystemOwned) {
    if (!isNonEmptyString(rb.tenantId)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'tenantId',
        'tenantId is required for tenant-owned runbooks (set owner.ownerType="system" to opt out)'));
    }
  }
}

function validateLifecycle(rb, diag) {
  if (rb.lifecycle != null) {
    if (!LIFECYCLE_VALUES.includes(rb.lifecycle)) {
      diag.push(error('RUNBOOK_INVALID_LIFECYCLE', 'lifecycle',
        `lifecycle "${rb.lifecycle}" is not valid. Must be one of: ${LIFECYCLE_VALUES.join(', ')}`));
    }
  }
}

function validateScope(rb, diag) {
  if (rb.scope == null) return;
  if (!isPlainObject(rb.scope)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'scope', 'scope must be an object'));
    return;
  }
  const scopeArrayFields = ['environments', 'providers', 'resourceTypes', 'services'];
  for (const field of scopeArrayFields) {
    if (rb.scope[field] != null) {
      if (!isArray(rb.scope[field])) {
        diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `scope.${field}`, `scope.${field} must be an array`));
      } else {
        rb.scope[field].forEach((v, i) => {
          if (!isNonEmptyString(v)) {
            diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `scope.${field}[${i}]`,
              `scope.${field}[${i}] must be a non-empty string`));
          }
        });
      }
    }
  }
}

function validateRisk(rb, diag) {
  if (rb.risk == null) return;
  if (!isPlainObject(rb.risk)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'risk', 'risk must be an object'));
    return;
  }
  if (rb.risk.level != null && !RISK_LEVEL_VALUES.includes(rb.risk.level)) {
    diag.push(error('RUNBOOK_INVALID_RISK', 'risk.level',
      `risk.level "${rb.risk.level}" is not valid. Must be one of: ${RISK_LEVEL_VALUES.join(', ')}`));
  }
  if (rb.risk.reversible != null && !isBoolean(rb.risk.reversible)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'risk.reversible', 'risk.reversible must be a boolean'));
  }
  if (rb.risk.blastRadius != null && !isNonEmptyString(rb.risk.blastRadius)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'risk.blastRadius', 'risk.blastRadius must be a non-empty string'));
  }
}

function validateParameters(rb, diag) {
  if (rb.parameters == null) return;
  if (!isArray(rb.parameters)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'parameters', 'parameters must be an array'));
    return;
  }

  const names = new Set();
  rb.parameters.forEach((p, i) => {
    const pfx = `parameters[${i}]`;
    if (!isPlainObject(p)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', pfx, 'each parameter must be an object'));
      return;
    }

    // name required + unique
    if (!isNonEmptyString(p.name)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.name`, 'parameter name is required'));
    } else {
      if (names.has(p.name)) {
        diag.push(error('RUNBOOK_DUPLICATE_PARAMETER', `${pfx}.name`,
          `duplicate parameter name "${p.name}"`));
      }
      names.add(p.name);
    }

    // type
    if (p.type != null && !PARAM_TYPE_VALUES.includes(p.type)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.type`,
        `parameter type "${p.type}" is not valid. Must be one of: ${PARAM_TYPE_VALUES.join(', ')}`));
    }

    // required boolean
    if (p.required != null && !isBoolean(p.required)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.required`, 'parameter.required must be a boolean'));
    }

    // allowedValues shape
    if (p.allowedValues != null && !isArray(p.allowedValues)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.allowedValues`, 'allowedValues must be an array'));
    }

    // enum type requires allowedValues
    if (p.type === RUNBOOK_PARAM_TYPE.ENUM) {
      if (!isArray(p.allowedValues) || p.allowedValues.length === 0) {
        diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.allowedValues`,
          'enum-typed parameters must have a non-empty allowedValues array'));
      }
    }

    // min/max valid and logically ordered
    if (p.min != null && !isNumber(p.min)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.min`, 'parameter.min must be a number'));
    }
    if (p.max != null && !isNumber(p.max)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.max`, 'parameter.max must be a number'));
    }
    if (isNumber(p.min) && isNumber(p.max) && p.min > p.max) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.min`,
        `parameter.min (${p.min}) must be <= parameter.max (${p.max})`));
    }

    // sensitive boolean
    if (p.sensitive != null && !isBoolean(p.sensitive)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.sensitive`, 'parameter.sensitive must be a boolean'));
    }

    // secret-reference cannot have a raw default
    if (p.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE && p.default != null) {
      diag.push(error('RUNBOOK_SECRET_VALUE_FORBIDDEN', `${pfx}.default`,
        'secret-reference parameters must not have a default value (would expose raw secret)'));
    }
  });
}

function validatePreconditions(rb, diag) {
  if (rb.preconditions == null) return;
  if (!isArray(rb.preconditions)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'preconditions', 'preconditions must be an array'));
    return;
  }

  const ids = new Set();
  rb.preconditions.forEach((pc, i) => {
    const pfx = `preconditions[${i}]`;
    if (!isPlainObject(pc)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', pfx, 'each precondition must be an object'));
      return;
    }

    // id uniqueness if present
    if (pc.id != null) {
      if (!isNonEmptyString(pc.id)) {
        diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.id`, 'precondition id must be a non-empty string'));
      } else if (ids.has(pc.id)) {
        diag.push(error('RUNBOOK_DUPLICATE_PRECONDITION', `${pfx}.id`,
          `duplicate precondition id "${pc.id}"`));
      } else {
        ids.add(pc.id);
      }
    }

    // check field — must be a non-empty string if present
    if (pc.check != null && !isNonEmptyString(pc.check)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.check`, 'precondition check must be a non-empty string'));
    }

    // params object
    if (pc.params != null && !isPlainObject(pc.params)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.params`, 'precondition params must be an object'));
    }

    // onFailure — validate against failure policy enum if present
    if (pc.onFailure != null && !FAILURE_POLICY_VALUES.includes(pc.onFailure)) {
      diag.push(error('RUNBOOK_INVALID_FAILURE_POLICY', `${pfx}.onFailure`,
        `precondition onFailure "${pc.onFailure}" is not valid. Must be one of: ${FAILURE_POLICY_VALUES.join(', ')}`));
    }
  });
}

function validateRetry(retry, pfx, diag) {
  if (!isPlainObject(retry)) {
    diag.push(error('RUNBOOK_INVALID_RETRY', `${pfx}.retry`, 'retry must be an object'));
    return;
  }
  if (retry.maxAttempts != null) {
    if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 10) {
      diag.push(error('RUNBOOK_INVALID_RETRY', `${pfx}.retry.maxAttempts`,
        `retry.maxAttempts must be an integer between 1 and 10, got ${retry.maxAttempts}`));
    }
  }
  if (retry.delaySeconds != null) {
    if (!isNumber(retry.delaySeconds) || retry.delaySeconds < 0 || retry.delaySeconds > RETRY_DELAY_MAX) {
      diag.push(error('RUNBOOK_INVALID_RETRY', `${pfx}.retry.delaySeconds`,
        `retry.delaySeconds must be between 0 and ${RETRY_DELAY_MAX}`));
    }
  }
  if (retry.backoffMultiplier != null) {
    if (!isNumber(retry.backoffMultiplier) || retry.backoffMultiplier < 1 || retry.backoffMultiplier > RETRY_BACKOFF_MAX) {
      diag.push(error('RUNBOOK_INVALID_RETRY', `${pfx}.retry.backoffMultiplier`,
        `retry.backoffMultiplier must be between 1 and ${RETRY_BACKOFF_MAX}`));
    }
  }
  if (retry.maxDelaySeconds != null) {
    if (!isNumber(retry.maxDelaySeconds) || retry.maxDelaySeconds < 0 || retry.maxDelaySeconds > RETRY_DELAY_MAX) {
      diag.push(error('RUNBOOK_INVALID_RETRY', `${pfx}.retry.maxDelaySeconds`,
        `retry.maxDelaySeconds must be between 0 and ${RETRY_DELAY_MAX}`));
    }
  }
}

function validateStepRollback(sr, pfx, diag) {
  if (!isPlainObject(sr)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.stepRollback`, 'stepRollback must be an object'));
    return;
  }
  if (!isNonEmptyString(sr.action)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.stepRollback.action`, 'stepRollback.action is required'));
  }
  if (sr.params != null && !isPlainObject(sr.params)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.stepRollback.params`, 'stepRollback.params must be an object'));
  }
  if (sr.timeoutSeconds != null) {
    if (!isNumber(sr.timeoutSeconds) || sr.timeoutSeconds < STEP_TIMEOUT_MIN || sr.timeoutSeconds > STEP_TIMEOUT_MAX) {
      diag.push(error('RUNBOOK_INVALID_TIMEOUT', `${pfx}.stepRollback.timeoutSeconds`,
        `stepRollback.timeoutSeconds must be between ${STEP_TIMEOUT_MIN} and ${STEP_TIMEOUT_MAX}`));
    }
  }
}

function validateSteps(rb, diag) {
  if (rb.steps == null) return;
  if (!isArray(rb.steps)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'steps', 'steps must be an array'));
    return;
  }

  const ids = new Set();
  const orders = [];

  rb.steps.forEach((step, i) => {
    const pfx = `steps[${i}]`;
    if (!isPlainObject(step)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', pfx, 'each step must be an object'));
      return;
    }

    // id uniqueness
    if (step.id != null) {
      if (!isString(step.id) || !STEP_ID_REGEX.test(step.id)) {
        diag.push(error('RUNBOOK_DUPLICATE_STEP', `${pfx}.id`,
          `step id "${step.id}" does not match pattern [a-z0-9][a-z0-9-]{0,63}`));
      } else if (ids.has(step.id)) {
        diag.push(error('RUNBOOK_DUPLICATE_STEP', `${pfx}.id`,
          `duplicate step id "${step.id}"`));
      } else {
        ids.add(step.id);
      }
    }

    // order
    if (step.order != null) {
      if (!isPositiveInt(step.order)) {
        diag.push(error('RUNBOOK_INVALID_STEP_ORDER', `${pfx}.order`,
          `step.order must be a positive integer, got ${step.order}`));
      } else {
        orders.push({ order: step.order, idx: i });
      }
    }

    // name required
    if (!isNonEmptyString(step.name)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.name`, 'step.name is required'));
    }

    // type required and valid
    if (!isNonEmptyString(step.type)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.type`, 'step.type is required'));
    } else if (!STEP_TYPE_VALUES.includes(step.type)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.type`,
        `step.type "${step.type}" is not valid. Must be one of: ${STEP_TYPE_VALUES.join(', ')}`));
    }

    // action required
    if (!isNonEmptyString(step.action)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.action`, 'step.action is required'));
    }

    // params object
    if (step.params != null && !isPlainObject(step.params)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.params`, 'step.params must be an object'));
    }

    // timeoutSeconds
    if (step.timeoutSeconds != null) {
      if (!isNumber(step.timeoutSeconds) || step.timeoutSeconds < STEP_TIMEOUT_MIN || step.timeoutSeconds > STEP_TIMEOUT_MAX) {
        diag.push(error('RUNBOOK_INVALID_TIMEOUT', `${pfx}.timeoutSeconds`,
          `step.timeoutSeconds must be between ${STEP_TIMEOUT_MIN} and ${STEP_TIMEOUT_MAX}`));
      }
    }

    // retry
    if (step.retry != null) {
      validateRetry(step.retry, pfx, diag);
    }

    // legacy retry policy warning
    if (step.retryPolicy != null) {
      diag.push(warning('RUNBOOK_DEPRECATED_FIELD', `${pfx}.retryPolicy`,
        'step.retryPolicy is deprecated; use step.retry instead'));
    }

    // requiresConfirmation boolean
    if (step.requiresConfirmation != null && !isBoolean(step.requiresConfirmation)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.requiresConfirmation`,
        'step.requiresConfirmation must be a boolean'));
    }

    // failurePolicy
    if (step.failurePolicy != null && !FAILURE_POLICY_VALUES.includes(step.failurePolicy)) {
      diag.push(error('RUNBOOK_INVALID_FAILURE_POLICY', `${pfx}.failurePolicy`,
        `step.failurePolicy "${step.failurePolicy}" is not valid. Must be one of: ${FAILURE_POLICY_VALUES.join(', ')}`));
    }

    // captureOutput boolean
    if (step.captureOutput != null && !isBoolean(step.captureOutput)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.captureOutput`, 'step.captureOutput must be a boolean'));
    }

    // reversible boolean
    if (step.reversible != null && !isBoolean(step.reversible)) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `${pfx}.reversible`, 'step.reversible must be a boolean'));
    }

    // stepRollback
    if (step.stepRollback != null) {
      validateStepRollback(step.stepRollback, pfx, diag);
    }

    // legacy field warnings
    for (const field of LEGACY_STEP_FIELDS) {
      if (field !== 'retryPolicy' && step[field] != null) {
        diag.push(warning('RUNBOOK_DEPRECATED_FIELD', `${pfx}.${field}`,
          `step.${field} is deprecated and will be removed in a future version`));
      }
    }
  });

  // Duplicate order detection
  const orderMap = new Map();
  for (const { order, idx } of orders) {
    if (orderMap.has(order)) {
      diag.push(error('RUNBOOK_INVALID_STEP_ORDER', `steps[${idx}].order`,
        `duplicate step order value ${order} (also used at steps[${orderMap.get(order)}])`));
    } else {
      orderMap.set(order, idx);
    }
  }
}

function validateVerification(rb, diag) {
  if (rb.verification == null) return;
  const v = rb.verification;
  if (!isPlainObject(v)) {
    diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification', 'verification must be an object'));
    return;
  }

  if (v.strategy != null && !VERIFICATION_STRATEGY_VALUES.includes(v.strategy)) {
    diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification.strategy',
      `verification.strategy "${v.strategy}" is not valid. Must be one of: ${VERIFICATION_STRATEGY_VALUES.join(', ')}`));
  }

  // checks
  const checks = v.checks;
  if (checks != null) {
    if (!isArray(checks)) {
      diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification.checks', 'verification.checks must be an array'));
    } else {
      const checkIds = new Set();
      checks.forEach((c, i) => {
        const pfx = `verification.checks[${i}]`;
        if (!isPlainObject(c)) {
          diag.push(error('RUNBOOK_INVALID_VERIFICATION', pfx, 'each verification check must be an object'));
          return;
        }
        if (c.id != null) {
          if (!isNonEmptyString(c.id)) {
            diag.push(error('RUNBOOK_INVALID_VERIFICATION', `${pfx}.id`, 'check id must be a non-empty string'));
          } else if (checkIds.has(c.id)) {
            diag.push(error('RUNBOOK_DUPLICATE_VERIFICATION_CHECK', `${pfx}.id`,
              `duplicate verification check id "${c.id}"`));
          } else {
            checkIds.add(c.id);
          }
        }
      });

      // QUORUM requirements
      if (v.strategy === RUNBOOK_VERIFICATION_STRATEGY.QUORUM) {
        const msChecks = v.minimumSuccessfulChecks;
        if (msChecks == null) {
          diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification.minimumSuccessfulChecks',
            'QUORUM strategy requires minimumSuccessfulChecks to be set'));
        } else {
          if (!isPositiveInt(msChecks)) {
            diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification.minimumSuccessfulChecks',
              `minimumSuccessfulChecks must be a positive integer, got ${msChecks}`));
          } else if (msChecks > checks.length) {
            diag.push(error('RUNBOOK_INVALID_VERIFICATION', 'verification.minimumSuccessfulChecks',
              `minimumSuccessfulChecks (${msChecks}) cannot exceed check count (${checks.length})`));
          }
        }
      }

      // ALL/ANY with contradictory quorum config
      if ((v.strategy === RUNBOOK_VERIFICATION_STRATEGY.ALL || v.strategy === RUNBOOK_VERIFICATION_STRATEGY.ANY)
          && v.minimumSuccessfulChecks != null) {
        diag.push(warning('RUNBOOK_INVALID_VERIFICATION', 'verification.minimumSuccessfulChecks',
          `minimumSuccessfulChecks is ignored for strategy "${v.strategy}"; only meaningful for QUORUM`));
      }
    }
  }

  // timeout / interval
  if (v.timeoutSeconds != null) {
    if (!isNumber(v.timeoutSeconds) || v.timeoutSeconds < 1 || v.timeoutSeconds > VERIF_TIMEOUT_MAX) {
      diag.push(error('RUNBOOK_INVALID_TIMEOUT', 'verification.timeoutSeconds',
        `verification.timeoutSeconds must be between 1 and ${VERIF_TIMEOUT_MAX}`));
    }
  }
  if (v.intervalSeconds != null) {
    if (!isNumber(v.intervalSeconds) || v.intervalSeconds < 1 || v.intervalSeconds > VERIF_INTERVAL_MAX) {
      diag.push(error('RUNBOOK_INVALID_TIMEOUT', 'verification.intervalSeconds',
        `verification.intervalSeconds must be between 1 and ${VERIF_INTERVAL_MAX}`));
    }
  }
}

function validateRollbackConfig(rb, diag) {
  if (rb.rollbackConfig == null) return;
  const rc = rb.rollbackConfig;
  if (!isPlainObject(rc)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', 'rollbackConfig', 'rollbackConfig must be an object'));
    return;
  }

  if (rc.enabled != null && !isBoolean(rc.enabled)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', 'rollbackConfig.enabled', 'rollbackConfig.enabled must be a boolean'));
  }

  if (rc.strategy != null && !ROLLBACK_STRATEGY_VALUES.includes(rc.strategy)) {
    diag.push(error('RUNBOOK_INVALID_ROLLBACK', 'rollbackConfig.strategy',
      `rollbackConfig.strategy "${rc.strategy}" is not valid. Must be one of: ${ROLLBACK_STRATEGY_VALUES.join(', ')}`));
  }

  // rollback steps
  if (rc.steps != null) {
    if (!isArray(rc.steps)) {
      diag.push(error('RUNBOOK_INVALID_ROLLBACK', 'rollbackConfig.steps', 'rollbackConfig.steps must be an array'));
    } else {
      const rbIds = new Set();
      const rbOrders = new Map();
      rc.steps.forEach((step, i) => {
        const pfx = `rollbackConfig.steps[${i}]`;
        if (!isPlainObject(step)) {
          diag.push(error('RUNBOOK_INVALID_ROLLBACK', pfx, 'each rollback step must be an object'));
          return;
        }

        if (step.id != null) {
          if (!isNonEmptyString(step.id)) {
            diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.id`, 'rollback step id must be a non-empty string'));
          } else if (rbIds.has(step.id)) {
            diag.push(error('RUNBOOK_DUPLICATE_ROLLBACK_STEP', `${pfx}.id`,
              `duplicate rollback step id "${step.id}"`));
          } else {
            rbIds.add(step.id);
          }
        }

        if (step.order != null) {
          if (!isPositiveInt(step.order)) {
            diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.order`,
              `rollback step.order must be a positive integer, got ${step.order}`));
          } else if (rbOrders.has(step.order)) {
            diag.push(error('RUNBOOK_DUPLICATE_ROLLBACK_STEP', `${pfx}.order`,
              `duplicate rollback step order ${step.order}`));
          } else {
            rbOrders.set(step.order, i);
          }
        }

        if (!isNonEmptyString(step.action)) {
          diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.action`, 'rollback step.action is required'));
        }

        if (step.params != null && !isPlainObject(step.params)) {
          diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.params`, 'rollback step.params must be an object'));
        }

        if (step.timeoutSeconds != null) {
          if (!isNumber(step.timeoutSeconds) || step.timeoutSeconds < STEP_TIMEOUT_MIN || step.timeoutSeconds > STEP_TIMEOUT_MAX) {
            diag.push(error('RUNBOOK_INVALID_ROLLBACK', `${pfx}.timeoutSeconds`,
              `rollback step.timeoutSeconds must be between ${STEP_TIMEOUT_MIN} and ${STEP_TIMEOUT_MAX}`));
          }
        }
      });
    }
  }

  // rollback verification — same shape as main verification
  if (rc.verification != null) {
    validateVerification({ verification: rc.verification }, diag);
  }
}

function validateNotifications(rb, diag) {
  if (rb.notifications == null) return;
  if (!isPlainObject(rb.notifications)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'notifications', 'notifications must be an object'));
    return;
  }
  const channels = ['onStart', 'onSuccess', 'onFailure', 'onRollback', 'onEscalation'];
  for (const ch of channels) {
    if (rb.notifications[ch] != null && !isArray(rb.notifications[ch])) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `notifications.${ch}`,
        `notifications.${ch} must be an array`));
    }
  }
}

function validateAuditConfig(rb, diag) {
  if (rb.auditConfig == null) return;
  if (!isPlainObject(rb.auditConfig)) {
    diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', 'auditConfig', 'auditConfig must be an object'));
    return;
  }
  const boolFields = ['recordInputs', 'recordOutputs', 'recordEvidence', 'redactSensitiveValues'];
  for (const field of boolFields) {
    if (rb.auditConfig[field] != null && !isBoolean(rb.auditConfig[field])) {
      diag.push(error('RUNBOOK_REQUIRED_FIELD_MISSING', `auditConfig.${field}`,
        `auditConfig.${field} must be a boolean`));
    }
  }
}

function validateLegacyFields(rb, diag) {
  for (const field of LEGACY_ROOT_FIELDS) {
    if (rb[field] != null) {
      diag.push(warning('RUNBOOK_DEPRECATED_FIELD', field,
        `"${field}" is a deprecated legacy field and will be removed in a future version`));
    }
  }

  // Warn if legacy `version` (numeric) is present and canonical `semver` is also present
  if (rb.version != null && rb.semver != null) {
    diag.push(warning('RUNBOOK_DEPRECATED_FIELD', 'version',
      'numeric "version" field is deprecated; "semver" is the canonical version authority'));
  }

  // Detect if legacy override could conflict with canonical values
  // e.g. if both `enabled` and `lifecycle` are present and inconsistent
  if (rb.enabled === false && rb.lifecycle === RUNBOOK_LIFECYCLE.ACTIVE) {
    diag.push(warning('RUNBOOK_DEPRECATED_FIELD', 'enabled',
      'enabled=false conflicts with lifecycle=ACTIVE; lifecycle is canonical — enabled is ignored'));
  }
  if (rb.enabled === true && rb.lifecycle === RUNBOOK_LIFECYCLE.DISABLED) {
    diag.push(warning('RUNBOOK_DEPRECATED_FIELD', 'enabled',
      'enabled=true conflicts with lifecycle=DISABLED; lifecycle is canonical — enabled is ignored'));
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate the structural integrity of a runbook-like plain object.
 *
 * @param {object} runbook - The parsed runbook (plain object, not a Mongoose doc).
 * @returns {{ valid: boolean, diagnostics: Diagnostic[] }}
 * @throws {TypeError} if runbook is not a plain object (programmer error).
 */
function validateRunbookStructure(runbook) {
  if (!isPlainObject(runbook)) {
    throw new TypeError(
      `validateRunbookStructure expects a plain object, got ${runbook === null ? 'null' : typeof runbook}`
    );
  }

  const diag = [];

  validateEnvelope(runbook, diag);
  validateIdentity(runbook, diag);
  validateLifecycle(runbook, diag);
  validateScope(runbook, diag);
  validateRisk(runbook, diag);
  validateParameters(runbook, diag);
  validatePreconditions(runbook, diag);
  validateSteps(runbook, diag);
  validateVerification(runbook, diag);
  validateRollbackConfig(runbook, diag);
  validateNotifications(runbook, diag);
  validateAuditConfig(runbook, diag);
  validateLegacyFields(runbook, diag);

  return buildResult(diag);
}

module.exports = { validateRunbookStructure };
