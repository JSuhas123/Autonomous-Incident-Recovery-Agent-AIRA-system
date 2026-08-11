'use strict';

/**
 * Runbook Semantic Validator
 *
 * Validates relationships, references, lifecycle readiness, and executable
 * meaning of a structurally valid canonical Runbook object.
 *
 * Precondition: the caller has already run validateRunbookStructure() and
 * received valid=true. This validator does NOT re-run structural checks.
 *
 * Contract:
 *   validateRunbookSemantics(runbook, context = {}) → { valid, diagnostics }
 *
 * Context (all fields optional — use dependency injection):
 *   actionRegistry       – { resolve(type, action) → { idempotent, retryable, builtinRollback } | null }
 *   preconditionRegistry – { resolve(check) → { params: string[] } | null }
 *   verificationRegistry – { resolve(check) → { params: string[] } | null }
 *   serviceResolver      – { resolve(serviceId) → boolean }
 *   secretResolverMetadata – unused here; reserved for Security Validator
 *   currentLifecycle     – string | undefined  (where the runbook currently sits)
 *   targetLifecycle      – string | undefined  (where the caller wants to move it)
 */

const { error, warning, buildResult } = require('./validationResult');
const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_ROLLBACK_STRATEGY,
  RUNBOOK_PARAM_TYPE,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── Unsafe step types that cannot be used in APPROVED/ACTIVE runbooks ──────
const UNSAFE_STEP_TYPES = new Set([
  RUNBOOK_STEP_TYPE.SHELL_LEGACY, // 'shell'
  RUNBOOK_STEP_TYPE.SCRIPT,       // 'script' — unrestricted; see note below
]);

// Lifecycle states that require production-grade semantics
const PRODUCTION_LIFECYCLES = new Set([
  RUNBOOK_LIFECYCLE.APPROVED,
  RUNBOOK_LIFECYCLE.ACTIVE,
]);

// Risk levels that require reversibility metadata for ACTIVE runbooks
const HIGH_RISK_LEVELS = new Set([
  RUNBOOK_RISK_LEVEL.HIGH,
  RUNBOOK_RISK_LEVEL.CRITICAL,
]);

// ── Parameter reference syntax ─────────────────────────────────────────────
// Canonical form: ${parameterName}
// parameterName must match [a-zA-Z_][a-zA-Z0-9_]* — identifiers only.
// No dots, spaces, operators, or expressions are permitted in v1.

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Scan a string for all parameter reference attempts (complete or malformed).
 * Returns an array of { raw, name, syntaxValid } objects:
 *   syntaxValid=true  → canonical ${identifier}; name is the identifier string
 *   syntaxValid=false → malformed syntax (wrong content, or unclosed ${)
 */
function extractRefAttempts(str) {
  if (typeof str !== 'string') return [];
  const results = [];

  // Pass 1 — find all complete ${...} blocks and validate their content
  const complete = /\$\{([^}]*)\}/g;
  let m;
  while ((m = complete.exec(str)) !== null) {
    const content = m[1];
    const syntaxValid = VALID_IDENTIFIER.test(content);
    results.push({ raw: m[0], name: syntaxValid ? content : null, syntaxValid });
  }

  // Pass 2 — detect unclosed ${ by removing complete refs and looking for any
  //           remaining ${ occurrences
  const withoutComplete = str.replace(/\$\{[^}]*\}/g, '');
  const unclosed = /\$\{/g;
  while ((m = unclosed.exec(withoutComplete)) !== null) {
    results.push({ raw: '${...', name: null, syntaxValid: false });
  }

  return results;
}

/**
 * Deep-walk an arbitrary value and collect all reference attempts from strings.
 */
function collectRefAttempts(value, seen = new WeakSet()) {
  if (typeof value === 'string') return extractRefAttempts(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return [];
    seen.add(value);
    return value.flatMap(v => collectRefAttempts(v, seen));
  }
  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return [];
    seen.add(value);
    return Object.values(value).flatMap(v => collectRefAttempts(v, seen));
  }
  return [];
}

/**
 * Determine the effective target lifecycle. When targetLifecycle is not
 * supplied, use the runbook's own lifecycle field.
 */
