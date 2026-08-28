"use strict";

/**
 * Phase 18.6 — PostgreSQL Runbook Registry
 *
 * Canonical persistence:
 *
 *   knowledge.runbook_definitions
 *   knowledge.runbook_versions
 *
 * models/Runbook.js is no longer used by the active registry.
 *
 * Action handlers remain deterministic runtime code and remain separate
 * from persisted knowledge.
 */

const PostgresRunbookRepository =
  require(
    "../../persistence/postgres/PostgresRunbookRepository"
  );


const {
  validateRunbook,
  VALIDATION_PURPOSE,
} =
  require(
    "../validators/runbookValidator"
  );


const {
  getActionHandlerRegistry,
} =
  require(
    "../actions/actionHandlerRegistry"
  );


const {
  compareVersions,
  getLatestVersion,
} =
  require(
    "../versioning/runbookVersioning"
  );


const {
  RUNBOOK_LIFECYCLE,
  RUNBOOK_LIFECYCLE_TRANSITIONS,
  RUNBOOK_OWNER_TYPE,
} =
  require(
    "../../constants/runbook"
  );


// ============================================================================
// ERROR
// ============================================================================

class RegistryError
  extends Error {

  constructor(
    code,
    message,
    detail
  ) {
    super(
      message
    );


    this.name =
      "RegistryError";

    this.code =
      code;

    this.detail =
      detail ||
      null;

    this.executionAuthorized =
      false;
  }
}


// ============================================================================
// REGISTRY
// ============================================================================

class RunbookRegistry {

  constructor(
    options = {}
  ) {
    this._actionRegistry =
      options.actionRegistry ||
      null;


    this._repository =
      options.repository ||
      new PostgresRunbookRepository(
        options
      );
  }


  _getActionRegistry() {
    return (
      this._actionRegistry ||
      getActionHandlerRegistry()
    );
  }


  // ==========================================================================
  // REGISTER
  // ==========================================================================

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


    if (
      ownerType ===
        RUNBOOK_OWNER_TYPE
          .SYSTEM &&

      !scope.tenantId &&

      !scope.organizationId &&

      !scope.environmentId
    ) {
      throw new RegistryError(
        "CONTROLLED_GLOBAL_IMPORT_REQUIRED",

        "SYSTEM Runbooks must be imported through the controlled PostgreSQL global knowledge importer"
      );
    }


    const runtimeScope =
      _requireRuntimeScope(
        scope
      );


    const canonical = {
      ...definition,

      tenantId:
        runtimeScope.tenantId,

      organizationId:
        runtimeScope.organizationId,

      environmentId:
        runtimeScope.environmentId,

      owner: {
        ...(
          definition.owner ||
          {}
        ),

        ownerType:
          RUNBOOK_OWNER_TYPE
            .TENANT,
      },

      lifecycle:
        RUNBOOK_LIFECYCLE
          .DRAFT,
    };


    let ownedDefinition =
      await this
        ._repository
        .getOwnedDefinitionByKey({
          organizationId:
            runtimeScope.organizationId,

          environmentId:
            runtimeScope.environmentId,

          scopeType:
            "ENVIRONMENT",

          runbookId:
            canonical.runbookId,
        });


    if (
      !ownedDefinition
    ) {
      ownedDefinition =
        await this
          ._repository
          .createDefinition({
            organizationId:
              runtimeScope.organizationId,

            environmentId:
              runtimeScope.environmentId,

            scopeType:
              "ENVIRONMENT",

            runbookId:
              canonical.runbookId,

            name:
              canonical.name,

            description:
              canonical.description ||
              null,

            ownerType:
              RUNBOOK_OWNER_TYPE
                .TENANT,

            sourceType:
              context.sourceType ||
              "API",

            legacyMongoId:
              context.legacyMongoId ||
              null,

            metadata: {
              tenantId:
                runtimeScope.tenantId,

              registeredBy:
                context.initiatedBy ||
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
              runtimeScope.organizationId,

            environmentId:
              runtimeScope.environmentId,

            runbook:
              canonical,

            provenance:
              context.provenance ||
              {
                source:
                  context.sourceType ||
                  "API",
              },

            metadata: {
              tenantId:
                runtimeScope.tenantId,

              executionAuthorized:
                false,
            },
          });


      return _flattenVersion(
        stored,
        runtimeScope
      );

    } catch (
      error
    ) {

      throw _translateRepositoryError(
        error,
        canonical.runbookId,
        canonical.semver
      );
    }
  }


