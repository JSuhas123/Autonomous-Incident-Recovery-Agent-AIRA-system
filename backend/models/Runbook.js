'use strict';

const mongoose = require('mongoose');
const {
  RUNBOOK_API_VERSION,
  RUNBOOK_KIND,
  LIFECYCLE_VALUES,
  STEP_TYPE_VALUES,
  FAILURE_POLICY_VALUES,
  RISK_LEVEL_VALUES,
  PARAM_TYPE_VALUES,
  VERIFICATION_STRATEGY_VALUES,
  ROLLBACK_STRATEGY_VALUES,
  OWNER_TYPE_VALUES,
  SEMVER_REGEX,
  STEP_ID_REGEX,
  RUNBOOK_LIFECYCLE,
  RUNBOOK_PARAM_TYPE,
} = require('../constants/runbook');

// ── Canonical v1 sub-schemas ───────────────────────────────────────────────

const retrySchema = new mongoose.Schema(
  {
    maxAttempts: { type: Number, default: 3, min: 1, max: 10 },
    delaySeconds: { type: Number, default: 1, min: 0 },
    backoffMultiplier: { type: Number, default: 1.5, min: 1 },
    maxDelaySeconds: { type: Number, min: 0 },
  },
  { _id: false }
);

const preconditionSchema = new mongoose.Schema(
  {
    id: { type: String, match: STEP_ID_REGEX },
    description: String,
    // 'check' identifies a registered precondition handler — not a shell command
    check: { type: String, required: true },
    params: mongoose.Schema.Types.Mixed,
    onFailure: { type: String, enum: FAILURE_POLICY_VALUES, default: 'STOP' },
  },
  { _id: false }
);

const stepRollbackSchema = new mongoose.Schema(
  {
    // Inline rollback action for this specific step
    action: { type: String, required: true },
    params: mongoose.Schema.Types.Mixed,
    timeoutSeconds: { type: Number, default: 30 },
  },
  { _id: false }
);

const stepSchema = new mongoose.Schema(
  {
    // ── Canonical v1 fields ──────────────────────────────────────────────
    // Stable identifier within this runbook — must be unique across steps
    id: {
      type: String,
      match: [STEP_ID_REGEX, 'Step id must be lowercase alphanumeric with hyphens'],
    },
    order: { type: Number, min: 1 },
    name: { type: String, required: true },
    description: String,
    type: {
      type: String,
      enum: STEP_TYPE_VALUES,
      required: true,
    },
    // Identifies a registered deterministic action — NOT an arbitrary shell command
    action: { type: String, required: true },
    params: mongoose.Schema.Types.Mixed,
    timeoutSeconds: { type: Number, default: 30, min: 1 },
    retry: { type: retrySchema, default: () => ({}) },
    requiresConfirmation: { type: Boolean, default: false },
    preconditions: [preconditionSchema],
    failurePolicy: {
      type: String,
      enum: FAILURE_POLICY_VALUES,
      default: 'STOP',
    },
    captureOutput: { type: Boolean, default: false },
    reversible: { type: Boolean, default: false },
    // Inline rollback for this step — used when rollbackConfig.strategy is EXPLICIT_STEPS
    stepRollback: stepRollbackSchema,

    // ── Legacy fields — DEPRECATED, retained for backward compatibility ──
    /** @deprecated use `order` */
    stepNumber: Number,
    /** @deprecated use `timeoutSeconds` (multiply by 1000 to convert) */
    timeout: Number,
    /** @deprecated use `retry.maxAttempts` */
    retryPolicy: {
      maxRetries: { type: Number },
      backoffMs: { type: Number },
    },
    /** @deprecated use `failurePolicy` */
    onSuccess: String,
    /** @deprecated use `failurePolicy` */
    onFailure: String,
  },
  { _id: false }
);

const parameterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    type: {
      type: String,
      enum: PARAM_TYPE_VALUES,
      required: true,
    },
    required: { type: Boolean, default: false },
    // Must be null/undefined when type is 'secret-reference' — never store raw secrets
    default: mongoose.Schema.Types.Mixed,
    allowedValues: [mongoose.Schema.Types.Mixed],
    min: Number,
    max: Number,
    sensitive: { type: Boolean, default: false },
    // Hints for UI/CLI to resolve the value (e.g., 'k8s.namespace', 'aws.region')
    sourceHints: [String],
  },
  { _id: false }
);

// Secret-reference parameters must not have a default value
parameterSchema.path('default').validate(function (value) {
  if (this.type === RUNBOOK_PARAM_TYPE.SECRET_REFERENCE && value != null) {
    return false;
  }
  return true;
}, 'secret-reference parameters must not have a default value — store the reference key only');

const verificationCheckSchema = new mongoose.Schema(
  {
    id: String,
    type: {
      type: String,
      enum: ['error_rate_below', 'latency_below', 'service_healthy', 'pod_running', 'custom'],
    },
    description: String,
    params: mongoose.Schema.Types.Mixed,
    timeoutSeconds: { type: Number, default: 30 },
  },
  { _id: false }
);