function effectiveTarget(runbook, context) {
  return (context.targetLifecycle) || runbook.lifecycle || RUNBOOK_LIFECYCLE.DRAFT;
}

/**
 * Returns true if the target lifecycle demands production-grade semantics.
 */
function isProductionTarget(runbook, context) {
  return PRODUCTION_LIFECYCLES.has(effectiveTarget(runbook, context));
}

// ── Section validators ─────────────────────────────────────────────────────

function validateLifecycleTransition(runbook, context, diag) {
  const { currentLifecycle, targetLifecycle } = context;
  if (!currentLifecycle || !targetLifecycle) return; // transition check only when both supplied
  if (currentLifecycle === targetLifecycle) return;  // same state is a no-op, not a transition

  const allowed = RUNBOOK_LIFECYCLE_TRANSITIONS[currentLifecycle];
  if (!allowed) {
    diag.push(error(
      'RUNBOOK_INVALID_LIFECYCLE_TRANSITION',
      'lifecycle',
      `Unknown currentLifecycle "${currentLifecycle}".`,
    ));
    return;
  }
  if (!allowed.includes(targetLifecycle)) {
    diag.push(error(
      'RUNBOOK_INVALID_LIFECYCLE_TRANSITION',
      'lifecycle',
      `Lifecycle transition ${currentLifecycle} → ${targetLifecycle} is not permitted. ` +
      `Allowed transitions from ${currentLifecycle}: [${allowed.join(', ') || 'none'}].`,
    ));
  }
}

function validateActionSemantics(runbook, context, diag) {
  const target = effectiveTarget(runbook, context);
  const production = PRODUCTION_LIFECYCLES.has(target);
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const path = `steps[${i}]`;
    const { type, action } = step;

    // Unsafe type check
    if (UNSAFE_STEP_TYPES.has(type)) {
      if (production) {
        diag.push(error(
          'RUNBOOK_UNSAFE_ACTION_TYPE',
          path,
          `Step type "${type}" is not permitted in ${target} runbooks. ` +
          'Migrate to a registered action handler before promoting.',
        ));
      } else {
        diag.push(warning(
          'RUNBOOK_UNSAFE_ACTION_TYPE',
          path,
          `Step type "${type}" will prevent promotion to APPROVED/ACTIVE.`,
        ));
      }
    }

    // Registry resolution
    if (context.actionRegistry && type && action) {
      const resolved = context.actionRegistry.resolve(type, action);
      if (!resolved) {
        // Secondary lookup: check if the action exists under a different type
        const crossType = context.actionRegistry.resolveByAction?.(action);
        if (crossType && crossType.type && crossType.type !== type) {
          diag.push(error(
            'RUNBOOK_ACTION_TYPE_MISMATCH',
            path,
            `Action "${action}" is registered under type "${crossType.type}" but step declares type "${type}".`,
          ));
        } else if (production) {
          diag.push(error(
            'RUNBOOK_UNKNOWN_ACTION',
            path,
            `Action "${type}/${action}" is not registered. Unknown actions are not permitted in ${target} runbooks.`,
          ));
        } else {
          diag.push(warning(
            'RUNBOOK_UNKNOWN_ACTION',
            path,
            `Action "${type}/${action}" is not registered. This will prevent promotion to APPROVED/ACTIVE.`,
          ));
        }
      } else if (resolved.type && resolved.type !== type) {
        diag.push(error(
          'RUNBOOK_ACTION_TYPE_MISMATCH',
          path,
          `Action "${action}" is registered under type "${resolved.type}" but step declares type "${type}".`,
        ));
      }
    }

    // WAIT step: timeout must exceed wait duration if both are present
    if (type === RUNBOOK_STEP_TYPE.WAIT) {
      const waitDuration = step.waitSeconds || step.durationSeconds;
      if (waitDuration && step.timeoutSeconds && step.timeoutSeconds <= waitDuration) {
        diag.push(error(
          'RUNBOOK_STEP_CONFIGURATION_INVALID',
          path,
          `WAIT step timeoutSeconds (${step.timeoutSeconds}) must be greater than ` +
          `waitDuration (${waitDuration}).`,
        ));
      }
    }

    // NOTIFICATION step: must not be rollback-only unless handler allows it
    if (type === RUNBOOK_STEP_TYPE.NOTIFICATION && step.rollbackOnly === true) {
      if (!context.actionRegistry) {
        diag.push(warning(
          'RUNBOOK_STEP_CONFIGURATION_INVALID',
          path,
          'NOTIFICATION step is marked rollbackOnly but no actionRegistry is available to verify handler support.',
        ));
      }
    }

    // Reversibility consistency
    if (step.reversible === true) {
      const hasStepRollback = step.rollback && typeof step.rollback === 'object';
      const handlerHasBuiltinRollback = context.actionRegistry &&
        context.actionRegistry.resolve(type, action)?.builtinRollback === true;
      if (!hasStepRollback && !handlerHasBuiltinRollback && production) {
        diag.push(error(
          'RUNBOOK_ROLLBACK_MISSING',
          path,
          `Step is marked reversible=true but has no step-level rollback and no ` +
          `handler built-in rollback capability. Required for ${target}.`,
        ));
      }
    }

    if (step.reversible === false && step.rollback) {
      diag.push(error(
        'RUNBOOK_REVERSIBILITY_INCONSISTENT',
        path,
        'Step declares reversible=false but also defines a rollback action. ' +
        'These are contradictory.',
      ));
    }
  });
}

