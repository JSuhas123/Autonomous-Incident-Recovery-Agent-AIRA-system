'use strict';

/**
 * Runbook Registry — Environment-Aware Phase 1
 *
 * Authoritative interface for:
 * - Runbook lifecycle management
 * - Version selection
 * - Environment-safe retrieval
 * - Execution definition locking
 *
 * Ownership rules:
 *
 * SYSTEM runbooks
 *   owner.ownerType = "system"
 *   Globally reusable.
 *
 * TENANT runbooks
 *   tenantId
 *   organizationId
 *   environmentId
 *
 * Tenant definitions are visible ONLY inside the exact environment.
 *
 * Resolution precedence:
 *
 * 1. Exact tenant + organization + environment definition
 * 2. Global SYSTEM definition
 * 3. NOT_FOUND
 *
 * Production/staging definitions can therefore never resolve across
 * environment boundaries.
 */

const Runbook =
  require('../../models/Runbook');

const {
  validateRunbook,
  VALIDATION_PURPOSE,
} =
  require('../validators/runbookValidator');

const {
  getActionHandlerRegistry,
} =
  require('../actions/actionHandlerRegistry');

const {
  compareVersions,
  getLatestVersion,
  validateNewVersion,
  computeChecksum,
  versionRef,
} =
  require('../versioning/runbookVersioning');

const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_OWNER_TYPE,
} =
  require('../../constants/runbook');

// ============================================================================
// ERROR
// ============================================================================

class RegistryError extends Error {
  constructor(
    code,
    message,
    detail
  ) {
    super(message);

    this.name =
      'RegistryError';

    this.code =
      code;

    this.detail =
      detail ||
      null;
  }
}

// ============================================================================
// REGISTRY
// ============================================================================

class RunbookRegistry {
  constructor(options = {}) {
    this._actionRegistry =
      options.actionRegistry ||
      null;
  }

  _getActionRegistry() {
    return (
      this._actionRegistry ||
      getActionHandlerRegistry()
    );
  }

  // ==========================================================================
  // CREATE / IMPORT
  // ==========================================================================

  /**
   * Register a new DRAFT runbook.
   *
   * context:
   *
   * {
   *   tenantId?,
   *   organizationId?,
   *   environmentId?,
   *   initiatedBy?
   * }
   */
  async register(
    definition,
    context = {}
  ) {
    _assertDefinition(
      definition
    );

    const scope =
      _normalizeScope(
        context,
        definition
      );

    const ownerType =
      _resolveOwnerType(
        definition,
        scope
      );

    _assertOwnership(
      definition,
      scope,
      ownerType
    );

    // ------------------------------------------------------------------------
    // Duplicate protection
    // ------------------------------------------------------------------------

    const duplicateFilter =
      _buildExactOwnershipFilter(
        definition.runbookId,
        definition.semver,
        scope,
        ownerType
      );

    const existing =
      await Runbook
        .findOne(
          duplicateFilter
        )
        .lean();

    if (existing) {
      throw new RegistryError(
        'DUPLICATE_VERSION',

        `Runbook ${definition.runbookId}@${definition.semver} already exists in this ownership scope`
      );
    }

    const checksum =
      computeChecksum(
        definition
      );

    const ownershipFields =
      _ownershipFieldsForCreate(
        definition,
        scope,
        ownerType
      );

    const doc =
      new Runbook({
        ...definition,

        ...ownershipFields,

        owner: {
          ...(definition.owner || {}),

          ownerType,
        },

        lifecycle:
          RUNBOOK_LIFECYCLE
            .DRAFT,

        checksum,

        immutable:
          false,
      });

    await doc.save();

    return doc.toObject();
  }

  /**
   * Import a runbook definition.
   */
  async importDefinition(
    definition,
    context = {}
  ) {
    const scope =
      _normalizeScope(
        context,
        definition
      );

    const validation =
      validateRunbook(
        definition,
        {
          purpose:
            VALIDATION_PURPOSE
              .IMPORT,

          tenantContext:
            _validationContext(
              scope
            ),

          actionRegistry:
            this
              ._getActionRegistry(),
        }
      );

    if (
      !validation.valid
    ) {
      const errors =
        validation
          .diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.severity ===
              'ERROR'
          );

      throw new RegistryError(
        'IMPORT_VALIDATION_FAILED',

        `Import validation failed with ${errors.length} error(s)`,

        {
          diagnostics:
            validation
              .diagnostics,
        }
      );
    }

