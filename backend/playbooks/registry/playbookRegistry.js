"use strict";

/**
 * Playbook Registry
 *
 * Environment-aware authoritative lifecycle registry.
 *
 * Ownership rules:
 *
 * SYSTEM playbook
 *   owner.ownerType = system
 *   tenantId = null
 *   organizationId = null
 *   environmentId = null
 *
 * TENANT playbook
 *   tenantId required
 *   organizationId required
 *   environmentId required
 *
 * Resolution order:
 *
 * 1. tenant playbook in exact organization + environment
 * 2. system playbook
 *
 * Never cross environments.
 */

const {
  PLAYBOOK_LIFECYCLE,
  PLAYBOOK_LIFECYCLE_TRANSITIONS,
  PLAYBOOK_VALIDATION_PURPOSE,
  PLAYBOOK_OWNER_TYPE,
} = require("../../constants/playbook");

const {
  validatePlaybook,
} = require("../validators/playbookValidator");

const {
  computePlaybookChecksum,
  playbookVersionRef,
  isNewerVersion,
} = require("../versioning/playbookVersioning");

// ============================================================================
// ERRORS
// ============================================================================

class PlaybookRegistryError extends Error {
  constructor(
    code,
    message,
    details = {}
  ) {
    super(message);

    this.name =
      "PlaybookRegistryError";

    this.code =
      code;

    this.details =
      details;
  }
}

const REGISTRY_ERROR_CODES =
  Object.freeze({
    NOT_FOUND:
      "NOT_FOUND",

    DUPLICATE_VERSION:
      "DUPLICATE_VERSION",

    IMPORT_VALIDATION_FAILED:
      "IMPORT_VALIDATION_FAILED",

    ACTIVATION_VALIDATION_FAILED:
      "ACTIVATION_VALIDATION_FAILED",

    VALIDATION_FAILED:
      "VALIDATION_FAILED",

    INVALID_TRANSITION:
      "INVALID_TRANSITION",

    TRANSITION_CONFLICT:
      "TRANSITION_CONFLICT",

    POLICY_DENIED:
      "POLICY_DENIED",

    NOT_EXECUTABLE:
      "NOT_EXECUTABLE",

    TENANT_REQUIRED:
      "TENANT_REQUIRED",

    ORGANIZATION_REQUIRED:
      "ORGANIZATION_REQUIRED",

    ENVIRONMENT_REQUIRED:
      "ENVIRONMENT_REQUIRED",

    INVALID_VERSION:
      "INVALID_VERSION",
  });

// ============================================================================
// REGISTRY
// ============================================================================

class PlaybookRegistry {
  constructor() {
    /**
     * Keyed by ownership-aware composite key:
     *
     * system::<playbookId>::<semver>
     *
     * tenant::<organizationId>::<environmentId>::<playbookId>::<semver>
     */
    this._store =
      new Map();
  }

  // ==========================================================================
  // REGISTER
  // ==========================================================================

  async register(
    playbook,
    options = {}
  ) {
    _requireFields(
      playbook,
      [
        "playbookId",
        "semver",
      ]
    );

    const {
      playbookId,
      semver,
    } = playbook;

    const scope =
      _resolveOwnership(
        playbook,
        options
      );

    const purpose =
      options.validate ===
      false
        ? null
        : (
            options.purpose ||
            PLAYBOOK_VALIDATION_PURPOSE
              .IMPORT
          );

    if (purpose) {
      const validation =
        await validatePlaybook(
          {
            ...playbook,

            tenantId:
              scope.tenantId,

            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,
          },
          {
            purpose,

            runbookRegistry:
              options.runbookRegistry,

            tenantContext:
              scope.isSystem
                ? undefined
                : {
                    tenantId:
                      scope.tenantId,

                    organizationId:
                      scope.organizationId,

                    environmentId:
                      scope.environmentId,
                  },
          }
        );

      if (
        !validation.valid
      ) {
        throw new PlaybookRegistryError(
          REGISTRY_ERROR_CODES
            .IMPORT_VALIDATION_FAILED,

          `Playbook validation failed for ${playbookId}@${semver}`,

          {
            diagnostics:
              validation.diagnostics,

            summary:
              validation.summary,
          }
        );
      }
    }

    const storageKey =
      _entryKey(
        playbookId,
        semver,
        scope
      );

    if (
      this._store.has(
        storageKey
      )
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .DUPLICATE_VERSION,

        `Playbook ${playbookId}@${semver} is already registered in this ownership scope`
      );
    }

    const entry = {
      ...playbook,

      tenantId:
        scope.tenantId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      checksum:
        computePlaybookChecksum(
          playbook
        ),

      immutable:
        false,

      _registeredAt:
        new Date()
          .toISOString(),
    };