const verificationSchema = new mongoose.Schema(
  {
    strategy: {
      type: String,
      enum: VERIFICATION_STRATEGY_VALUES,
      default: 'ALL',
    },
    minimumSuccessfulChecks: { type: Number, min: 1 },
    timeoutSeconds: { type: Number, default: 120 },
    intervalSeconds: { type: Number, default: 10 },
    checks: [verificationCheckSchema],
  },
  { _id: false }
);

const rollbackConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    strategy: {
      type: String,
      enum: ROLLBACK_STRATEGY_VALUES,
      default: 'NONE',
    },
    steps: [
      {
        id: String,
        name: { type: String, required: true },
        order: Number,
        type: { type: String, enum: STEP_TYPE_VALUES },
        // Identifies a registered deterministic action — NOT a shell command
        action: { type: String, required: true },
        params: mongoose.Schema.Types.Mixed,
        timeoutSeconds: { type: Number, default: 30 },
      },
    ],
    verification: verificationSchema,
  },
  { _id: false }
);

const notificationsSchema = new mongoose.Schema(
  {
    onStart: [String],
    onSuccess: [String],
    onFailure: [String],
    onRollback: [String],
    onEscalation: [String],
  },
  { _id: false }
);

const auditConfigSchema = new mongoose.Schema(
  {
    recordInputs: { type: Boolean, default: true },
    recordOutputs: { type: Boolean, default: true },
    recordEvidence: { type: Boolean, default: true },
    redactSensitiveValues: { type: Boolean, default: true },
  },
  { _id: false }
);

// ── Root schema ────────────────────────────────────────────────────────────

const runbookSchema = new mongoose.Schema(
  {
    // ── Canonical v1 envelope ────────────────────────────────────────────
    apiVersion: {
      type: String,
      default: RUNBOOK_API_VERSION,
      enum: [RUNBOOK_API_VERSION],
    },
    kind: {
      type: String,
      default: RUNBOOK_KIND,
      enum: [RUNBOOK_KIND],
    },

    // ── Canonical identity & metadata ────────────────────────────────────
    // Correction 1: required only for tenant-owned runbooks; system runbooks may omit it
    tenantId: {
      type: String,
      required: function () {
        return !(this.owner && this.owner.ownerType === 'system');
      },
    },

    // Stable logical ID: RB-{CATEGORY}-{NAME} — survives version bumps
    runbookId: {
      type: String,
      sparse: true,
    },

    // Correction 2: canonical semantic version storage field.
    // Callers MUST use getVersion() / metadataVersion / Runbook.getCanonicalVersion()
    // rather than reading this field directly. The legacy numeric `version` field
    // must never be used for version selection in new code.
    semver: {
      type: String,
      validate: {
        validator: (v) => !v || SEMVER_REGEX.test(v),
        message: 'version must be a valid semantic version (e.g. 1.0.0)',
      },
    },

    // Replaces the competing active+enabled booleans as lifecycle authority
    lifecycle: {
      type: String,
      enum: LIFECYCLE_VALUES,
      default: RUNBOOK_LIFECYCLE.DRAFT,
    },

    category: String,
    owner: {
      name: String,
      ownerType: { type: String, enum: OWNER_TYPE_VALUES },
      contact: String,
    },
    tags: [String],

    // ── Scope ────────────────────────────────────────────────────────────
    scope: {
      environments: [String],
      providers: [String],
      resourceTypes: [String],
      services: [String],
    },

    // ── Risk ─────────────────────────────────────────────────────────────
    risk: {
      level: {
        type: String,
        enum: RISK_LEVEL_VALUES,
        default: 'MEDIUM',
      },
      blastRadius: String,
      reversible: { type: Boolean, default: false },
    },

    // ── Parameters ───────────────────────────────────────────────────────
    parameters: [parameterSchema],

    // ── Preconditions ─────────────────────────────────────────────────────
    preconditions: [preconditionSchema],

    // ── Steps ────────────────────────────────────────────────────────────
    steps: [stepSchema],

    // ── Verification ─────────────────────────────────────────────────────
    verification: verificationSchema,

    // ── Rollback (canonical) ─────────────────────────────────────────────
    rollbackConfig: rollbackConfigSchema,

    // ── Notifications ────────────────────────────────────────────────────
    notifications: notificationsSchema,

    // ── Audit config ─────────────────────────────────────────────────────
    auditConfig: { type: auditConfigSchema, default: () => ({}) },

    // ── Execution summary (denormalized — non-authoritative) ──────────────
    // Authoritative execution history lives in the RunbookExecution collection.
    // These fields are maintained as a convenience summary only.
    lastExecuted: Date,
    totalExecutions: { type: Number, default: 0 },
    successfulExecutions: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },

    // ── Legacy fields — DEPRECATED ────────────────────────────────────────
    // Retained for backward compatibility. Will be removed after migration.

    /** @deprecated use `name` directly (already at top level — unchanged) */
    name: { type: String, required: true },

    description: String,

    /** @deprecated use `scope.services` for service scoping */
    incidentType: { type: String },

    /** @deprecated use `scope.services` */
    serviceId: String,

    /**
     * @deprecated use `lifecycle` as the single authority.
     * `enabled: false` is treated as lifecycle=DISABLED during the migration
     * period; the pre-save hook keeps them in sync.
     */
    enabled: { type: Boolean, default: true },

    /**
     * @deprecated use `lifecycle` as the single authority.
     * Same migration-period rule as `enabled`.
     */
    active: { type: Boolean, default: true },

    autoTrigger: { type: Boolean, default: false },

    triggerConditions: {
      minConfidence: { type: Number, default: 80 },
      severityLevels: [String],
      incidentTypes: [String],
    },

    /**
     * @deprecated use `rollbackConfig`.
     * Legacy array of rollback step definitions. Retained so existing
     * runbookRoutes.js consumers do not break. Will be migrated to
     * rollbackConfig.steps in a future workstream step.
     */
    rollback: [
      {
        stepNumber: Number,
        name: String,
        type: String,
        action: String,
        params: mongoose.Schema.Types.Mixed,
        timeout: { type: Number, default: 30000 },
      },
    ],

    /**
     * @deprecated use `verification.checks`.
     * Legacy success criteria array.
     */
    successCriteria: [
      {
        type: { type: String, enum: ['error_rate_below', 'latency_below', 'service_healthy', 'custom'] },
        param: mongoose.Schema.Types.Mixed,
      },
    ],

    /**
     * @deprecated non-authoritative summary. See `executionSummary` comment above.
     * Kept to avoid breaking any consumers that read it directly.
     */
    executionHistory: [
      {
        executionId: String,
        correlationId: String,
        startedAt: Date,
        completedAt: Date,
        status: String,
        successCriteriaMet: Boolean,
        rollbackExecuted: Boolean,
        duration: Number,
        logs: [String],
        executionErrors: [String],
      },
    ],

    /**
     * @deprecated use `semver` for canonical versioning.
     * Numeric counter retained for backward compatibility only.
     */
    version: { type: Number, default: 1 },

    createdBy: String,
    lastModifiedBy: String,
  },
  {
    timestamps: true,
  }
);