    const runbook =
      await this.register(
        definition,
        context
      );

    return {
      runbook,
      validation,
    };
  }

  // ==========================================================================
  // RETRIEVAL
  // ==========================================================================

  /**
   * Return all visible versions of a runbook.
   *
   * Supports:
   *
   * getById(runbookId, scopeObject)
   *
   * and legacy:
   *
   * getById(runbookId, tenantIdString)
   */
  async getById(
    runbookId,
    scopeInput
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const tenantDocs =
      await this
        ._findTenantVersions(
          runbookId,
          scope
        );

    const systemDocs =
      await this
        ._findSystemVersions(
          runbookId
        );

    const docs =
      _mergeVisibleVersions(
        tenantDocs,
        systemDocs
      );

    if (
      docs.length ===
      0
    ) {
      throw new RegistryError(
        'NOT_FOUND',

        `Runbook "${runbookId}" not found`
      );
    }

    return docs;
  }

  /**
   * Get one specific version.
   *
   * Resolution priority:
   *
   * environment-owned version
   *      ↓
   * system version
   */
  async getVersion(
    runbookId,
    semver,
    scopeInput
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const tenantDoc =
      await this
        ._findExactTenantVersion(
          runbookId,
          semver,
          scope
        );

    if (tenantDoc) {
      return tenantDoc;
    }

    const systemDoc =
      await this
        ._findExactSystemVersion(
          runbookId,
          semver
        );

    if (systemDoc) {
      return systemDoc;
    }

    throw new RegistryError(
      'NOT_FOUND',

      `Runbook ${runbookId}@${semver} not found`
    );
  }

  /**
   * Highest semver visible to this environment.
   *
   * Environment-owned versions override identical SYSTEM versions.
   */
  async getLatestVersion(
    runbookId,
    scopeInput
  ) {
    const docs =
      await this.getById(
        runbookId,
        scopeInput
      );

    const versions =
      docs
        .map(
          (doc) =>
            doc.semver
        )
        .filter(
          Boolean
        );

    const latest =
      getLatestVersion(
        versions
      );

    if (!latest) {
      return null;
    }

    return docs.find(
      (doc) =>
        doc.semver ===
        latest
    );
  }

  /**
   * List visible runbooks.
   *
   * Preferred:
   *
   * list(
   *   { lifecycle, ownerType },
   *   { tenantId, organizationId, environmentId }
   * )
   *
   * Also supports the newer convenience form:
   *
   * list({
   *   lifecycle,
   *   ownerType,
   *   tenantId,
   *   organizationId,
   *   environmentId
   * })
   */
  async list(
    filter = {},
    scopeInput
  ) {
    const {
      queryFilter,
      scope,
    } =
      _splitFilterAndScope(
        filter,
        scopeInput
      );

    const base =
      {};

    if (
      queryFilter.lifecycle
    ) {
      base.lifecycle =
        queryFilter
          .lifecycle;
    }

    if (
      queryFilter.ownerType
    ) {
      base[
        'owner.ownerType'
      ] =
        queryFilter
          .ownerType;
    }

    if (
      queryFilter.runbookId
    ) {
      base.runbookId =
        queryFilter
          .runbookId;
    }

    if (
      queryFilter.category
    ) {
      base.category =
        queryFilter
          .category;
    }

    const visibility =
      _buildVisibilityFilter(
        scope
      );

    return Runbook
      .find({
        ...base,

        ...visibility,
      })
      .lean();
  }

  /**
   * Search visible runbooks by name.
   */
  async search(
    query,
    scopeInput
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const visibility =
      _buildVisibilityFilter(
        scope
      );

    return Runbook
      .find({
        name: {
          $regex:
            query,

          $options:
            'i',
        },

        ...visibility,
      })
      .lean();
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  async validate(
    runbookId,
    semver,
    scopeInput,
    purpose =
      VALIDATION_PURPOSE
        .AUTHORING
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const doc =
      await this.getVersion(
        runbookId,
        semver,
        scope
      );

    return validateRunbook(
      doc,
      {
        purpose,

        tenantContext:
          _validationContext(
            scope
          ),

        actionRegistry:
          this
            ._getActionRegistry(),
      }
    );
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async validate_lifecycle(
    runbookId,
    semver,
    scopeInput,
    context = {}
  ) {
    return this._transition(
      runbookId,
      semver,
      scopeInput,

      RUNBOOK_LIFECYCLE
        .VALIDATED,

      {
        purpose:
          VALIDATION_PURPOSE
            .AUTHORING,

        ...context,
      }
    );
  }

  async approve(
    runbookId,
    semver,
    scopeInput,
    context = {}
  ) {
    return this._transition(
      runbookId,
      semver,
      scopeInput,

      RUNBOOK_LIFECYCLE
        .APPROVED,

      {
        purpose:
          VALIDATION_PURPOSE
            .APPROVAL,

        ...context,
      }
    );
  }

  async activate(
    runbookId,
    semver,
    scopeInput,
    context = {}
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const doc =
      await this.getVersion(
        runbookId,
        semver,
        scope
      );

    const validation =
      validateRunbook(
        doc,
        {
          purpose:
            VALIDATION_PURPOSE
              .ACTIVATION,

          tenantContext:
            _validationContext(
              scope
            ),

          actionRegistry:
            this
              ._getActionRegistry(),
        }
      );

    if (
      !validation.valid
    ) {
      const errors =
        validation
          .diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.severity ===
              'ERROR'
          );

      throw new RegistryError(
        'ACTIVATION_VALIDATION_FAILED',

        `Activation blocked: ${errors.length} error(s) must be resolved`,

        {
          diagnostics:
            validation
              .diagnostics,
        }
      );
    }

    return this
      ._applyTransition(
        doc,

        RUNBOOK_LIFECYCLE
          .ACTIVE,

        context
      );
  }

  async disable(
    runbookId,
    semver,
    scopeInput,
    context = {}
  ) {
    return this._transition(
      runbookId,
      semver,
      scopeInput,

      RUNBOOK_LIFECYCLE
        .DISABLED,

      {
        skipValidation:
          true,

        ...context,
      }
    );
  }

  async deprecate(
    runbookId,
    semver,
    scopeInput,
    context = {}
  ) {
    return this._transition(
      runbookId,
      semver,
      scopeInput,

      RUNBOOK_LIFECYCLE
        .DEPRECATED,

      {
        skipValidation:
          true,

        ...context,
      }
    );
  }

  // ==========================================================================
  // VERSIONING
  // ==========================================================================

  async createVersion(
    runbookId,
    baseSemver,
    newSemver,
    updates,
    scopeInput,
    context = {}
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const base =
      await this.getVersion(
        runbookId,
        baseSemver,
        scope
      );

    /**
     * Version progression should only consider the ownership
     * branch the base definition belongs to.
     *
     * Do not let SYSTEM versions interfere with a tenant branch
     * and vice versa.
     */
    const branchVersions =
      await this
        ._getOwnershipBranchVersions(
          base
        );

    const existing =
      branchVersions.map(
        (doc) =>
          doc.semver
      );

    const semverCheck =
      validateNewVersion(
        newSemver,
        existing
      );

    if (
      !semverCheck.valid
    ) {
      throw new RegistryError(
        'INVALID_VERSION',

        semverCheck.reason
      );
    }

    const newDef = {
      ...base,

      ...updates,

      runbookId,

      semver:
        newSemver,

      lifecycle:
        RUNBOOK_LIFECYCLE
          .DRAFT,

      immutable:
        false,

      checksum:
        undefined,

      _id:
        undefined,

      createdAt:
        undefined,

      updatedAt:
        undefined,
    };

    delete newDef._id;
    delete newDef.createdAt;
    delete newDef.updatedAt;
    delete newDef.__v;
    delete newDef.checksum;

    const baseScope =
      _scopeFromDocument(
        base
      );

    return this.register(
      newDef,
      {
        ...baseScope,

        ...context,
      }
    );
  }

  // ==========================================================================
  // EXECUTION READINESS
  // ==========================================================================

  async isExecutable(
    runbookId,
    semver,
    scopeInput
  ) {
    try {
      const doc =
        await this.getVersion(
          runbookId,
          semver,
          scopeInput
        );

      return (
        doc.lifecycle ===
        RUNBOOK_LIFECYCLE
          .ACTIVE
      );
    } catch {
      return false;
    }
  }

  /**
   * Return immutable execution definition.
   *
   * Critical:
   * immutable locking targets the exact resolved Mongo record by _id,
   * never merely runbookId + semver.
   */
  async getExecutionDefinition(
    runbookId,
    semver,
    scopeInput
  ) {
    const doc =
      await this.getVersion(
        runbookId,
        semver,
        scopeInput
      );

    if (
      doc.lifecycle !==
      RUNBOOK_LIFECYCLE
        .ACTIVE
    ) {
      throw new RegistryError(
        'NOT_EXECUTABLE',

        `Runbook ${runbookId}@${semver} is ${doc.lifecycle}, not ACTIVE. Only ACTIVE runbooks may execute.`
      );
    }

    if (
      !doc.immutable
    ) {
      const result =
        await Runbook
          .updateOne(
            {
              _id:
                doc._id,

              lifecycle:
                RUNBOOK_LIFECYCLE
                  .ACTIVE,
            },

            {
              $set: {
                immutable:
                  true,
              },
            }
          );

      if (
        result.matchedCount ===
        0
      ) {
        throw new RegistryError(
          'EXECUTION_LOCK_CONFLICT',

          `Runbook ${runbookId}@${semver} could not be locked for execution`
        );
      }
    }

    const checksum =
      computeChecksum(
        doc
      );

    return {
      ...doc,

      immutable:
        true,

      checksum,

      versionRef:
        versionRef(
          runbookId,
          semver
        ),
    };
  }

  // ==========================================================================
  // INTERNAL RETRIEVAL
  // ==========================================================================

  async _findExactTenantVersion(
    runbookId,
    semver,
    scope
  ) {
    if (
      !scope.tenantId
    ) {
      return null;
    }

    /**
     * Full canonical scope.
     */
    if (
      scope.organizationId &&
      scope.environmentId
    ) {
      return Runbook
        .findOne({
          runbookId,

          semver,

          tenantId:
            scope.tenantId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          'owner.ownerType': {
            $ne:
              RUNBOOK_OWNER_TYPE
                .SYSTEM,
          },
        })
        .lean();
    }

    /**
     * Legacy compatibility only.
     *
     * New production callers must provide organizationId + environmentId.
     */
    return Runbook
      .findOne({
        runbookId,

        semver,

        tenantId:
          scope.tenantId,

        'owner.ownerType': {
          $ne:
            RUNBOOK_OWNER_TYPE
              .SYSTEM,
        },
      })
      .lean();
  }

  async _findExactSystemVersion(
    runbookId,
    semver
  ) {
    return Runbook
      .findOne({
        runbookId,

        semver,

        'owner.ownerType':
          RUNBOOK_OWNER_TYPE
            .SYSTEM,
      })
      .lean();
  }

  async _findTenantVersions(
    runbookId,
    scope
  ) {
    if (
      !scope.tenantId
    ) {
      return [];
    }

    const ownership =
      {
        tenantId:
          scope.tenantId,

        'owner.ownerType': {
          $ne:
            RUNBOOK_OWNER_TYPE
              .SYSTEM,
        },
      };

    if (
      scope.organizationId &&
      scope.environmentId
    ) {
      ownership.organizationId =
        scope.organizationId;

      ownership.environmentId =
        scope.environmentId;
    }

    return Runbook
      .find({
        runbookId,

        ...ownership,
      })
      .lean();
  }

  async _findSystemVersions(
    runbookId
  ) {
    return Runbook
      .find({
        runbookId,

        'owner.ownerType':
          RUNBOOK_OWNER_TYPE
            .SYSTEM,
      })
      .lean();
  }

  async _getOwnershipBranchVersions(
    doc
  ) {
    if (
      _isSystemOwned(
        doc
      )
    ) {
      return Runbook
        .find({
          runbookId:
            doc.runbookId,

          'owner.ownerType':
            RUNBOOK_OWNER_TYPE
              .SYSTEM,
        })
        .lean();
    }

    const filter = {
      runbookId:
        doc.runbookId,

      tenantId:
        doc.tenantId,

      'owner.ownerType': {
        $ne:
          RUNBOOK_OWNER_TYPE
            .SYSTEM,
      },
    };

    if (
      doc.organizationId
    ) {
      filter.organizationId =
        doc.organizationId;
    }

    if (
      doc.environmentId
    ) {
      filter.environmentId =
        doc.environmentId;
    }

    return Runbook
      .find(
        filter
      )
      .lean();
  }

  // ==========================================================================
  // INTERNAL LIFECYCLE
  // ==========================================================================

  async _transition(
    runbookId,
    semver,
    scopeInput,
    targetLifecycle,
    context = {}
  ) {
    const scope =
      _normalizeScopeInput(
        scopeInput
      );

    const doc =
      await this.getVersion(
        runbookId,
        semver,
        scope
      );

    if (
      targetLifecycle ===
      RUNBOOK_LIFECYCLE
        .ACTIVE
    ) {
      return this.activate(
        runbookId,
        semver,
        scope,
        context
      );
    }

    if (
      !context
        .skipValidation
    ) {
      const validation =
        validateRunbook(
          doc,
          {
            purpose:
              context.purpose ||
              VALIDATION_PURPOSE
                .AUTHORING,

            tenantContext:
              _validationContext(
                scope
              ),

            actionRegistry:
              this
                ._getActionRegistry(),
          }
        );

      if (
        !validation.valid
      ) {
        const errors =
          validation
            .diagnostics
            .filter(
              (diagnostic) =>
                diagnostic.severity ===
                'ERROR'
            );

        throw new RegistryError(
          'VALIDATION_FAILED',

          `Transition to ${targetLifecycle} blocked: ${errors.length} error(s)`,

          {
            diagnostics:
              validation
                .diagnostics,
          }
        );
      }
    }

    return this
      ._applyTransition(
        doc,
        targetLifecycle,
        context
      );
  }

  /**
   * Exact-record lifecycle update.
   *
   * _id + current lifecycle forms the optimistic lock.
   *
   * This prevents a lifecycle mutation from ever targeting another
   * environment's copy of the same runbook/version.
   */
  async _applyTransition(
    doc,
    targetLifecycle,
    context = {}
  ) {
    const allowed =
      RUNBOOK_LIFECYCLE_TRANSITIONS[
        doc.lifecycle
      ] ||
      [];

    if (
      !allowed.includes(
        targetLifecycle
      )
    ) {
      throw new RegistryError(
        'INVALID_TRANSITION',

        `Cannot transition from ${doc.lifecycle} to ${targetLifecycle}`,

        {
          allowed,
        }
      );
    }

    const updated =
      await Runbook
        .findOneAndUpdate(
          {
            _id:
              doc._id,

            lifecycle:
              doc.lifecycle,
          },

          {
            $set: {
              lifecycle:
                targetLifecycle,

              [
                `${targetLifecycle.toLowerCase()}At`
              ]:
                new Date(),

              transitionedBy:
                context
                  .initiatedBy ||
                'system',
            },
          },

          {
            new:
              true,
          }
        )
        .lean();

    if (!updated) {
      throw new RegistryError(
        'TRANSITION_CONFLICT',

        `Lifecycle transition to ${targetLifecycle} failed — optimistic lock mismatch`
      );
    }

    return updated;
  }
}

