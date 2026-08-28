"use strict";

/**
 * Phase 18.6 — PostgreSQL Playbook Registry
 *
 * Canonical persistence:
 *
 *   knowledge.playbook_definitions
 *   knowledge.playbook_versions
 *
 * The previous in-memory Map is retired.
 *
 * This registry remains the public/domain compatibility layer used by:
 *
 * - routes
 * - validation
 * - recovery services
 * - execution preparation
 *
 * It does NOT:
 *
 * - authorize execution
 * - bypass policy
 * - bypass approval
 * - execute infrastructure
 * - generate arbitrary commands
 */

const PostgresPlaybookRepository =
  require(
    "../../persistence/postgres/PostgresPlaybookRepository"
  );


const {
  PLAYBOOK_LIFECYCLE,
  PLAYBOOK_LIFECYCLE_TRANSITIONS,
  PLAYBOOK_VALIDATION_PURPOSE,
  PLAYBOOK_OWNER_TYPE,
} =
  require(
    "../../constants/playbook"
  );


const {
  validatePlaybook,
} =
  require(
    "../validators/playbookValidator"
  );


const {
  isNewerVersion,
} =
  require(
    "../versioning/playbookVersioning"
  );


// ============================================================================
// ERRORS
// ============================================================================

class PlaybookRegistryError
  extends Error {

  constructor(
    code,
    message,
    details = {}
  ) {
    super(
      message
    );

    this.name =
      "PlaybookRegistryError";

    this.code =
      code;

    this.details =
      details;

    this.executionAuthorized =
      false;
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

    CONTROLLED_GLOBAL_IMPORT_REQUIRED:
      "CONTROLLED_GLOBAL_IMPORT_REQUIRED",
  });


// ============================================================================
// REGISTRY
// ============================================================================

class PlaybookRegistry {