function validateRetrySemantics(runbook, context, diag) {
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    const { retry, type, action } = step;
    if (!retry || typeof retry !== 'object') return;

    const path = `steps[${i}].retry`;
    const { maxAttempts = 1, delaySeconds = 0, backoffMultiplier = 1 } = retry;

    // Registry: check idempotency / retryability
    if (context.actionRegistry && type && action) {
      const meta = context.actionRegistry.resolve(type, action);
      if (meta) {
        if (meta.retryable === false) {
          diag.push(error(
            'RUNBOOK_RETRY_NOT_ALLOWED',
            path,
            `Action "${type}/${action}" is explicitly marked non-retryable by handler metadata.`,
          ));
        } else if (meta.idempotent === false) {
          diag.push(error(
            'RUNBOOK_NON_IDEMPOTENT_RETRY',
            path,
            `Action "${type}/${action}" is non-idempotent. Enabling retry risks duplicate side-effects. ` +
            'Mark the handler idempotent or remove retry.',
          ));
        }
      }
    }

    // Retry schedule vs timeout
    if (step.timeoutSeconds && maxAttempts > 1) {
      // Total potential time: sum of all delays between attempts
      // delays: [d, d*m, d*m^2, ...] for (maxAttempts-1) gaps
      let totalDelay = 0;
      let d = delaySeconds;
      for (let a = 1; a < maxAttempts; a++) {
        totalDelay += d;
        d = d * backoffMultiplier;
      }
      if (totalDelay >= step.timeoutSeconds) {
        diag.push(error(
          'RUNBOOK_RETRY_EXCEEDS_TIMEOUT',
          path,
          `Calculated retry delay schedule (${totalDelay}s) meets or exceeds ` +
          `step timeoutSeconds (${step.timeoutSeconds}s). Increase timeout or reduce retry delays.`,
        ));
      }
    }

    // maxAttempts > 1 with zero delay is suspicious but allowed if explicitly set
    // (no additional rule needed — the spec says "only if explicitly allowed", and
    //  the caller is making an explicit choice by setting maxAttempts > 1)
  });
}

function validatePreconditionSemantics(runbook, context, diag) {
  const production = isProductionTarget(runbook, context);
  const preconditions = Array.isArray(runbook.preconditions) ? runbook.preconditions : [];
  const paramNames = buildParamNameSet(runbook);

  preconditions.forEach((pre, i) => {
    const path = `preconditions[${i}]`;
    const { check } = pre;
    if (!check) return; // structural validator already caught this

    if (context.preconditionRegistry) {
      const meta = context.preconditionRegistry.resolve(check);
      if (!meta) {
        if (production) {
          diag.push(error(
            'RUNBOOK_UNKNOWN_PRECONDITION',
            path,
            `Precondition check "${check}" is not registered. Unknown checks are not permitted in ${effectiveTarget(runbook, context)} runbooks.`,
          ));
        } else {
          diag.push(warning(
            'RUNBOOK_UNKNOWN_PRECONDITION',
            path,
            `Precondition check "${check}" is not registered. This will prevent promotion to APPROVED/ACTIVE.`,
          ));
        }
      } else if (Array.isArray(meta.params)) {
        // Verify required params are supplied in precondition params object
        const suppliedParams = pre.params || {};
        meta.params.forEach(requiredParam => {
          if (!(requiredParam in suppliedParams)) {
            diag.push(error(
              'RUNBOOK_PRECONDITION_PARAMETER_MISSING',
              `${path}.params`,
              `Precondition check "${check}" requires parameter "${requiredParam}" but it is not supplied.`,
            ));
          }
        });
      }
    }

    // Validate parameter references in precondition params values
    if (pre.params && typeof pre.params === 'object') {
      validateParamRefsInValue(pre.params, `${path}.params`, paramNames, runbook, diag);
    }
  });
}