    this._store.set(
      storageKey,
      entry
    );

    return entry;
  }

  // ==========================================================================
  // IMPORT
  // ==========================================================================

  async importDefinition(
    playbook,
    options = {}
  ) {
    return this.register(
      playbook,
      {
        ...options,

        purpose:
          PLAYBOOK_VALIDATION_PURPOSE
            .IMPORT,
      }
    );
  }

  // ==========================================================================
  // GET ALL VERSIONS
  // ==========================================================================

  async getById(
    playbookId,
    context = {}
  ) {
    const scope =
      _normalizeContext(
        context
      );

    const candidates =
      [];

    for (
      const entry
      of this._store.values()
    ) {
      if (
        entry.playbookId !==
        playbookId
      ) {
        continue;
      }

      if (
        _isVisibleToScope(
          entry,
          scope
        )
      ) {
        candidates.push(
          entry
        );
      }
    }

    if (
      candidates.length ===
      0
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .NOT_FOUND,

        `Playbook "${playbookId}" not found`
      );
    }

    return candidates;
  }

  // ==========================================================================
  // GET VERSION
  // ==========================================================================

  async getVersion(
    playbookId,
    semver,
    context = {}
  ) {
    const scope =
      _normalizeContext(
        context
      );

    const tenantKey =
      scope.organizationId &&
      scope.environmentId
        ? _entryKey(
            playbookId,
            semver,
            {
              isSystem:
                false,

              organizationId:
                scope.organizationId,

              environmentId:
                scope.environmentId,
            }
          )
        : null;

    if (
      tenantKey &&
      this._store.has(
        tenantKey
      )
    ) {
      const entry =
        this._store.get(
          tenantKey
        );

      if (
        !scope.tenantId ||
        !entry.tenantId ||
        entry.tenantId ===
          scope.tenantId
      ) {
        return entry;
      }
    }

    const systemKey =
      _entryKey(
        playbookId,
        semver,
        {
          isSystem:
            true,
        }
      );

    if (
      this._store.has(
        systemKey
      )
    ) {
      return this._store.get(
        systemKey
      );
    }

    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .NOT_FOUND,

      `Playbook ${playbookId}@${semver} not found for active environment`
    );
  }

  // ==========================================================================
  // LATEST
  // ==========================================================================

  async getLatestVersion(
    playbookId,
    context = {}
  ) {
    const all =
      await this.getById(
        playbookId,
        context
      );

    return all.reduce(
      (
        best,
        current
      ) =>
        !best ||
        isNewerVersion(
          current.semver,
          best.semver
        )
          ? current
          : best,
      null
    );
  }

  // ==========================================================================
  // LIST
  // ==========================================================================

  async list(
    options = {}
  ) {
    const {
      lifecycle,
      category,
    } = options;

    const scope =
      _normalizeContext(
        options
      );

    const results =
      [];

    for (
      const entry
      of this._store.values()
    ) {
      if (
        !_isVisibleToScope(
          entry,
          scope
        )
      ) {
        continue;
      }

      if (
        lifecycle &&
        entry.lifecycle !==
          lifecycle
      ) {
        continue;
      }

      if (
        category &&
        entry.category !==
          category
      ) {
        continue;
      }

      results.push(
        entry
      );
    }

    return results;
  }

  // ==========================================================================
  // VALIDATE
  // ==========================================================================

  async validate(
    playbookId,
    semver,
    options = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        options
      );

    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .VALIDATED,
      playbookId,
      semver
    );

    const scope =
      _normalizeContext(
        options
      );

    const result =
      await validatePlaybook(
        entry,
        {
          purpose:
            PLAYBOOK_VALIDATION_PURPOSE
              .APPROVAL,

          runbookRegistry:
            options.runbookRegistry,

          tenantContext:
            _tenantContext(
              scope
            ),
        }
      );

    if (
      !result.valid
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .VALIDATION_FAILED,

        `Validation failed for ${playbookId}@${semver}`,

        {
          diagnostics:
            result.diagnostics,
        }
      );
    }

    entry.lifecycle =
      PLAYBOOK_LIFECYCLE
        .VALIDATED;

    entry.checksum =
      computePlaybookChecksum(
        entry
      );

    return {
      ...entry,

      validationResult:
        result,
    };
  }

  // ==========================================================================
  // APPROVE
  // ==========================================================================

  async approve(
    playbookId,
    semver,
    options = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        options
      );

    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .APPROVED,
      playbookId,
      semver
    );

    entry.lifecycle =
      PLAYBOOK_LIFECYCLE
        .APPROVED;

    entry._approvedAt =
      new Date()
        .toISOString();

    entry._approvedBy =
      options.approvedBy ||
      "system";

    return {
      ...entry,
    };
  }

  // ==========================================================================
  // ACTIVATE
  // ==========================================================================

  async activate(
    playbookId,
    semver,
    options = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        options
      );

    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .ACTIVE,
      playbookId,
      semver
    );

    const scope =
      _normalizeContext(
        options
      );

    const result =
      await validatePlaybook(
        entry,
        {
          purpose:
            PLAYBOOK_VALIDATION_PURPOSE
              .ACTIVATION,

          runbookRegistry:
            options.runbookRegistry,

          tenantContext:
            _tenantContext(
              scope
            ),
        }
      );

    if (
      !result.valid
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .ACTIVATION_VALIDATION_FAILED,

        `Activation validation failed for ${playbookId}@${semver}`,

        {
          diagnostics:
            result.diagnostics,

          summary:
            result.summary,
        }
      );
    }

    entry.lifecycle =
      PLAYBOOK_LIFECYCLE
        .ACTIVE;

    entry._activatedAt =
      new Date()
        .toISOString();

    entry.checksum =
      computePlaybookChecksum(
        entry
      );

    return {
      ...entry,
    };
  }

  // ==========================================================================
  // DISABLE
  // ==========================================================================

  async disable(
    playbookId,
    semver,
    options = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        options
      );

    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .DISABLED,
      playbookId,
      semver
    );

    entry.lifecycle =
      PLAYBOOK_LIFECYCLE
        .DISABLED;

    entry._disabledAt =
      new Date()
        .toISOString();

    entry._disabledBy =
      options.disabledBy ||
      "system";

    entry._disabledReason =
      options.reason ||
      null;

    return {
      ...entry,
    };
  }

  // ==========================================================================
  // DEPRECATE
  // ==========================================================================

  async deprecate(
    playbookId,
    semver,
    options = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        options
      );

    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .DEPRECATED,
      playbookId,
      semver
    );

    entry.lifecycle =
      PLAYBOOK_LIFECYCLE
        .DEPRECATED;

    entry._deprecatedAt =
      new Date()
        .toISOString();

    entry._deprecatedBy =
      options.deprecatedBy ||
      "system";

    entry._deprecationReason =
      options.reason ||
      null;

    return {
      ...entry,
    };
  }

  // ==========================================================================
  // CREATE VERSION
  // ==========================================================================

  async createVersion(
    playbookId,
    baseSemver,
    newSemver,
    patches = {},
    options = {}
  ) {
    const base =
      await this.getVersion(
        playbookId,
        baseSemver,
        options
      );

    const scope =
      _resolveOwnership(
        base,
        options
      );

    const newKey =
      _entryKey(
        playbookId,
        newSemver,
        scope
      );

    if (
      this._store.has(
        newKey
      )
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .DUPLICATE_VERSION,

        `Playbook ${playbookId}@${newSemver} already exists in this ownership scope`
      );
    }

    const newDefinition = {
      ...base,
      ...patches,

      semver:
        newSemver,

      lifecycle:
        PLAYBOOK_LIFECYCLE
          .DRAFT,

      immutable:
        false,

      checksum:
        null,

      _registeredAt:
        new Date()
          .toISOString(),
    };

    return this.register(
      newDefinition,
      {
        ...options,

        validate:
          false,
      }
    );
  }

  // ==========================================================================
  // EXECUTION DEFINITION
  // ==========================================================================

  async getExecutionDefinition(
    playbookId,
    semver,
    context = {}
  ) {
    const entry =
      await this.getVersion(
        playbookId,
        semver,
        context
      );

    if (
      entry.lifecycle !==
      PLAYBOOK_LIFECYCLE
        .ACTIVE
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .NOT_EXECUTABLE,

        `Playbook ${playbookId}@${semver} is not ACTIVE (lifecycle: ${entry.lifecycle})`
      );
    }

    if (
      !entry.immutable
    ) {
      entry.immutable =
        true;

      entry.checksum =
        computePlaybookChecksum(
          entry
        );

      entry._frozenAt =
        new Date()
          .toISOString();
    }

    return Object.freeze(
      JSON.parse(
        JSON.stringify(
          entry
        )
      )
    );
  }

  // ==========================================================================
  // EXECUTABLE
  // ==========================================================================

  isExecutable(
    entry
  ) {
    return (
      entry?.lifecycle ===
      PLAYBOOK_LIFECYCLE
        .ACTIVE
    );
  }

  // ==========================================================================
  // SIZE
  // ==========================================================================

  get size() {
    return this._store
      .size;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function _requireFields(
  object,
  fields
) {
  for (
    const field
    of fields
  ) {
    if (
      !object[field]
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .VALIDATION_FAILED,

        `Playbook definition missing required field: ${field}`
      );
    }
  }
}

