'use strict';

/**
 * Playbook Registry
 *
 * Authoritative domain interface for Playbook lifecycle management.
 *
 * Key invariant: activate() requires ALL required runbooks to be ACTIVE.
 * A Playbook NEVER executes infrastructure — only orchestrates Runbooks.
 */

const {
  PLAYBOOK_LIFECYCLE,
  PLAYBOOK_LIFECYCLE_TRANSITIONS,
  PLAYBOOK_VALIDATION_PURPOSE,
  PLAYBOOK_DIAGNOSTIC_CODES,
  PLAYBOOK_OWNER_TYPE,
} = require('../../constants/playbook');

const { validatePlaybook }               = require('../validators/playbookValidator');
const { computePlaybookChecksum, playbookVersionRef, isNewerVersion } = require('../versioning/playbookVersioning');

// ── Registry Error ────────────────────────────────────────────────────────

class PlaybookRegistryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name  = 'PlaybookRegistryError';
    this.code  = code;
    this.details = details;
  }
}

const REGISTRY_ERROR_CODES = Object.freeze({
  NOT_FOUND:                  'NOT_FOUND',
  DUPLICATE_VERSION:          'DUPLICATE_VERSION',
  IMPORT_VALIDATION_FAILED:   'IMPORT_VALIDATION_FAILED',
  ACTIVATION_VALIDATION_FAILED: 'ACTIVATION_VALIDATION_FAILED',
  VALIDATION_FAILED:          'VALIDATION_FAILED',
  INVALID_TRANSITION:         'INVALID_TRANSITION',
  TRANSITION_CONFLICT:        'TRANSITION_CONFLICT',
  POLICY_DENIED:              'POLICY_DENIED',
  NOT_EXECUTABLE:             'NOT_EXECUTABLE',
  TENANT_REQUIRED:            'TENANT_REQUIRED',
  INVALID_VERSION:            'INVALID_VERSION',
});

// ── Registry ──────────────────────────────────────────────────────────────

class PlaybookRegistry {
  constructor() {
    // Map: playbookId → Map<semver, PlaybookDefinition>
    this._store = new Map();
  }

  // ── Register ────────────────────────────────────────────────────────────