function validateParameterSemantics(runbook, _context, diag) {
  const params = Array.isArray(runbook.parameters) ? runbook.parameters : [];

  params.forEach((param, i) => {
    const path = `parameters[${i}]`;
    const { type, default: defaultVal, min, max, allowedValues } = param;

    // Enum: default must be in allowedValues
    if (type === RUNBOOK_PARAM_TYPE.ENUM && defaultVal !== undefined) {
      if (Array.isArray(allowedValues) && !allowedValues.includes(defaultVal)) {
        diag.push(error(
          'RUNBOOK_INVALID_PARAMETER_DEFAULT',
          path,
          `Parameter "${param.name}" default value "${defaultVal}" is not in allowedValues [${allowedValues.join(', ')}].`,
        ));
      }
    }

    // Number: default within range
    if (type === RUNBOOK_PARAM_TYPE.NUMBER && defaultVal !== undefined) {
      if (min !== undefined && defaultVal < min) {
        diag.push(error(
          'RUNBOOK_INVALID_PARAMETER_DEFAULT',
          path,
          `Parameter "${param.name}" default (${defaultVal}) is less than min (${min}).`,
        ));
      }
      if (max !== undefined && defaultVal > max) {
        diag.push(error(
          'RUNBOOK_INVALID_PARAMETER_DEFAULT',
          path,
          `Parameter "${param.name}" default (${defaultVal}) is greater than max (${max}).`,
        ));
      }
    }

    // min <= max (structural checks bounds individually; semantic checks relationship)
    if (type === RUNBOOK_PARAM_TYPE.NUMBER && min !== undefined && max !== undefined && min > max) {
      diag.push(error(
        'RUNBOOK_INVALID_PARAMETER_RANGE',
        path,
        `Parameter "${param.name}" has min (${min}) greater than max (${max}).`,
      ));
    }

    // sourceHints: if present and schema defines known categories, validate
    if (param.sourceHints) {
      const KNOWN_SOURCES = new Set(['user-input', 'env', 'vault', 'service-catalog', 'resource-catalog']);
      const hints = Array.isArray(param.sourceHints) ? param.sourceHints : [param.sourceHints];
      hints.forEach(hint => {
        if (typeof hint === 'string' && !KNOWN_SOURCES.has(hint)) {
          diag.push(warning(
            'RUNBOOK_UNKNOWN_PARAMETER_SOURCE',
            path,
            `Parameter "${param.name}" sourceHint "${hint}" is not a known source category.`,
          ));
        }
      });
    }
  });
}

/**
 * Build a Set of declared parameter names for reference validation.
 */
function buildParamNameSet(runbook) {
  const params = Array.isArray(runbook.parameters) ? runbook.parameters : [];
  return new Set(params.map(p => p.name).filter(Boolean));
}

/**
 * Build a Set of secret-reference parameter names.
 */
function buildSecretParamSet(runbook) {
  const params = Array.isArray(runbook.parameters) ? runbook.parameters : [];
  return new Set(
    params
      .filter(p => p.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE)
      .map(p => p.name)
      .filter(Boolean),
  );
}

/**
 * Validate all parameter reference attempts within an arbitrary value tree.
 * Emits RUNBOOK_INVALID_PARAMETER_REFERENCE for malformed syntax,
 * RUNBOOK_UNKNOWN_PARAMETER_REFERENCE for valid syntax with undeclared names,
 * and RUNBOOK_SECRET_REFERENCE_EXPOSURE when a secret-reference param appears
 * in a field that may surface the value in plain text.
 */