function _assertTransition(
  entry,
  targetLifecycle,
  playbookId,
  semver
) {
  const allowed =
    PLAYBOOK_LIFECYCLE_TRANSITIONS[
      entry.lifecycle
    ] ||
    [];

  if (
    !allowed.includes(
      targetLifecycle
    )
  ) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .INVALID_TRANSITION,

      `Cannot transition ${playbookId}@${semver} from ${entry.lifecycle} → ${targetLifecycle}. Allowed: ${
        allowed.length
          ? allowed.join(", ")
          : "none"
      }`
    );
  }
}

function _normalizeContext(
  context = {}
) {
  /**
   * Compatibility:
   * older callers may still pass tenantId as a string.
   */
  if (
    typeof context ===
    "string"
  ) {
    return {
      tenantId:
        context,

      organizationId:
        null,

      environmentId:
        null,
    };
  }

  return {
    tenantId:
      context.tenantId ||
      null,

    organizationId:
      context.organizationId ||
      null,

    environmentId:
      context.environmentId ||
      null,
  };
}

function _resolveOwnership(
  definition,
  context = {}
) {
  const normalized =
    _normalizeContext(
      context
    );

  const ownerType =
    definition.owner
      ?.ownerType ||
    PLAYBOOK_OWNER_TYPE
      .SYSTEM ||
    "system";

  const isSystem =
    String(
      ownerType
    ).toLowerCase() ===
    "system";

  if (isSystem) {
    return {
      isSystem:
        true,

      tenantId:
        null,

      organizationId:
        null,

      environmentId:
        null,
    };
  }

  const tenantId =
    normalized.tenantId ||
    definition.tenantId;

  const organizationId =
    normalized.organizationId ||
    definition.organizationId;

  const environmentId =
    normalized.environmentId ||
    definition.environmentId;

  if (!tenantId) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .TENANT_REQUIRED,

      "Tenant playbook requires tenantId"
    );
  }

  if (!organizationId) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .ORGANIZATION_REQUIRED,

      "Tenant playbook requires organizationId"
    );
  }

  if (!environmentId) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .ENVIRONMENT_REQUIRED,

      "Tenant playbook requires environmentId"
    );
  }

  return {
    isSystem:
      false,

    tenantId,

    organizationId:
      String(
        organizationId
      ),

    environmentId:
      String(
        environmentId
      ),
  };
}