  // ==========================================================================
  // IMPORT
  // ==========================================================================

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
            (
              diagnostic
            ) =>
              diagnostic.severity ===
              "ERROR"
          );


      throw new RegistryError(
        "IMPORT_VALIDATION_FAILED",

        `Import validation failed with ${errors.length} error(s)`,

        {
          diagnostics:
            validation.diagnostics,
        }
      );
    }


    const runbook =
      await this.register(
        definition,
        {
          ...context,

          sourceType:
            context.sourceType ||
            "YAML",
        }
      );


    return {
      runbook,
      validation,
    };
  }


  // ==========================================================================
  // GET ALL VERSIONS
  // ==========================================================================

  async getById(
    runbookId,
    scopeInput
  ) {
    const scope =
      _requireRuntimeScope(
        scopeInput
      );


    const versions =
      await this
        ._repository
        .listVisibleVersions({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          runbookId,
        });


    if (
      !versions.length
    ) {
      throw new RegistryError(
        "NOT_FOUND",

        `Runbook "${runbookId}" not found`
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
    runbookId,
    semver,
    scopeInput
  ) {
    const scope =
      _requireRuntimeScope(
        scopeInput
      );


    const stored =
      await this
        ._repository
        .getVersion({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          runbookId,

          semver,
        });


    if (
      !stored
    ) {
      throw new RegistryError(
        "NOT_FOUND",

        `Runbook ${runbookId}@${semver} not found`
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
    runbookId,
    scopeInput
  ) {
    const docs =
      await this.getById(
        runbookId,
        scopeInput
      );


    const latest =
      getLatestVersion(
        docs
          .map(
            (
              doc
            ) =>
              doc.semver
          )
          .filter(
            Boolean
          )
      );


    if (
      !latest
    ) {
      return null;
    }


    return docs.find(
      (
        doc
      ) =>
        doc.semver ===
        latest
    ) ||
      null;
  }


  // ==========================================================================
  // LIST
  // ==========================================================================

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


    const runtimeScope =
      _requireRuntimeScope(
        scope
      );


    const versions =
      await this
        ._repository
        .listVisibleVersions({
          organizationId:
            runtimeScope.organizationId,

          environmentId:
            runtimeScope.environmentId,

          lifecycle:
            queryFilter.lifecycle,

          ownerType:
            queryFilter.ownerType,

          runbookId:
            queryFilter.runbookId,

          category:
            queryFilter.category,
        });


    return versions.map(
      (
        item
      ) =>
        _flattenVersion(
          item,
          runtimeScope
        )
    );
  }


  // ==========================================================================
  // SEARCH
  // ==========================================================================

  async search(
    query,
    scopeInput
  ) {
    const scope =
      _requireRuntimeScope(
        scopeInput
      );


    const versions =
      await this
        ._repository
        .listVisibleVersions({
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,

          query,
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
      _requireRuntimeScope(
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
      _requireRuntimeScope(
        scopeInput
      );


    const doc =
      await this.getVersion(
        runbookId,
        semver,
        scope
      );


    _assertTransition(
      doc,
      RUNBOOK_LIFECYCLE
        .ACTIVE
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
            (
              diagnostic
            ) =>
              diagnostic.severity ===
              "ERROR"
          );


      throw new RegistryError(
        "ACTIVATION_VALIDATION_FAILED",

        `Activation blocked: ${errors.length} error(s) must be resolved`,

        {
          diagnostics:
            validation.diagnostics,
        }
      );
    }


    return this._applyTransition(
      doc,
      scope,
      RUNBOOK_LIFECYCLE
        .ACTIVE
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


  async _transition(
    runbookId,
    semver,
    scopeInput,
    targetLifecycle,
    context = {}
  ) {
    const scope =
      _requireRuntimeScope(
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
      !context.skipValidation
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
              (
                diagnostic
              ) =>
                diagnostic.severity ===
                "ERROR"
            );


        throw new RegistryError(
          "VALIDATION_FAILED",

          `Transition to ${targetLifecycle} blocked: ${errors.length} error(s)`,

          {
            diagnostics:
              validation.diagnostics,
          }
        );
      }
    }


    return this._applyTransition(
      doc,
      scope,
      targetLifecycle
    );
  }


  async _applyTransition(
    doc,
    scope,
    targetLifecycle
  ) {
    _assertTransition(
      doc,
      targetLifecycle
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

            runbookId:
              doc.runbookId,

            semver:
              doc.semver,

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
        doc.runbookId,
        doc.semver
      );
    }
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
      _requireRuntimeScope(
        scopeInput
      );


    const base =
      await this.getVersion(
        runbookId,
        baseSemver,
        scope
      );


    if (
      base.owner
        ?.ownerType ===
      RUNBOOK_OWNER_TYPE
        .SYSTEM
    ) {
      throw new RegistryError(
        "CONTROLLED_GLOBAL_IMPORT_REQUIRED",

        "SYSTEM Runbook versions require the controlled global importer"
      );
    }


    const newDefinition = {
      ..._stripPersistenceFields(
        base
      ),

      ...(
        updates ||
        {}
      ),

      runbookId,

      semver:
        newSemver,

      lifecycle:
        RUNBOOK_LIFECYCLE
          .DRAFT,

      immutable:
        false,
    };


    return this.register(
      newDefinition,
      {
        ...scope,

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


  // ==========================================================================
  // EXECUTION DEFINITION
  // ==========================================================================

  async getExecutionDefinition(
    runbookId,
    semver,
    scopeInput
  ) {
    const scope =
      _requireRuntimeScope(
        scopeInput
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

            runbookId,

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
        "POSTGRES_RUNBOOK_NOT_EXECUTABLE"
      ) {
        throw new RegistryError(
          "NOT_EXECUTABLE",

          `Runbook ${runbookId}@${semver} is not ACTIVE`
        );
      }


      throw _translateRepositoryError(
        error,
        runbookId,
        semver
      );
    }
  }
}


// ============================================================================
// HELPERS
// ============================================================================

function _assertDefinition(
  definition
) {
  if (
    !definition ||
    typeof definition !==
      "object"
  ) {
    throw new RegistryError(
      "INVALID_DEFINITION",

      "Definition must be an object"
    );
  }


  if (
    !definition.runbookId
  ) {
    throw new RegistryError(
      "INVALID_DEFINITION",

      "runbookId is required"
    );
  }


  if (
    !definition.semver
  ) {
    throw new RegistryError(
      "INVALID_DEFINITION",

      "semver is required"
    );
  }


  if (
    !definition.name
  ) {
    throw new RegistryError(
      "INVALID_DEFINITION",

      "name is required"
    );
  }
}


function _normalizeScope(
  context = {},
  definition = {}
) {
  const nested =
    context.tenantContext ||
    {};


  return {
    tenantId:
      context.tenantId ||
      nested.tenantId ||
      definition.tenantId ||
      null,

    organizationId:
      context.organizationId ||
      context.orgId ||
      nested.organizationId ||
      definition.organizationId ||
      definition.orgId ||
      null,

    environmentId:
      context.environmentId ||
      nested.environmentId ||
      definition.environmentId ||
      null,

    initiatedBy:
      context.initiatedBy ||
      null,
  };
}


function _normalizeScopeInput(
  input
) {
  if (
    !input
  ) {
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
    "string"
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


  const nested =
    input.tenantContext ||
    {};


  return {
    tenantId:
      input.tenantId ||
      nested.tenantId ||
      null,

    organizationId:
      input.organizationId ||
      input.orgId ||
      nested.organizationId ||
      null,

    environmentId:
      input.environmentId ||
      nested.environmentId ||
      null,
  };
}


function _requireRuntimeScope(
  input
) {
  const scope =
    _normalizeScopeInput(
      input
    );


  if (
    !scope.tenantId
  ) {
    throw new RegistryError(
      "TENANT_REQUIRED",

      "tenantId is required for Runbook registry operations"
    );
  }


  if (
    !scope.organizationId
  ) {
    throw new RegistryError(
      "ORGANIZATION_REQUIRED",

      "organizationId is required for Runbook registry operations"
    );
  }


  if (
    !scope.environmentId
  ) {
    throw new RegistryError(
      "ENVIRONMENT_REQUIRED",

      "environmentId is required for Runbook registry operations"
    );
  }


  return scope;
}


function _resolveOwnerType(
  definition,
  scope
) {
  /**
   * Authenticated runtime ownership wins.
   */
  if (
    scope.tenantId ||
    scope.organizationId ||
    scope.environmentId
  ) {
    return RUNBOOK_OWNER_TYPE
      .TENANT;
  }


  return (
    definition.owner
      ?.ownerType ||
    undefined
  );
}


function _splitFilterAndScope(
  filter = {},
  explicitScope
) {
  if (
    explicitScope
  ) {
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
    tenantContext,
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

        tenantContext,
      }),
  };
}


function _validationContext(
  scope
) {
  if (
    !scope
      ?.tenantId
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


function _assertTransition(
  doc,
  targetLifecycle
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
      "INVALID_TRANSITION",

      `Cannot transition from ${doc.lifecycle} to ${targetLifecycle}`,

      {
        allowed,
      }
    );
  }
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

    runbookDefinitionId:
      stored.runbookDefinitionId,

    runbookId:
      stored.runbookId ||
      definition.runbookId,

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
          ? RUNBOOK_OWNER_TYPE
              .SYSTEM
          : RUNBOOK_OWNER_TYPE
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

    versionRef:
      stored.versionRef ||
      `${
        stored.runbookId ||
        definition.runbookId
      }@${
        stored.semver ||
        definition.semver
      }`,
  };
}


function _mergeVisibleVersions(
  docs
) {
  const versions =
    new Map();


  /**
   * SYSTEM version first.
   *
   * Exact tenant/environment version overrides identical semver.
   */
  for (
    const doc
    of docs.filter(
      (
        item
      ) =>
        item.owner
          ?.ownerType ===
        RUNBOOK_OWNER_TYPE
          .SYSTEM
    )
  ) {
    versions.set(
      doc.semver,
      doc
    );
  }


  for (
    const doc
    of docs.filter(
      (
        item
      ) =>
        item.owner
          ?.ownerType !==
        RUNBOOK_OWNER_TYPE
          .SYSTEM
    )
  ) {
    versions.set(
      doc.semver,
      doc
    );
  }


  return Array
    .from(
      versions.values()
    )
    .sort(
      (
        a,
        b
      ) =>
        compareVersions(
          b.semver,
          a.semver
        )
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
      "runbookDefinitionId",
      "checksum",
      "immutable",
      "provenance",
      "safety",
      "executionAuthorized",
      "versionRef",
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
  runbookId,
  semver
) {
  if (
    error.code ===
      "23505" ||

    error.code ===
      "POSTGRES_RUNBOOK_VERSION_NOT_NEWER"
  ) {
    return new RegistryError(
      "DUPLICATE_VERSION",

      `Runbook ${runbookId}@${semver} already exists or is not a newer version`
    );
  }


  if (
    error.code ===
    "POSTGRES_RUNBOOK_INVALID_TRANSITION"
  ) {
    return new RegistryError(
      "INVALID_TRANSITION",

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