function validateParamRefsInValue(value, path, paramNames, runbook, diag, secretExposureCheck = false) {
  const attempts = collectRefAttempts(value);
  const secretParams = secretExposureCheck ? buildSecretParamSet(runbook) : new Set();

  attempts.forEach(({ raw, name, syntaxValid }) => {
    if (!syntaxValid) {
      diag.push(error(
        'RUNBOOK_INVALID_PARAMETER_REFERENCE',
        path,
        `Malformed parameter reference "${raw}". ` +
        'Canonical syntax is ${parameterName} where parameterName is [a-zA-Z_][a-zA-Z0-9_]*.',
      ));
    } else if (!paramNames.has(name)) {
      diag.push(error(
        'RUNBOOK_UNKNOWN_PARAMETER_REFERENCE',
        path,
        `Reference "\${${name}}" does not match any declared parameter.`,
      ));
    } else if (secretExposureCheck && secretParams.has(name)) {
      diag.push(error(
        'RUNBOOK_SECRET_REFERENCE_EXPOSURE',
        path,
        `Secret-reference parameter "${name}" must not be interpolated into fields ` +
        'that may be logged or transmitted in plain text.',
      ));
    }
  });
}

function validateParameterReferences(runbook, _context, diag) {
  const paramNames = buildParamNameSet(runbook);
  const steps = Array.isArray(runbook.steps) ? runbook.steps : [];

  steps.forEach((step, i) => {
    // step.params object — values may contain references; notification messages are secret-exposure candidates
    if (step.params) {
      const isNotification = step.type === RUNBOOK_STEP_TYPE.NOTIFICATION;
      validateParamRefsInValue(step.params, `steps[${i}].params`, paramNames, runbook, diag, isNotification);
    }
    // step.rollback params
    if (step.rollback && step.rollback.params) {
      validateParamRefsInValue(step.rollback.params, `steps[${i}].rollback.params`, paramNames, runbook, diag, false);
    }
  });

  // Rollback config steps
  if (runbook.rollbackConfig && Array.isArray(runbook.rollbackConfig.steps)) {
    runbook.rollbackConfig.steps.forEach((rbStep, i) => {
      if (rbStep.params) {
        validateParamRefsInValue(rbStep.params, `rollbackConfig.steps[${i}].params`, paramNames, runbook, diag, false);
      }
    });
  }

  // Verification checks
  if (runbook.verification && Array.isArray(runbook.verification.checks)) {
    runbook.verification.checks.forEach((chk, i) => {
      if (chk.params) {
        validateParamRefsInValue(chk.params, `verification.checks[${i}].params`, paramNames, runbook, diag, false);
      }
    });
  }

  // Notification config (top-level, if schema has it)
  if (runbook.notifications) {
    validateParamRefsInValue(runbook.notifications, 'notifications', paramNames, runbook, diag, true);
  }
}

function validateVerificationSemantics(runbook, context, diag) {
  const target = effectiveTarget(runbook, context);
  const production = PRODUCTION_LIFECYCLES.has(target);
  const paramNames = buildParamNameSet(runbook);

  // Require verification for APPROVED/ACTIVE runbooks unless category exempt
  if (production) {
    const hasVerification = runbook.verification &&
      Array.isArray(runbook.verification.checks) &&
      runbook.verification.checks.length > 0;

    if (!hasVerification && runbook.category !== 'notification-only') {
      diag.push(error(
        'RUNBOOK_VERIFICATION_REQUIRED',
        'verification',
        `${target} runbooks must define at least one verification check to confirm recovery success.`,
      ));
    }
  }

  const checks = runbook.verification?.checks;
  if (!Array.isArray(checks)) return;

  checks.forEach((chk, i) => {
    const path = `verification.checks[${i}]`;

    if (context.verificationRegistry && chk.check) {
      const meta = context.verificationRegistry.resolve(chk.check);
      if (!meta) {
        if (production) {
          diag.push(error(
            'RUNBOOK_UNKNOWN_VERIFICATION_CHECK',
            path,
            `Verification check "${chk.check}" is not registered. Unknown checks are not permitted in ${target} runbooks.`,
          ));
        } else {
          diag.push(warning(
            'RUNBOOK_UNKNOWN_VERIFICATION_CHECK',
            path,
            `Verification check "${chk.check}" is not registered. This will prevent promotion.`,
          ));
        }
      } else if (Array.isArray(meta.params)) {
        const supplied = chk.params || {};
        meta.params.forEach(requiredParam => {
          if (!(requiredParam in supplied)) {
            diag.push(error(
              'RUNBOOK_VERIFICATION_PARAMETER_MISSING',
              `${path}.params`,
              `Verification check "${chk.check}" requires parameter "${requiredParam}" but it is not supplied.`,
            ));
          }
        });
      }
    }

    if (chk.params) {
      validateParamRefsInValue(chk.params, `${path}.params`, paramNames, runbook, diag, false);
    }
  });
}