function _entryKey(
  playbookId,
  semver,
  scope
) {
  if (
    scope.isSystem
  ) {
    return [
      "system",
      playbookId,
      semver,
    ].join("::");
  }

  return [
    "tenant",
    String(
      scope.organizationId
    ),
    String(
      scope.environmentId
    ),
    playbookId,
    semver,
  ].join("::");
}

function _isSystemEntry(
  entry
) {
  return (
    String(
      entry.owner
        ?.ownerType ||
      ""
    ).toLowerCase() ===
      "system" ||
    (
      !entry.tenantId &&
      !entry.organizationId &&
      !entry.environmentId
    )
  );
}

function _isVisibleToScope(
  entry,
  scope
) {
  if (
    _isSystemEntry(
      entry
    )
  ) {
    return true;
  }

  /**
   * Tenant definition is visible only when both canonical
   * ownership fields match exactly.
   */
  if (
    !scope.organizationId ||
    !scope.environmentId
  ) {
    return false;
  }

  if (
    String(
      entry.organizationId
    ) !==
    String(
      scope.organizationId
    )
  ) {
    return false;
  }

  if (
    String(
      entry.environmentId
    ) !==
    String(
      scope.environmentId
    )
  ) {
    return false;
  }

  if (
    scope.tenantId &&
    entry.tenantId &&
    entry.tenantId !==
      scope.tenantId
  ) {
    return false;
  }

  return true;
}

function _tenantContext(
  scope
) {
  if (
    !scope.tenantId ||
    !scope.organizationId ||
    !scope.environmentId
  ) {
    return undefined;
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

// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;

function getPlaybookRegistry() {
  if (!instance) {
    instance =
      new PlaybookRegistry();
  }

  return instance;
}

function resetPlaybookRegistry() {
  instance =
    null;
}

module.exports = {
  PlaybookRegistry,
  PlaybookRegistryError,
  REGISTRY_ERROR_CODES,
  getPlaybookRegistry,
  resetPlaybookRegistry,
};