// ============================================================================
// DEFINITION / OWNERSHIP HELPERS
// ============================================================================

function _assertDefinition(
  definition
) {
  if (
    !definition ||
    typeof definition !==
      'object'
  ) {
    throw new RegistryError(
      'INVALID_DEFINITION',

      'Definition must be an object'
    );
  }

  if (
    !definition.runbookId
  ) {
    throw new RegistryError(
      'INVALID_DEFINITION',

      'runbookId is required'
    );
  }

  if (
    !definition.semver
  ) {
    throw new RegistryError(
      'INVALID_DEFINITION',

      'semver is required'
    );
  }

  if (
    !definition.name
  ) {
    throw new RegistryError(
      'INVALID_DEFINITION',

      'name is required'
    );
  }
}

function _resolveOwnerType(
  definition,
  scope
) {
  const explicit =
    definition
      .owner
      ?.ownerType;

  if (explicit) {
    return explicit;
  }

  /**
   * Legacy tenant definitions may not have ownerType.
   */
  if (
    scope.tenantId ||
    definition.tenantId
  ) {
    return (
      RUNBOOK_OWNER_TYPE
        .TENANT ||
      'tenant'
    );
  }

  return undefined;
}

function _assertOwnership(
  definition,
  scope,
  ownerType
) {
  if (
    ownerType ===
    RUNBOOK_OWNER_TYPE
      .SYSTEM
  ) {
    return;
  }

  /**
   * Every non-system definition is tenant-owned.
   */
  if (
    !scope.tenantId
  ) {
    throw new RegistryError(
      'TENANT_REQUIRED',

      'Tenant runbook requires tenantId'
    );
  }

  if (
    !scope.organizationId
  ) {
    throw new RegistryError(
      'ORGANIZATION_REQUIRED',

      'Tenant runbook requires organizationId'
    );
  }

  if (
    !scope.environmentId
  ) {
    throw new RegistryError(
      'ENVIRONMENT_REQUIRED',

      'Tenant runbook requires environmentId'
    );
  }
}