function validateRollbackSemantics(runbook, context, diag) {
  const target = effectiveTarget(runbook, context);
  const production = PRODUCTION_LIFECYCLES.has(target);
  const paramNames = buildParamNameSet(runbook);
  const rc = runbook.rollbackConfig;

  if (!rc || typeof rc !== 'object') return; // structural validator already caught this

  const strategy = rc.strategy;

  if (strategy === RUNBOOK_ROLLBACK_STRATEGY.REVERSE_STEPS && rc.enabled) {
    // At least one step must be reversible or have handler built-in rollback
    const steps = Array.isArray(runbook.steps) ? runbook.steps : [];
    const hasReversibleStep = steps.some(s => {
      if (s.reversible === true) return true;
      if (context.actionRegistry && s.type && s.action) {
        return context.actionRegistry.resolve(s.type, s.action)?.builtinRollback === true;
      }
      return false;
    });
    if (!hasReversibleStep && production) {
      diag.push(error(
        'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID',
        'rollbackConfig',
        'REVERSE_STEPS strategy requires at least one reversible step or a step with built-in handler rollback.',
      ));
    }
  }

  if (strategy === RUNBOOK_ROLLBACK_STRATEGY.EXPLICIT_STEPS) {
    if (!Array.isArray(rc.steps) || rc.steps.length === 0) {
      diag.push(error(
        'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID',
        'rollbackConfig.steps',
        'EXPLICIT_STEPS strategy requires at least one rollback step in rollbackConfig.steps.',
      ));
    }
  }

  if (strategy === RUNBOOK_ROLLBACK_STRATEGY.NONE) {
    if (Array.isArray(rc.steps) && rc.steps.length > 0) {
      diag.push(error(
        'RUNBOOK_ROLLBACK_CONFIGURATION_INVALID',
        'rollbackConfig.steps',
        'NONE rollback strategy must not define rollback steps.',
      ));
    }
  }

  // Validate each explicit rollback step
  if (Array.isArray(rc.steps)) {
    rc.steps.forEach((rbStep, i) => {
      const path = `rollbackConfig.steps[${i}]`;

      if (context.actionRegistry && rbStep.type && rbStep.action) {
        const meta = context.actionRegistry.resolve(rbStep.type, rbStep.action);
        if (!meta && production) {
          diag.push(error(
            'RUNBOOK_UNKNOWN_ROLLBACK_ACTION',
            path,
            `Rollback action "${rbStep.type}/${rbStep.action}" is not registered.`,
          ));
        }
      }

      if (rbStep.params) {
        validateParamRefsInValue(rbStep.params, `${path}.params`, paramNames, runbook, diag, false);
        // Check for unknown refs
      }
    });
  }

  // HIGH/CRITICAL risk + ACTIVE + non-reversible is a semantic concern
  if (
    runbook.risk &&
    HIGH_RISK_LEVELS.has(runbook.risk.level) &&
    target === RUNBOOK_LIFECYCLE.ACTIVE &&
    strategy === RUNBOOK_ROLLBACK_STRATEGY.NONE
  ) {
    diag.push(error(
      'RUNBOOK_HIGH_RISK_NONREVERSIBLE',
      'rollbackConfig',
      `Runbook has risk level ${runbook.risk.level} but rollback strategy is NONE. ` +
      'ACTIVE runbooks at HIGH/CRITICAL risk must define a rollback strategy or include escalation metadata.',
    ));
  }
}