// ── Lifecycle normalization helper (Correction 3) ────────────────────────
// Extracted so tests can call this directly without touching Mongoose internals.

function normalizeRunbookLifecycle(doc) {
  if (doc.lifecycle === RUNBOOK_LIFECYCLE.DISABLED) {
    doc.enabled = false;
    doc.active = false;
  } else if (doc.lifecycle === RUNBOOK_LIFECYCLE.ACTIVE) {
    doc.enabled = true;
    doc.active = true;
  }
}

// ── Pre-save hook ─────────────────────────────────────────────────────────

runbookSchema.pre('save', function (next) {
  normalizeRunbookLifecycle(this);
  const err = Runbook.validateStepIds(this.steps);
  if (err) return next(err);
  next();
});

// ── Virtual: domain-facing metadata.version (Correction 2) ───────────────
// Exposes semver storage as the canonical `metadataVersion` property.
// Future serializers will map this to `metadata.version` in API responses.

runbookSchema.virtual('metadataVersion').get(function () {
  return this.semver || null;
});
// Returns the canonical semantic version; prefer this over reading .semver directly.
runbookSchema.methods.getVersion = function () {
  return this.semver || null;
};
// ── Static helpers ─────────────────────────────────────────────────────────

/**
 * Validate that all step `id` values are unique within a steps array.
 * Returns a validation Error if duplicates are found, otherwise null.
 * Exported as a static so the schema tests can call it without a DB.
 */
function validateStepIds(steps) {
  if (!Array.isArray(steps)) return null;
  const ids = steps.map((s) => s.id).filter(Boolean);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      return new mongoose.Error.ValidationError(null);
    }
    seen.add(id);
  }
  return null;
}

// ── Indexes ────────────────────────────────────────────────────────────────

// Primary query patterns
runbookSchema.index({ tenantId: 1, lifecycle: 1 });
runbookSchema.index({ tenantId: 1, incidentType: 1 }); // legacy compat
runbookSchema.index({ tenantId: 1, serviceId: 1, enabled: 1 }); // legacy compat
runbookSchema.index({ tenantId: 1, autoTrigger: 1 });
runbookSchema.index({ runbookId: 1, tenantId: 1 }, { sparse: true, unique: false });
runbookSchema.index({ tenantId: 1, 'scope.services': 1 });
runbookSchema.index({ tenantId: 1, tags: 1 });

const Runbook = mongoose.model('Runbook', runbookSchema);

// ── Static helpers ────────────────────────────────────────────────────────

Runbook.validateStepIds = validateStepIds;
Runbook.normalizeRunbookLifecycle = normalizeRunbookLifecycle;

// Returns the canonical semantic version for any runbook document/plain-object.
Runbook.getCanonicalVersion = function (doc) {
  return (doc && doc.semver) || null;
};

module.exports = Runbook;