function _ownershipFieldsForCreate(
  definition,
  scope,
  ownerType
) {
  if (
    ownerType ===
    RUNBOOK_OWNER_TYPE
      .SYSTEM
  ) {
    /**
     * SYSTEM runbooks are globally reusable.
     *
     * Preserve an explicitly supplied tenantId only for legacy
     * compatibility, but never assign environment ownership automatically.
     */
    return {
      tenantId:
        definition.tenantId ??
        null,

      organizationId:
        definition
          .organizationId ??
        null,

      environmentId:
        definition
          .environmentId ??
        null,
    };
  }

  return {
    tenantId:
      scope.tenantId,

    organizationId:
      scope.organizationId,

    environmentId:
      scope.environmentId,
  };
}

function _buildExactOwnershipFilter(
  runbookId,
  semver,
  scope,
  ownerType
) {
  if (
    ownerType ===
    RUNBOOK_OWNER_TYPE
      .SYSTEM
  ) {
    return {
      runbookId,

      semver,

      'owner.ownerType':
        RUNBOOK_OWNER_TYPE
          .SYSTEM,
    };
  }

  return {
    runbookId,

    semver,

    tenantId:
      scope.tenantId,

    organizationId:
      scope.organizationId,

    environmentId:
      scope.environmentId,

    'owner.ownerType': {
      $ne:
        RUNBOOK_OWNER_TYPE
          .SYSTEM,
    },
  };
}

