'use strict';

/**
 * Runbook Registry — Phase B
 *
 * The ONLY authoritative domain interface for Runbook lifecycle management,
 * version selection, and execution retrieval.
 *
 * - SYSTEM runbooks: ownerType = system, no tenantId
 * - TENANT runbooks: ownerType = tenant, tenantId mandatory
 * - Only ACTIVE runbooks may be executed
 * - activation() runs ACTIVATION validation with the real action registry
 * - Executed versions become immutable (checksum-locked)
 */

const Runbook = require('../../models/Runbook');
const { validateRunbook, VALIDATION_PURPOSE } = require('../validators/runbookValidator');
const { getActionHandlerRegistry }             = require('../actions/actionHandlerRegistry');
const {
  compareVersions,
  getLatestVersion,
  validateNewVersion,
  computeChecksum,
  versionRef,
} = require('../versioning/runbookVersioning');
const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_OWNER_TYPE,
} = require('../../constants/runbook');

// ── Error types ────────────────────────────────────────────────────────────

class RegistryError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name  = 'RegistryError';
    this.code  = code;
    this.detail = detail || null;
  }
}

// ── RunbookRegistry class ──────────────────────────────────────────────────

class RunbookRegistry {
  constructor(options = {}) {
    // Allow injecting a custom action registry (for tests)
    this._actionRegistry = options.actionRegistry || null;
  }

  _getActionRegistry() {
    return this._actionRegistry || getActionHandlerRegistry();
  }

  // ── Create / Import ─────────────────────────────────────────────────────

  /**
   * Register a new DRAFT runbook.
   *
   * @param {object} definition - Canonical runbook object (apiVersion/kind/runbookId required)
   * @param {object} context    - { tenantId?, initiatedBy }
   * @returns {Promise<object>} - Saved Mongoose document
   */
  async register(definition, context = {}) {
    _assertDefinition(definition);

    const { tenantId, initiatedBy } = context;
    _assertOwnership(definition, tenantId);

    // Must not already exist with same id + version
    const existing = await Runbook.findOne({
      runbookId: definition.runbookId,
      semver:    definition.semver,
      ...(tenantId ? { tenantId } : {}),
    }).lean();

    if (existing) {
      throw new RegistryError(
        'DUPLICATE_VERSION',
        `Runbook ${definition.runbookId}@${definition.semver} already exists`,
      );
    }

    const checksum = computeChecksum(definition);

    const doc = new Runbook({
      ...definition,
      lifecycle:  RUNBOOK_LIFECYCLE.DRAFT,
      checksum,
      ...(tenantId ? { tenantId } : {}),
      immutable:  false,
    });

    await doc.save();
    return doc.toObject();
  }

  /**
   * Import a runbook definition (e.g. loaded from YAML).
   * Validates with IMPORT purpose; rejects on ERROR diagnostics.
   *
   * @param {object} definition
   * @param {object} context    - { tenantId?, initiatedBy }
   * @returns {Promise<{ runbook, validation }>}
   */
  async importDefinition(definition, context = {}) {
    const validation = validateRunbook(definition, {
      purpose:        VALIDATION_PURPOSE.IMPORT,
      actionRegistry: this._getActionRegistry(),
    });

    if (!validation.valid) {
      const errors = validation.diagnostics.filter(d => d.severity === 'ERROR');
      throw new RegistryError(
        'IMPORT_VALIDATION_FAILED',
        `Import validation failed with ${errors.length} error(s)`,
        { diagnostics: validation.diagnostics },
      );
    }

    const runbook = await this.register(definition, context);
    return { runbook, validation };
  }

  // ── Retrieval ────────────────────────────────────────────────────────────

  /**
   * Get a runbook by runbookId, returning all versions.
   */
  async getById(runbookId, tenantId) {
    const filter = { runbookId };
    if (tenantId) filter.tenantId = tenantId;
    // System runbooks are visible to all tenants
    else filter['$or'] = [{ tenantId: null }, { tenantId: { $exists: false } }];

    const docs = await Runbook.find(filter).lean();
    if (!docs.length) {
      throw new RegistryError('NOT_FOUND', `Runbook "${runbookId}" not found`);
    }
    return docs;
  }

  /**
   * Get a specific version of a runbook.
   */
  async getVersion(runbookId, semver, tenantId) {
    const filter = _buildFilter(runbookId, semver, tenantId);
    const doc = await Runbook.findOne(filter).lean();
    if (!doc) {
      throw new RegistryError(
        'NOT_FOUND',
        `Runbook ${runbookId}@${semver} not found`,
      );
    }
    return doc;
  }

  /**
   * Get the highest semver version across all lifecycle states for a runbook.
   */
  async getLatestVersion(runbookId, tenantId) {
    const docs = await this.getById(runbookId, tenantId);
    const latest = getLatestVersion(docs.map(d => d.semver));
    return docs.find(d => d.semver === latest);
  }