function validateScopeSemantics(runbook, context, diag) {
  if (!context.serviceResolver) return;
  const services = runbook.scope?.services;
  if (!Array.isArray(services)) return;

  services.forEach((svcId, i) => {
    if (typeof svcId !== 'string') return;
    if (!context.serviceResolver.resolve(svcId)) {
      diag.push(error(
        'RUNBOOK_UNKNOWN_SCOPE_REFERENCE',
        `scope.services[${i}]`,
        `Service "${svcId}" could not be resolved. Verify the service ID is correct for this tenant/environment.`,
      ));
    }
  });
}

function validateOwnershipSemantics(runbook, context, diag) {
  const ownerType = runbook.owner?.ownerType;
  const target = effectiveTarget(runbook, context);

  // System runbooks: must not reference tenant-private resources directly in scope
  if (ownerType === RUNBOOK_OWNER_TYPE.SYSTEM) {
    const services = runbook.scope?.services;
    // Heuristic: tenant-private service IDs contain a tenantId segment
    // Full enforcement requires serviceResolver; warn if no registry
    if (Array.isArray(services) && services.length > 0 && !context.serviceResolver) {
      diag.push(warning(
        'RUNBOOK_SYSTEM_TENANT_REFERENCE',
        'scope.services',
        'System runbook references scope services but no serviceResolver is available to verify ' +
        'these are not tenant-private resources. Use parameterized resource references instead.',
      ));
    }
    if (context.serviceResolver && Array.isArray(services)) {
      services.forEach((svcId, i) => {
        if (typeof svcId === 'string' && context.serviceResolver.isTenantPrivate?.(svcId)) {
          diag.push(error(
            'RUNBOOK_SYSTEM_TENANT_REFERENCE',
            `scope.services[${i}]`,
            `System runbook must not reference tenant-private service "${svcId}". ` +
            'Use a resource-reference parameter instead.',
          ));
        }
      });
    }
  }

  // Tenant runbooks: tenantId must match any tenant context supplied
  if (ownerType === RUNBOOK_OWNER_TYPE.TENANT && context.tenantId) {
    if (runbook.tenantId && runbook.tenantId !== context.tenantId) {
      diag.push(error(
        'RUNBOOK_TENANT_SCOPE_MISMATCH',
        'tenantId',
        `Runbook tenantId "${runbook.tenantId}" does not match validation context tenantId "${context.tenantId}".`,
      ));
    }
  }
}

function validateApprovedActiveReadiness(runbook, context, diag) {
  const target = effectiveTarget(runbook, context);
  if (!PRODUCTION_LIFECYCLES.has(target)) return;

  // Unsafe step types already handled in validateActionSemantics.
  // Here we apply a top-level gate: if no actionRegistry was supplied, warn
  // that action resolution was skipped.
  if (!context.actionRegistry) {
    diag.push(warning(
      'RUNBOOK_UNKNOWN_ACTION',
      'steps',
      `No actionRegistry was supplied. Action handler resolution was skipped for ${target} readiness check.`,
    ));
  }
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Validate semantic correctness of a structurally valid Runbook.
 *
 * @param {object} runbook  – canonical runbook plain object
 * @param {object} context  – optional capability injection (see module header)
 * @returns {{ valid: boolean, diagnostics: readonly object[] }}
 */
function validateRunbookSemantics(runbook, context = {}) {
  if (runbook === null || typeof runbook !== 'object' || Array.isArray(runbook)) {
    throw new TypeError('validateRunbookSemantics: runbook must be a plain object');
  }

  const diag = [];

  validateLifecycleTransition(runbook, context, diag);
  validateActionSemantics(runbook, context, diag);
  validateRetrySemantics(runbook, context, diag);
  validatePreconditionSemantics(runbook, context, diag);
  validateParameterSemantics(runbook, context, diag);
  validateParameterReferences(runbook, context, diag);
  validateVerificationSemantics(runbook, context, diag);
  validateRollbackSemantics(runbook, context, diag);
  validateScopeSemantics(runbook, context, diag);
  validateOwnershipSemantics(runbook, context, diag);
  validateApprovedActiveReadiness(runbook, context, diag);

  return buildResult(diag);
}

module.exports = { validateRunbookSemantics };