  constructor(
    options = {}
  ) {
    this._repository =
      options.repository ||
      new PostgresPlaybookRepository(
        options
      );
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
        "name",
      ]
    );


    const scope =
      _resolveOwnership(
        playbook,
        options
      );


    if (
      scope.isSystem
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .CONTROLLED_GLOBAL_IMPORT_REQUIRED,

        "SYSTEM Playbooks must be imported through the controlled global knowledge importer"
      );
    }


    const canonical = {
      ...playbook,

      tenantId:
        scope.tenantId,

      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,

      owner: {
        ...(
          playbook.owner ||
          {}
        ),

        ownerType:
          PLAYBOOK_OWNER_TYPE
            .TENANT,
      },
    };


    const purpose =
      options.validate ===
      false
        ? null
        : (
            options.purpose ||
            PLAYBOOK_VALIDATION_PURPOSE
              .IMPORT
          );


    if (
      purpose
    ) {
      const validation =
        await validatePlaybook(
          canonical,
          {
            purpose,

            runbookRegistry:
              options.runbookRegistry,

            tenantContext:
              _tenantContext(
                scope
              ),
          }
        );


      if (
        !validation.valid
      ) {
        throw new PlaybookRegistryError(
          REGISTRY_ERROR_CODES
            .IMPORT_VALIDATION_FAILED,

          `Playbook validation failed for ${canonical.playbookId}@${canonical.semver}`,

          {
            diagnostics:
              validation.diagnostics,

            summary:
              validation.summary,
          }
        );
      }
    }


    let definition =
      await this
        ._repository
        .getOwnedDefinitionByKey({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          scopeType:
            "ENVIRONMENT",

          playbookId:
            canonical.playbookId,
        });


    if (
      !definition
    ) {
      definition =
        await this
          ._repository
          .createDefinition({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            scopeType:
              "ENVIRONMENT",

            playbookId:
              canonical.playbookId,

            name:
              canonical.name,

            description:
              canonical.description ||
              null,

            ownerType:
              PLAYBOOK_OWNER_TYPE
                .TENANT,

            sourceType:
              options.sourceType ||
              "API",

            legacyMongoId:
              options.legacyMongoId ||
              null,

            metadata: {
              tenantId:
                scope.tenantId,

              registeredBy:
                options.initiatedBy ||
                null,
            },
          });
    }


    try {

      const stored =
        await this
          ._repository
          .createVersion({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            playbook:
              canonical,

            provenance:
              options.provenance ||
              {
                source:
                  options.sourceType ||
                  "API",
              },

            metadata: {
              tenantId:
                scope.tenantId,

              executionAuthorized:
                false,
            },
          });


      return _flattenVersion(
        stored,
        scope
      );

    } catch (
      error
    ) {

      throw _translateRepositoryError(
        error,
        canonical.playbookId,
        canonical.semver
      );
    }
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

        sourceType:
          options.sourceType ||
          "YAML",
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
      _requireRuntimeScope(
        context
      );


    const versions =
      await this
        ._repository
        .listVisibleVersions({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          playbookId,
        });


    if (
      versions.length ===
      0
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .NOT_FOUND,

        `Playbook "${playbookId}" not found`
      );
    }


    return _mergeVisibleVersions(
      versions.map(
        (
          item
        ) =>
          _flattenVersion(
            item,
            scope
          )
      )
    );
  }


  // ==========================================================================
  // GET EXACT VERSION
  // ==========================================================================

  async getVersion(
    playbookId,
    semver,
    context = {}
  ) {
    const scope =
      _requireRuntimeScope(
        context
      );


    const stored =
      await this
        ._repository
        .getVersion({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          playbookId,

          semver,
        });


    if (
      !stored
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .NOT_FOUND,

        `Playbook ${playbookId}@${semver} not found for active environment`
      );
    }


    return _flattenVersion(
      stored,
      scope
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
    const scope =
      _requireRuntimeScope(
        options
      );


    const versions =
      await this
        ._repository
        .listVisibleVersions({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          lifecycle:
            options.lifecycle,

          category:
            options.category,
        });


    return versions.map(
      (
        item
      ) =>
        _flattenVersion(
          item,
          scope
        )
    );
  }


  // ==========================================================================
  // VALIDATE
  // ==========================================================================

  async validate(
    playbookId,
    semver,
    options = {}
  ) {
    const scope =
      _requireRuntimeScope(
        options
      );


    const entry =
      await this.getVersion(
        playbookId,
        semver,
        scope
      );


    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .VALIDATED,
      playbookId,
      semver
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


    const stored =
      await this
        ._repository
        .transitionVersionLifecycle({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          playbookId,

          semver,

          targetLifecycle:
            PLAYBOOK_LIFECYCLE
              .VALIDATED,
        });


    return {
      ..._flattenVersion(
        stored,
        scope
      ),

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
    return this._transition(
      playbookId,
      semver,
      PLAYBOOK_LIFECYCLE
        .APPROVED,
      options
    );
  }


  // ==========================================================================
  // ACTIVATE
  // ==========================================================================

  async activate(
    playbookId,
    semver,
    options = {}
  ) {
    const scope =
      _requireRuntimeScope(
        options
      );


    const entry =
      await this.getVersion(
        playbookId,
        semver,
        scope
      );


    _assertTransition(
      entry,
      PLAYBOOK_LIFECYCLE
        .ACTIVE,
      playbookId,
      semver
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


    const stored =
      await this
        ._repository
        .transitionVersionLifecycle({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          playbookId,

          semver,

          targetLifecycle:
            PLAYBOOK_LIFECYCLE
              .ACTIVE,
        });


    return _flattenVersion(
      stored,
      scope
    );
  }


  // ==========================================================================
  // DISABLE
  // ==========================================================================

  async disable(
    playbookId,
    semver,
    options = {}
  ) {
    return this._transition(
      playbookId,
      semver,
      PLAYBOOK_LIFECYCLE
        .DISABLED,
      options
    );
  }


  // ==========================================================================
  // DEPRECATE
  // ==========================================================================

  async deprecate(
    playbookId,
    semver,
    options = {}
  ) {
    return this._transition(
      playbookId,
      semver,
      PLAYBOOK_LIFECYCLE
        .DEPRECATED,
      options
    );
  }


  async _transition(
    playbookId,
    semver,
    targetLifecycle,
    options
  ) {
    const scope =
      _requireRuntimeScope(
        options
      );


    const entry =
      await this.getVersion(
        playbookId,
        semver,
        scope
      );


    _assertTransition(
      entry,
      targetLifecycle,
      playbookId,
      semver
    );


    try {

      const stored =
        await this
          ._repository
          .transitionVersionLifecycle({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            playbookId,

            semver,

            targetLifecycle,
          });


      return _flattenVersion(
        stored,
        scope
      );

    } catch (
      error
    ) {

      throw _translateRepositoryError(
        error,
        playbookId,
        semver
      );
    }
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
    const scope =
      _requireRuntimeScope(
        options
      );


    const base =
      await this.getVersion(
        playbookId,
        baseSemver,
        scope
      );


    if (
      base.owner
        ?.ownerType ===
      PLAYBOOK_OWNER_TYPE
        .SYSTEM
    ) {
      throw new PlaybookRegistryError(
        REGISTRY_ERROR_CODES
          .CONTROLLED_GLOBAL_IMPORT_REQUIRED,

        "SYSTEM Playbook versions require the controlled global knowledge importer"
      );
    }


    const definition = {
      ..._stripPersistenceFields(
        base
      ),

      ...patches,

      playbookId,

      semver:
        newSemver,

      lifecycle:
        PLAYBOOK_LIFECYCLE
          .DRAFT,

      immutable:
        false,
    };


    return this.register(
      definition,
      {
        ...options,

        ...scope,

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
    const scope =
      _requireRuntimeScope(
        context
      );


    try {

      const stored =
        await this
          ._repository
          .lockExecutionDefinition({
            organizationId:
              scope.organizationId,

            environmentId:
              scope.environmentId,

            playbookId,

            semver,
          });


      return _deepFreeze(
        _flattenVersion(
          stored,
          scope
        )
      );

    } catch (
      error
    ) {

      if (
        error.code ===
        "POSTGRES_PLAYBOOK_NOT_EXECUTABLE"
      ) {
        throw new PlaybookRegistryError(
          REGISTRY_ERROR_CODES
            .NOT_EXECUTABLE,

          `Playbook ${playbookId}@${semver} is not ACTIVE`
        );
      }


      throw _translateRepositoryError(
        error,
        playbookId,
        semver
      );
    }
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


  /**
   * Retained only so old diagnostics do not crash.
   *
   * PostgreSQL no longer exposes a synchronous authoritative registry size.
   */
  get size() {
    return undefined;
  }
}


// ============================================================================
// HELPERS
// ============================================================================

function _requireFields(
  object,
  fields
) {
  if (
    !object ||
    typeof object !==
      "object"
  ) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .VALIDATION_FAILED,

      "Playbook definition must be an object"
    );
  }


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


function _normalizeContext(
  context = {}
) {
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


  const nested =
    context.tenantContext ||
    {};


  return {
    tenantId:
      context.tenantId ||
      nested.tenantId ||
      null,

    organizationId:
      context.organizationId ||
      context.orgId ||
      nested.organizationId ||
      null,

    environmentId:
      context.environmentId ||
      nested.environmentId ||
      null,
  };
}


function _requireRuntimeScope(
  context = {}
) {
  const scope =
    _normalizeContext(
      context
    );


  if (
    !scope.tenantId
  ) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .TENANT_REQUIRED,

      "tenantId is required for Playbook registry operations"
    );
  }


  if (
    !scope.organizationId
  ) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .ORGANIZATION_REQUIRED,

      "organizationId is required for Playbook registry operations"
    );
  }


  if (
    !scope.environmentId
  ) {
    throw new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .ENVIRONMENT_REQUIRED,

      "environmentId is required for Playbook registry operations"
    );
  }


  return scope;
}