  async register(playbook, options = {}) {
    _requireFields(playbook, ['playbookId', 'semver']);

    const { playbookId, semver } = playbook;

    // Validate structure + (optionally) semantics
    const purpose = options.validate === false
      ? null
      : (options.purpose || PLAYBOOK_VALIDATION_PURPOSE.IMPORT);

    if (purpose) {
      const result = await validatePlaybook(playbook, {
        purpose,
        runbookRegistry: options.runbookRegistry,
        tenantContext:   options.tenantContext,
      });

      if (!result.valid) {
        throw new PlaybookRegistryError(
          REGISTRY_ERROR_CODES.IMPORT_VALIDATION_FAILED,
          `Playbook validation failed for ${playbookId}@${semver}`,
          { diagnostics: result.diagnostics, summary: result.summary },
        );
      }
    }

    // Duplicate check
    if (this._has(playbookId, semver)) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.DUPLICATE_VERSION,
        `Playbook ${playbookId}@${semver} is already registered`,
      );
    }

    // Compute and attach checksum
    const checksum = computePlaybookChecksum(playbook);
    const entry    = {
      ...playbook,
      checksum,
      immutable:  false,
      _registeredAt: new Date().toISOString(),
    };

    _setEntry(this._store, playbookId, semver, entry);
    return entry;
  }

  // ── Import (alias with explicit purpose) ──────────────────────────────

  async importDefinition(playbook, options = {}) {
    return this.register(playbook, { ...options, purpose: PLAYBOOK_VALIDATION_PURPOSE.IMPORT });
  }

  // ── Get by ID (returns all versions) ──────────────────────────────────

  async getById(playbookId, tenantId) {
    const versions = this._store.get(playbookId);
    if (!versions || versions.size === 0) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.NOT_FOUND,
        `Playbook "${playbookId}" not found`,
      );
    }
    const all = Array.from(versions.values());
    return tenantId ? all.filter(p => !p.tenantId || p.tenantId === tenantId) : all;
  }

  // ── Get a specific version ────────────────────────────────────────────

  async getVersion(playbookId, semver, tenantId) {
    const versions = this._store.get(playbookId);
    if (!versions) {
      throw new PlaybookRegistryError(REGISTRY_ERROR_CODES.NOT_FOUND, `Playbook "${playbookId}" not found`);
    }
    const entry = versions.get(semver);
    if (!entry) {
      throw new PlaybookRegistryError(REGISTRY_ERROR_CODES.NOT_FOUND, `Playbook ${playbookId}@${semver} not found`);
    }
    if (tenantId && entry.tenantId && entry.tenantId !== tenantId) {
      throw new PlaybookRegistryError(REGISTRY_ERROR_CODES.NOT_FOUND, `Playbook ${playbookId}@${semver} not found for tenant "${tenantId}"`);
    }
    return entry;
  }

  // ── Get latest version ────────────────────────────────────────────────

  async getLatestVersion(playbookId, tenantId) {
    const all = await this.getById(playbookId, tenantId);
    return all.reduce((best, cur) =>
      !best || isNewerVersion(cur.semver, best.semver) ? cur : best, null);
  }

  // ── List ──────────────────────────────────────────────────────────────

  async list(options = {}) {
    const { tenantId, lifecycle, category } = options;
    const results = [];

    for (const versions of this._store.values()) {
      for (const entry of versions.values()) {
        if (tenantId && entry.tenantId && entry.tenantId !== tenantId) continue;
        if (lifecycle && entry.lifecycle !== lifecycle) continue;
        if (category && entry.category !== category) continue;
        results.push(entry);
      }
    }
    return results;
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────

  async validate(playbookId, semver, options = {}) {
    const entry = await this.getVersion(playbookId, semver, options.tenantId);
    _assertTransition(entry, PLAYBOOK_LIFECYCLE.VALIDATED, playbookId, semver);

    const result = await validatePlaybook(entry, {
      purpose: PLAYBOOK_VALIDATION_PURPOSE.APPROVAL,
      runbookRegistry: options.runbookRegistry,
      tenantContext: options.tenantContext,
    });

    if (!result.valid) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.VALIDATION_FAILED,
        `Validation failed for ${playbookId}@${semver}`,
        { diagnostics: result.diagnostics },
      );
    }

    entry.lifecycle = PLAYBOOK_LIFECYCLE.VALIDATED;
    entry.checksum  = computePlaybookChecksum(entry);
    return { ...entry, validationResult: result };
  }

  async approve(playbookId, semver, options = {}) {
    const entry = await this.getVersion(playbookId, semver, options.tenantId);
    _assertTransition(entry, PLAYBOOK_LIFECYCLE.APPROVED, playbookId, semver);
    entry.lifecycle   = PLAYBOOK_LIFECYCLE.APPROVED;
    entry._approvedAt = new Date().toISOString();
    entry._approvedBy = options.approvedBy || 'system';
    return { ...entry };
  }

  async activate(playbookId, semver, options = {}) {
    const entry = await this.getVersion(playbookId, semver, options.tenantId);
    _assertTransition(entry, PLAYBOOK_LIFECYCLE.ACTIVE, playbookId, semver);

    // ACTIVATION requires ALL required runbooks to be ACTIVE
    const result = await validatePlaybook(entry, {
      purpose: PLAYBOOK_VALIDATION_PURPOSE.ACTIVATION,
      runbookRegistry: options.runbookRegistry,
      tenantContext:   options.tenantContext,
    });

    if (!result.valid) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.ACTIVATION_VALIDATION_FAILED,
        `Activation validation failed for ${playbookId}@${semver}`,
        { diagnostics: result.diagnostics, summary: result.summary },
      );
    }

    entry.lifecycle   = PLAYBOOK_LIFECYCLE.ACTIVE;
    entry._activatedAt = new Date().toISOString();
    entry.checksum    = computePlaybookChecksum(entry);
    return { ...entry };
  }

  async disable(playbookId, semver, options = {}) {
    const entry = await this.getVersion(playbookId, semver, options.tenantId);
    _assertTransition(entry, PLAYBOOK_LIFECYCLE.DISABLED, playbookId, semver);
    entry.lifecycle   = PLAYBOOK_LIFECYCLE.DISABLED;
    entry._disabledAt = new Date().toISOString();
    entry._disabledBy = options.disabledBy || 'system';
    entry._disabledReason = options.reason || null;
    return { ...entry };
  }

  async deprecate(playbookId, semver, options = {}) {
    const entry = await this.getVersion(playbookId, semver, options.tenantId);
    _assertTransition(entry, PLAYBOOK_LIFECYCLE.DEPRECATED, playbookId, semver);
    entry.lifecycle     = PLAYBOOK_LIFECYCLE.DEPRECATED;
    entry._deprecatedAt = new Date().toISOString();
    entry._deprecatedBy = options.deprecatedBy || 'system';
    entry._deprecationReason = options.reason || null;
    return { ...entry };
  }

  // ── Version creation ──────────────────────────────────────────────────

  async createVersion(playbookId, baseSemver, newSemver, patches = {}, options = {}) {
    const base = await this.getVersion(playbookId, baseSemver, options.tenantId);

    if (this._has(playbookId, newSemver)) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.DUPLICATE_VERSION,
        `Playbook ${playbookId}@${newSemver} already exists`,
      );
    }

    const newDef = {
      ...base,
      ...patches,
      semver:    newSemver,
      lifecycle: PLAYBOOK_LIFECYCLE.DRAFT,
      immutable: false,
      checksum:  null,
      _registeredAt: new Date().toISOString(),
    };

    return this.register(newDef, { validate: false });
  }

  // ── Execution definition ──────────────────────────────────────────────
  // Locks the playbook version as immutable on first call

  async getExecutionDefinition(playbookId, semver, tenantId) {
    const entry = await this.getVersion(playbookId, semver, tenantId);

    if (entry.lifecycle !== PLAYBOOK_LIFECYCLE.ACTIVE) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES.NOT_EXECUTABLE,
        `Playbook ${playbookId}@${semver} is not ACTIVE (lifecycle: ${entry.lifecycle})`,
      );
    }

    if (!entry.immutable) {
      entry.immutable = true;
      entry.checksum  = computePlaybookChecksum(entry);
      entry._frozenAt = new Date().toISOString();
    }

    // Return deep-frozen snapshot
    return Object.freeze(JSON.parse(JSON.stringify(entry)));
  }

  // ── Eligibility check ─────────────────────────────────────────────────

  isExecutable(entry) {
    return entry?.lifecycle === PLAYBOOK_LIFECYCLE.ACTIVE;
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  _has(playbookId, semver) {
    return this._store.has(playbookId) && this._store.get(playbookId).has(semver);
  }

  get size() {
    let n = 0;
    for (const v of this._store.values()) n += v.size;
    return n;
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────

function _requireFields(obj, fields) {
  for (const f of fields) {
    if (!obj[f]) throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES.VALIDATION_FAILED,
      `Playbook definition missing required field: ${f}`,
    );
  }
}

function _assertTransition(entry, targetLifecycle, playbookId, semver) {
  const allowed = PLAYBOOK_LIFECYCLE_TRANSITIONS[entry.lifecycle] || [];
  if (!allowed.includes(targetLifecycle)) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES.INVALID_TRANSITION,
      `Cannot transition ${playbookId}@${semver} from ${entry.lifecycle} → ${targetLifecycle}. ` +
      `Allowed: ${allowed.length ? allowed.join(', ') : 'none'}`,
    );
  }
}

function _setEntry(store, playbookId, semver, entry) {
  if (!store.has(playbookId)) store.set(playbookId, new Map());
  store.get(playbookId).set(semver, entry);
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _instance = null;

function getPlaybookRegistry() {
  if (!_instance) _instance = new PlaybookRegistry();
  return _instance;
}

function resetPlaybookRegistry() {
  _instance = null;
}

module.exports = {
  PlaybookRegistry,
  PlaybookRegistryError,
  REGISTRY_ERROR_CODES,
  getPlaybookRegistry,
  resetPlaybookRegistry,
};
