'use strict';

/**
 * Runbook canonical constants — single source of truth for all enums and
 * identifier patterns used across models, services, and validators.
 */

const RUNBOOK_API_VERSION = 'aira.io/v1';
const RUNBOOK_KIND = 'Runbook';

// ── Lifecycle ──────────────────────────────────────────────────────────────
const RUNBOOK_LIFECYCLE = Object.freeze({
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  DISABLED: 'DISABLED',
});

// Lifecycle transitions that are permitted.
// DISABLED → DRAFT is the only recovery path; re-activation requires full
// re-approval (DRAFT → VALIDATED → APPROVED → ACTIVE).
const RUNBOOK_LIFECYCLE_TRANSITIONS = Object.freeze({
  DRAFT: ['VALIDATED', 'DISABLED'],
  VALIDATED: ['APPROVED', 'DRAFT', 'DISABLED'],
  APPROVED: ['ACTIVE', 'VALIDATED', 'DISABLED'],
  ACTIVE: ['DEPRECATED', 'DISABLED'],
  DEPRECATED: ['DISABLED'],
  DISABLED: ['DRAFT'],
});

// ── Step types ─────────────────────────────────────────────────────────────
const RUNBOOK_STEP_TYPE = Object.freeze({
  KUBERNETES: 'kubernetes',
  API: 'api',
  NOTIFICATION: 'notification',
  WAIT: 'wait',
  SCRIPT: 'script',
  // Domain-specific types — handler implementations may not exist yet.
  // Steps with these types require a registered handler to reach APPROVED/ACTIVE.
  DATABASE: 'database',
  CLOUD: 'cloud',
  CACHE: 'cache',
  MESSAGING: 'messaging',
  HTTP: 'http',
  NETWORK: 'network',
  ANALYTICS: 'analytics',
  METRICS: 'metrics',
  SERVICE: 'service',
  // 'shell' is retained in the DB enum only for backward compatibility.
  // It is NOT executable in the v1 runtime. Any step with this type must be
  // migrated explicitly before the runbook can reach APPROVED lifecycle state.
  SHELL_LEGACY: 'shell',
});

// Types that are safe to execute in the v1 runtime (when handler is registered)
const RUNBOOK_SAFE_STEP_TYPES = Object.freeze(new Set([
  RUNBOOK_STEP_TYPE.KUBERNETES,
  RUNBOOK_STEP_TYPE.API,
  RUNBOOK_STEP_TYPE.NOTIFICATION,
  RUNBOOK_STEP_TYPE.WAIT,
  RUNBOOK_STEP_TYPE.SCRIPT,
  RUNBOOK_STEP_TYPE.DATABASE,
  RUNBOOK_STEP_TYPE.CLOUD,
  RUNBOOK_STEP_TYPE.CACHE,
  RUNBOOK_STEP_TYPE.MESSAGING,
  RUNBOOK_STEP_TYPE.HTTP,
  RUNBOOK_STEP_TYPE.NETWORK,
  RUNBOOK_STEP_TYPE.ANALYTICS,
  RUNBOOK_STEP_TYPE.METRICS,
  RUNBOOK_STEP_TYPE.SERVICE,
]));

// ── Failure policies ───────────────────────────────────────────────────────
const RUNBOOK_FAILURE_POLICY = Object.freeze({
  STOP: 'STOP',       // halt execution, mark failed
  CONTINUE: 'CONTINUE', // log failure, proceed to next step
  ROLLBACK: 'ROLLBACK', // halt and trigger rollback chain
  ESCALATE: 'ESCALATE', // halt and raise escalation alert
});

// ── Risk levels ────────────────────────────────────────────────────────────
const RUNBOOK_RISK_LEVEL = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

// ── Parameter types ────────────────────────────────────────────────────────
const RUNBOOK_PARAM_TYPE = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ENUM: 'enum',
  DURATION: 'duration',
  RESOURCE_REFERENCE: 'resource-reference',
  // Stores a reference key, NOT the secret value itself
  SECRET_REFERENCE: 'secret-reference',
});

// ── Verification ───────────────────────────────────────────────────────────
const RUNBOOK_VERIFICATION_STRATEGY = Object.freeze({
  ALL: 'ALL',       // all checks must pass
  ANY: 'ANY',       // at least one check must pass
  QUORUM: 'QUORUM', // minimumSuccessfulChecks must pass
});

// ── Rollback ───────────────────────────────────────────────────────────────
const RUNBOOK_ROLLBACK_STRATEGY = Object.freeze({
  REVERSE_STEPS: 'REVERSE_STEPS', // execute successful steps in reverse
  EXPLICIT_STEPS: 'EXPLICIT_STEPS', // execute the rollback.steps[] list
  NONE: 'NONE',                     // no automatic rollback
});

// ── Ownership ──────────────────────────────────────────────────────────────
const RUNBOOK_OWNER_TYPE = Object.freeze({
  SYSTEM: 'system', // built-in runbook, managed by AIRA
  TENANT: 'tenant', // tenant-owned runbook
});

// ── Identifier patterns ────────────────────────────────────────────────────
// Stable logical runbook ID: RB-{CATEGORY}-{NAME}-{QUALIFIER?}
// Examples: RB-K8S-POD-RESTART, RB-DB-FAILOVER, RB-CACHE-INVALIDATION
const RUNBOOK_ID_REGEX = /^RB-[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)*$/;

// Semantic version: MAJOR.MINOR.PATCH with optional pre-release and build metadata
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

// Step ID within a runbook: alphanumeric + hyphens, no spaces
const STEP_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

// ── Derived value arrays (for Mongoose enum fields) ─────────────────────────
const LIFECYCLE_VALUES = Object.values(RUNBOOK_LIFECYCLE);
const STEP_TYPE_VALUES = Object.values(RUNBOOK_STEP_TYPE);
const FAILURE_POLICY_VALUES = Object.values(RUNBOOK_FAILURE_POLICY);
const RISK_LEVEL_VALUES = Object.values(RUNBOOK_RISK_LEVEL);
const PARAM_TYPE_VALUES = Object.values(RUNBOOK_PARAM_TYPE);
const VERIFICATION_STRATEGY_VALUES = Object.values(RUNBOOK_VERIFICATION_STRATEGY);
const ROLLBACK_STRATEGY_VALUES = Object.values(RUNBOOK_ROLLBACK_STRATEGY);
const OWNER_TYPE_VALUES = Object.values(RUNBOOK_OWNER_TYPE);

module.exports = {
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  RUNBOOK_LIFECYCLE,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_STEP_TYPE,
  RUNBOOK_SAFE_STEP_TYPES,
  RUNBOOK_FAILURE_POLICY,
  RUNBOOK_RISK_LEVEL,
  RUNBOOK_PARAM_TYPE,
  RUNBOOK_VERIFICATION_STRATEGY,
  RUNBOOK_ROLLBACK_STRATEGY,
  RUNBOOK_OWNER_TYPE,
  RUNBOOK_ID_REGEX,
  SEMVER_REGEX,
  STEP_ID_REGEX,
  // Derived arrays
  LIFECYCLE_VALUES,
  STEP_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  RISK_LEVEL_VALUES,
  PARAM_TYPE_VALUES,
  VERIFICATION_STRATEGY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  OWNER_TYPE_VALUES,
};