// ============================================================================
// SCOPE HELPERS
// ============================================================================

function _normalizeScope(
  context = {},
  definition = {}
) {
  return {
    tenantId:
      context.tenantId ||
      definition.tenantId ||
      null,

    organizationId:
      context.organizationId ||
      context.orgId ||
      definition.organizationId ||
      definition.orgId ||
      null,

    environmentId:
      context.environmentId ||
      definition.environmentId ||
      null,

    initiatedBy:
      context.initiatedBy ||
      null,
  };
}

/**
 * Backward-compatible normalizer.
 *
 * Accepts:
 *
 * "tenant-a"
 *
 * OR
 *
 * {
 *   tenantId,
 *   organizationId,
 *   environmentId
 * }
 */
function _normalizeScopeInput(
  input
) {
  if (!input) {
    return {
      tenantId:
        null,

      organizationId:
        null,

      environmentId:
        null,
    };
  }

  if (
    typeof input ===
    'string'
  ) {
    return {
      tenantId:
        input,

      organizationId:
        null,

      environmentId:
        null,
    };
  }

  return {
    tenantId:
      input.tenantId ||
      null,

    organizationId:
      input.organizationId ||
      input.orgId ||
      null,

    environmentId:
      input.environmentId ||
      null,
  };
}

/**
 * Allows:
 *
 * list(filter, scope)
 *
 * and:
 *
 * list({
 *   lifecycle,
 *   tenantId,
 *   organizationId,
 *   environmentId
 * })
 */