function _resolveOwnership(
  definition,
  context = {}
) {
  const normalized =
    _normalizeContext(
      context
    );


  /**
   * Authenticated runtime context wins over body ownership.
   *
   * This prevents a tenant request from changing ownerType to SYSTEM.
   */
  if (
    normalized.tenantId ||
    normalized.organizationId ||
    normalized.environmentId
  ) {
    return {
      isSystem:
        false,

      ..._requireRuntimeScope(
        normalized
      ),
    };
  }


  const ownerType =
    definition.owner
      ?.ownerType ||
    PLAYBOOK_OWNER_TYPE
      .SYSTEM ||
    "system";


  const isSystem =
    String(
      ownerType
    )
      .toLowerCase() ===
    "system";


  if (
    isSystem
  ) {
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


  return {
    isSystem:
      false,

    ..._requireRuntimeScope(
      definition
    ),
  };
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
          ? allowed.join(
              ", "
            )
          : "none"
      }`
    );
  }
}


function _tenantContext(
  scope
) {
  return {
    tenantId:
      scope.tenantId,

    organizationId:
      scope.organizationId,

    environmentId:
      scope.environmentId,
  };
}


function _flattenVersion(
  stored,
  scope
) {
  if (
    !stored
  ) {
    return null;
  }


  const definition =
    stored.definition ||
    {};


  const isGlobal =
    stored.scopeType ===
    "GLOBAL";


  return {
    ...definition,

    id:
      stored.id,

    publicId:
      stored.publicId,

    playbookDefinitionId:
      stored.playbookDefinitionId,

    playbookId:
      stored.playbookId ||
      definition.playbookId,

    semver:
      stored.semver ||
      definition.semver,

    lifecycle:
      stored.lifecycle,

    checksum:
      stored.checksum,

    immutable:
      Boolean(
        stored.immutable
      ),

    tenantId:
      isGlobal
        ? null
        : (
            definition.tenantId ||
            scope.tenantId
          ),

    organizationId:
      isGlobal
        ? null
        : scope.organizationId,

    environmentId:
      isGlobal
        ? null
        : scope.environmentId,

    owner: {
      ...(
        definition.owner ||
        {}
      ),

      ownerType:
        isGlobal
          ? PLAYBOOK_OWNER_TYPE
              .SYSTEM
          : PLAYBOOK_OWNER_TYPE
              .TENANT,
    },

    provenance:
      stored.provenance ||
      {},

    safety: {
      ...(
        stored.safety ||
        {}
      ),

      executionAuthorized:
        false,

      grantsExecutionPermission:
        false,

      bypassesPolicy:
        false,

      bypassesAuthorization:
        false,
    },

    executionAuthorized:
      false,

    _frozenAt:
      stored.lockedAt ||
      null,

    _registeredAt:
      stored.createdAt ||
      null,
  };
}


function _mergeVisibleVersions(
  entries
) {
  const byVersion =
    new Map();


  /**
   * SYSTEM first.
   *
   * Tenant copy with the same semver then overrides it.
   */
  for (
    const entry
    of entries.filter(
      (
        item
      ) =>
        item.owner
          ?.ownerType ===
        PLAYBOOK_OWNER_TYPE
          .SYSTEM
    )
  ) {
    byVersion.set(
      entry.semver,
      entry
    );
  }


  for (
    const entry
    of entries.filter(
      (
        item
      ) =>
        item.owner
          ?.ownerType !==
        PLAYBOOK_OWNER_TYPE
          .SYSTEM
    )
  ) {
    byVersion.set(
      entry.semver,
      entry
    );
  }


  return Array.from(
    byVersion.values()
  );
}


function _stripPersistenceFields(
  value
) {
  const clean = {
    ...value,
  };


  for (
    const field
    of [
      "id",
      "publicId",
      "playbookDefinitionId",
      "checksum",
      "immutable",
      "provenance",
      "safety",
      "executionAuthorized",
      "_frozenAt",
      "_registeredAt",
    ]
  ) {
    delete clean[
      field
    ];
  }


  return clean;
}


function _translateRepositoryError(
  error,
  playbookId,
  semver
) {
  if (
    error.code ===
      "23505" ||

    error.code ===
      "POSTGRES_PLAYBOOK_VERSION_NOT_NEWER"
  ) {
    return new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .DUPLICATE_VERSION,

      `Playbook ${playbookId}@${semver} already exists or is not a newer version`
    );
  }


  if (
    error.code ===
    "POSTGRES_PLAYBOOK_INVALID_TRANSITION"
  ) {
    return new PlaybookRegistryError(
      REGISTRY_ERROR_CODES
        .INVALID_TRANSITION,

      error.message
    );
  }


  error.executionAuthorized =
    false;


  return error;
}


function _deepFreeze(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  for (
    const child
    of Object.values(
      value
    )
  ) {
    _deepFreeze(
      child
    );
  }


  return value;
}


// ============================================================================
// SINGLETON
// ============================================================================

let instance =
  null;


function getPlaybookRegistry(
  options
) {
  if (
    !instance ||
    options
  ) {
    instance =
      new PlaybookRegistry(
        options ||
        {}
      );
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