  /**
   * List runbooks with optional filtering.
   */
  async list(filter = {}, tenantId) {
    const q = {};
    if (filter.lifecycle) q.lifecycle = filter.lifecycle;
    if (filter.ownerType) q['owner.ownerType'] = filter.ownerType;
    if (tenantId) {
      q['$or'] = [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }];
    }
    return Runbook.find(q).lean();
  }

  /**
   * Search runbooks by name (case-insensitive substring).
   */
  async search(query, tenantId) {
    const filter = { name: { $regex: query, $options: 'i' } };
    if (tenantId) {
      filter['$or'] = [{ tenantId }, { tenantId: null }];
    }
    return Runbook.find(filter).lean();
  }

  // ── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate a runbook for a given purpose without persisting changes.
   */
  async validate(runbookId, semver, tenantId, purpose = VALIDATION_PURPOSE.AUTHORING) {
    const doc = await this.getVersion(runbookId, semver, tenantId);
    return validateRunbook(doc, {
      purpose,
      tenantContext: tenantId ? { tenantId } : undefined,
      actionRegistry: this._getActionRegistry(),
    });
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────────

  /**
   * Move a runbook to VALIDATED.
   * Runs AUTHORING-level validation; blocks on ERRORs.
   */
  async validate_lifecycle(runbookId, semver, tenantId, context = {}) {
    return this._transition(runbookId, semver, tenantId, RUNBOOK_LIFECYCLE.VALIDATED, {
      purpose: VALIDATION_PURPOSE.AUTHORING,
      ...context,
    });
  }

  /**
   * Move a VALIDATED runbook to APPROVED.
   * Runs APPROVAL-level validation.
   */
  async approve(runbookId, semver, tenantId, context = {}) {
    return this._transition(runbookId, semver, tenantId, RUNBOOK_LIFECYCLE.APPROVED, {
      purpose: VALIDATION_PURPOSE.APPROVAL,
      ...context,
    });
  }

  /**
   * Move an APPROVED runbook to ACTIVE.
   * Runs full ACTIVATION validation with real action registry.
   * Blocks if any step has no registered handler.
   */
  async activate(runbookId, semver, tenantId, context = {}) {
    const doc = await this.getVersion(runbookId, semver, tenantId);

    // ACTIVATION validation — must pass completely
    const validation = validateRunbook(doc, {
      purpose:        VALIDATION_PURPOSE.ACTIVATION,
      tenantContext:  tenantId ? { tenantId } : undefined,
      actionRegistry: this._getActionRegistry(),
    });

    if (!validation.valid) {
      const errors = validation.diagnostics.filter(d => d.severity === 'ERROR');
      throw new RegistryError(
        'ACTIVATION_VALIDATION_FAILED',
        `Activation blocked: ${errors.length} error(s) must be resolved`,
        { diagnostics: validation.diagnostics },
      );
    }

    return this._applyTransition(doc, RUNBOOK_LIFECYCLE.ACTIVE, context);
  }

  /**
   * Disable a runbook (any lifecycle state).
   */
  async disable(runbookId, semver, tenantId, context = {}) {
    return this._transition(runbookId, semver, tenantId, RUNBOOK_LIFECYCLE.DISABLED, {
      skipValidation: true,
      ...context,
    });
  }

  /**
   * Deprecate an ACTIVE runbook.
   */
  async deprecate(runbookId, semver, tenantId, context = {}) {
    return this._transition(runbookId, semver, tenantId, RUNBOOK_LIFECYCLE.DEPRECATED, {
      skipValidation: true,
      ...context,
    });
  }

  // ── Versioning ────────────────────────────────────────────────────────────

  /**
   * Create a new version from an existing runbook definition.
   * The new version starts at DRAFT.
   * newSemver must be strictly greater than all existing versions.
   */
  async createVersion(runbookId, baseSemver, newSemver, updates, tenantId, context = {}) {
    const base = await this.getVersion(runbookId, baseSemver, tenantId);
    const existing = (await this.getById(runbookId, tenantId)).map(d => d.semver);

    const semverCheck = validateNewVersion(newSemver, existing);
    if (!semverCheck.valid) {
      throw new RegistryError('INVALID_VERSION', semverCheck.reason);
    }

    const newDef = {
      ...base,
      ...updates,
      runbookId,
      semver:    newSemver,
      lifecycle: RUNBOOK_LIFECYCLE.DRAFT,
      immutable: false,
      checksum:  undefined,
      _id:       undefined,
      createdAt: undefined,
      updatedAt: undefined,
    };
    delete newDef._id;
    delete newDef.createdAt;
    delete newDef.updatedAt;
    delete newDef.__v;
    delete newDef.checksum;

    return this.register(newDef, { tenantId, ...context });
  }

  // ── Execution readiness ───────────────────────────────────────────────────

  /**
   * Return true iff this version is ACTIVE and not immutably locked.
   */
  async isExecutable(runbookId, semver, tenantId) {
    try {
      const doc = await this.getVersion(runbookId, semver, tenantId);
      return doc.lifecycle === RUNBOOK_LIFECYCLE.ACTIVE;
    } catch {
      return false;
    }
  }

  /**
   * Return the immutable execution definition for an ACTIVE runbook.
   * Locks the version (marks immutable) on first call.
   * Throws if not ACTIVE.
   */
  async getExecutionDefinition(runbookId, semver, tenantId) {
    const doc = await this.getVersion(runbookId, semver, tenantId);

    if (doc.lifecycle !== RUNBOOK_LIFECYCLE.ACTIVE) {
      throw new RegistryError(
        'NOT_EXECUTABLE',
        `Runbook ${runbookId}@${semver} is ${doc.lifecycle}, not ACTIVE. Only ACTIVE runbooks may execute.`,
      );
    }

    // Lock version on first execution reference
    if (!doc.immutable) {
      await Runbook.updateOne(
        { runbookId, semver, ...(tenantId ? { tenantId } : {}) },
        { $set: { immutable: true } },
      );
    }

    const checksum = computeChecksum(doc);
    return {
      ...doc,
      immutable: true,
      checksum,
      versionRef: versionRef(runbookId, semver),
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  async _transition(runbookId, semver, tenantId, targetLifecycle, context = {}) {
    const doc = await this.getVersion(runbookId, semver, tenantId);

    // For ACTIVE this is handled by activate()
    if (targetLifecycle === RUNBOOK_LIFECYCLE.ACTIVE) {
      return this.activate(runbookId, semver, tenantId, context);
    }

    if (!context.skipValidation) {
      const validation = validateRunbook(doc, {
        purpose:        context.purpose || VALIDATION_PURPOSE.AUTHORING,
        tenantContext:  tenantId ? { tenantId } : undefined,
        actionRegistry: this._getActionRegistry(),
      });
      if (!validation.valid) {
        const errors = validation.diagnostics.filter(d => d.severity === 'ERROR');
        throw new RegistryError(
          'VALIDATION_FAILED',
          `Transition to ${targetLifecycle} blocked: ${errors.length} error(s)`,
          { diagnostics: validation.diagnostics },
        );
      }
    }

    return this._applyTransition(doc, targetLifecycle, context);
  }

  async _applyTransition(doc, targetLifecycle, context = {}) {
    const allowed = RUNBOOK_LIFECYCLE_TRANSITIONS[doc.lifecycle] || [];
    if (!allowed.includes(targetLifecycle)) {
      throw new RegistryError(
        'INVALID_TRANSITION',
        `Cannot transition from ${doc.lifecycle} to ${targetLifecycle}`,
        { allowed },
      );
    }

    const updated = await Runbook.findOneAndUpdate(
      {
        runbookId: doc.runbookId,
        semver:    doc.semver,
        lifecycle: doc.lifecycle,  // optimistic lock
      },
      {
        $set: {
          lifecycle:           targetLifecycle,
          [`${targetLifecycle.toLowerCase()}At`]: new Date(),
          transitionedBy:      context.initiatedBy || 'system',
        },
      },
      { new: true },
    ).lean();

    if (!updated) {
      throw new RegistryError(
        'TRANSITION_CONFLICT',
        `Lifecycle transition to ${targetLifecycle} failed — optimistic lock mismatch`,
      );
    }

    return updated;
  }
}

// ── Validation helpers ─────────────────────────────────────────────────────

function _assertDefinition(def) {
  if (!def || typeof def !== 'object') throw new RegistryError('INVALID_DEFINITION', 'Definition must be an object');
  if (!def.runbookId) throw new RegistryError('INVALID_DEFINITION', 'runbookId is required');
  if (!def.semver)    throw new RegistryError('INVALID_DEFINITION', 'semver is required');
  if (!def.name)      throw new RegistryError('INVALID_DEFINITION', 'name is required');
}

function _assertOwnership(def, tenantId) {
  const ownerType = def.owner?.ownerType;
  if (ownerType === RUNBOOK_OWNER_TYPE.TENANT && !tenantId) {
    throw new RegistryError('TENANT_REQUIRED', 'Tenant runbook requires tenantId in context');
  }
}

function _buildFilter(runbookId, semver, tenantId) {
  const f = { runbookId, semver };
  if (tenantId) f.tenantId = tenantId;
  else f['$or'] = [{ tenantId: null }, { tenantId: { $exists: false } }];
  return f;
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

function getRunbookRegistry(options) {
  if (!_instance || options) {
    _instance = new RunbookRegistry(options || {});
  }
  return _instance;
}

function resetRunbookRegistry() {
  _instance = null;
}

module.exports = {
  RunbookRegistry,
  getRunbookRegistry,
  resetRunbookRegistry,
  RegistryError,
};