function _splitFilterAndScope(
  filter = {},
  explicitScope
) {
  if (explicitScope) {
    return {
      queryFilter:
        filter,

      scope:
        _normalizeScopeInput(
          explicitScope
        ),
    };
  }

  const {
    tenantId,
    organizationId,
    environmentId,
    orgId,
    ...queryFilter
  } =
    filter;

  return {
    queryFilter,

    scope:
      _normalizeScopeInput({
        tenantId,
        organizationId:
          organizationId ||
          orgId,
        environmentId,
      }),
  };
}

// ============================================================================
// VISIBILITY
// ============================================================================

function _buildVisibilityFilter(
  scope
) {
  const systemClause = {
    'owner.ownerType':
      RUNBOOK_OWNER_TYPE
        .SYSTEM,
  };

  if (
    !scope.tenantId
  ) {
    return systemClause;
  }

  /**
   * Canonical Phase 1 scope.
   */
  if (
    scope.organizationId &&
    scope.environmentId
  ) {
    return {
      $or: [
        {
          tenantId:
            scope.tenantId,

          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          'owner.ownerType': {
            $ne:
              RUNBOOK_OWNER_TYPE
                .SYSTEM,
          },
        },

        systemClause,
      ],
    };
  }

  /**
   * Legacy compatibility.
   *
   * New production paths should not use this mode.
   */
  return {
    $or: [
      {
        tenantId:
          scope.tenantId,

        'owner.ownerType': {
          $ne:
            RUNBOOK_OWNER_TYPE
              .SYSTEM,
        },
      },

      systemClause,
    ],
  };
}

/**
 * Tenant definitions override SYSTEM definitions with the same semver.
 */
function _mergeVisibleVersions(
  tenantDocs,
  systemDocs
) {
  const versions =
    new Map();

  for (
    const systemDoc
    of systemDocs
  ) {
    versions.set(
      systemDoc.semver,
      systemDoc
    );
  }

  for (
    const tenantDoc
    of tenantDocs
  ) {
    versions.set(
      tenantDoc.semver,
      tenantDoc
    );
  }

  return Array
    .from(
      versions.values()
    )
    .sort(
      (a, b) =>
        compareVersions(
          b.semver,
          a.semver
        )
    );
}

// ============================================================================
// VALIDATION CONTEXT
// ============================================================================

function _validationContext(
  scope
) {
  if (
    !scope ||
    !scope.tenantId
  ) {
    return undefined;
  }

  return {
    tenantId:
      scope.tenantId,

    organizationId:
      scope.organizationId ||
      undefined,

    environmentId:
      scope.environmentId ||
      undefined,
  };
}

// ============================================================================
// DOCUMENT OWNERSHIP
// ============================================================================

function _isSystemOwned(
  doc
) {
  return (
    doc
      ?.owner
      ?.ownerType ===
    RUNBOOK_OWNER_TYPE
      .SYSTEM
  );
}

function _scopeFromDocument(
  doc
) {
  return {
    tenantId:
      doc.tenantId ||
      null,

    organizationId:
      doc.organizationId ||
      null,

    environmentId:
      doc.environmentId ||
      null,
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getRunbookRegistry(
  options
) {
  if (
    !instance ||
    options
  ) {
    instance =
      new RunbookRegistry(
        options ||
        {}
      );
  }

  return instance;
}

function resetRunbookRegistry() {
  instance =
    null;
}

module.exports = {
  RunbookRegistry,
  getRunbookRegistry,
  resetRunbookRegistry,
  RegistryError,
};