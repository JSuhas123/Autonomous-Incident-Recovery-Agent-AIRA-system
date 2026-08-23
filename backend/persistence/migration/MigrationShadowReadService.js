"use strict";

const MigrationStateStore =
  require(
    "./MigrationStateStore"
  );

const MigrationCutoverPolicy =
  require(
    "./MigrationCutoverPolicy"
  );

const DomainVerificationAdapterRegistry =
  require(
    "./DomainVerificationAdapterRegistry"
  );

const ShadowReadComparator =
  require(
    "./ShadowReadComparator"
  );

const ShadowReadObservationStore =
  require(
    "./ShadowReadObservationStore"
  );

const PostgresIdentityResolver =
  require(
    "../postgres/PostgresIdentityResolver"
  );

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

/**
 * Phase 13.5C
 *
 * Runtime shadow-read coordinator.
 *
 * IMPORTANT OWNERSHIP RULE:
 *
 * Runtime scope may contain Mongo/public identifiers:
 *
 * {
 *   organizationId: "6a748e...",
 *   environmentId: "6a7c14..."
 * }
 *
 * Migration control-plane tables use PostgreSQL UUIDs.
 *
 * Therefore this service maintains TWO scopes:
 *
 * runtimeScope
 *   Used by Mongo/PostgreSQL repositories.
 *
 * controlScope
 *   PostgreSQL UUID scope used by:
 *   - migration.domain_state
 *   - migration.history
 *
 * Mongo always remains authoritative while this service operates.
 */
class MigrationShadowReadService {
  constructor(
    options = {}
  ) {
    this.stateStore =
      options.stateStore ||
      new MigrationStateStore();

    this.cutoverPolicy =
      options.cutoverPolicy ||
      new MigrationCutoverPolicy();

    this.registry =
      options.registry ||
      new DomainVerificationAdapterRegistry();

    this.comparator =
      options.comparator ||
      new ShadowReadComparator();

    this.observationStore =
      options.observationStore ||
      new ShadowReadObservationStore();

    this.identityResolver =
      options.identityResolver ||
      new PostgresIdentityResolver();

    this.pool =
      options.pool ||
      null;

    /*
     * Primarily for tests.
     *
     * Production uses resolveControlScope().
     */
    this.controlScopeResolver =
      options.controlScopeResolver ||
      null;

    this.logger =
      options.logger ||
      console;
  }

  // ==========================================================================
  // READ
  // ==========================================================================

  async read({
    scope,
    domain,
    operation,
    primaryRead,
    shadowRead,
    identity = null,
  } = {}) {
    this.assertInput({
      scope,
      domain,
      operation,
      primaryRead,
      shadowRead,
    });

    /*
     * ------------------------------------------------------------------------
     * 1. EXECUTE AUTHORITATIVE READ FIRST
     * ------------------------------------------------------------------------
     *
     * Mongo result is acquired before any migration-control or PostgreSQL
     * shadow work.
     *
     * This guarantees the shadow system cannot become an availability
     * dependency for ordinary application reads.
     */
    const primaryResult =
      await primaryRead();

    /*
     * ------------------------------------------------------------------------
     * 2. RESOLVE APPLICATION IDS -> POSTGRESQL CONTROL IDS
     * ------------------------------------------------------------------------
     *
     * migration.domain_state.organization_id/environment_id are UUID columns.
     *
     * Do NOT send Mongo ObjectIds directly into those columns.
     */
    let controlScope;

    try {
      controlScope =
        await this
          .resolveControlScope(
            scope
          );
    } catch (
      error
    ) {
      this.warn(
        domain,
        operation,
        error
      );

      /*
       * Shadow infrastructure failure must never break the primary read.
       */
      return primaryResult;
    }

    // ==========================================================================
    // 3. LOAD MIGRATION STATE
    // ==========================================================================

    let state;

    try {
      state =
        await this
          .stateStore
          .get(
            controlScope,
            domain
          );
    } catch (
      error
    ) {
      this.warn(
        domain,
        operation,
        error
      );

      return primaryResult;
    }

    /*
     * No initialized migration state means:
     *
     * no shadow operation.
     */
    if (
      !state
    ) {
      return primaryResult;
    }

    /*
     * Existing cutover policy remains authoritative.
     */
    if (
      !this
        .cutoverPolicy
        .shouldShadowRead(
          state
        )
    ) {
      return primaryResult;
    }

    // ==========================================================================
    // 4. EXECUTE SECONDARY POSTGRESQL READ
    // ==========================================================================

    const startedAt =
      Date.now();

    try {
      /*
       * shadowRead receives the original application/Mongo scope.
       *
       * PostgreSQL repositories already resolve public/Mongo/Postgres
       * identifiers through PostgresIdentityResolver/PostgresTenantScope.
       */
      const targetResult =
        await shadowRead();

      const adapter =
        this.registry
          .has(
            domain
          )
          ? this.registry
              .get(
                domain
              )
          : null;

      // ========================================================================
      // 5. CANONICAL COMPARISON
      // ========================================================================

      const comparison =
        this.comparator
          .compare({
            source:
              primaryResult,

            target:
              targetResult,

            adapter,
          });

      const status =
        comparison.match
          ? "match"
          : "mismatch";

      // ========================================================================
      // 6. RECORD OBSERVATION USING POSTGRESQL UUID SCOPE
      // ========================================================================

      await this
        .safeRecord({
          scope:
            controlScope,

          domain,

          operation,

          identity:
            resolveIdentity(
              identity,
              primaryResult,
              adapter
            ),

          status,

          match:
            comparison.match,

          sourceHash:
            comparison
              .sourceHash,

          targetHash:
            comparison
              .targetHash,

          durationMs:
            Date.now() -
            startedAt,

          differences:
            comparison
              .differences,

          metadata: {
            runtimeScope: {
              organizationId:
                normalizeId(
                  scope.organizationId
                ),

              environmentId:
                normalizeId(
                  scope.environmentId
                ),
            },

            controlScope: {
              organizationId:
                normalizeId(
                  controlScope
                    .organizationId
                ),

              environmentId:
                normalizeId(
                  controlScope
                    .environmentId
                ),
            },
          },
        });
    } catch (
      error
    ) {
      /*
       * PostgreSQL read/comparison errors are recorded but NEVER propagated
       * to the client.
       */
      await this
        .safeRecord({
          scope:
            controlScope,

          domain,

          operation,

          identity:
            resolveIdentity(
              identity,
              primaryResult,
              null
            ),

          status:
            "error",

          match:
            false,

          durationMs:
            Date.now() -
            startedAt,

          error,

          metadata: {
            runtimeScope: {
              organizationId:
                normalizeId(
                  scope.organizationId
                ),

              environmentId:
                normalizeId(
                  scope.environmentId
                ),
            },

            controlScope: {
              organizationId:
                normalizeId(
                  controlScope
                    .organizationId
                ),

              environmentId:
                normalizeId(
                  controlScope
                    .environmentId
                ),
            },
          },
        });

      this.warn(
        domain,
        operation,
        error
      );
    }

    /*
     * ------------------------------------------------------------------------
     * CRITICAL SAFETY PROPERTY
     * ------------------------------------------------------------------------
     *
     * PostgreSQL result is NEVER returned during shadow mode.
     */
    return primaryResult;
  }

  // ==========================================================================
  // CONTROL-SCOPE RESOLUTION
  // ==========================================================================

  async resolveControlScope(
    runtimeScope
  ) {
    /*
     * Injectable resolver keeps unit tests database-independent.
     */
    if (
      typeof this
        .controlScopeResolver ===
      "function"
    ) {
      const resolved =
        await this
          .controlScopeResolver(
            runtimeScope
          );

      return this
        .normalizeControlScope(
          resolved
        );
    }

    const pool =
      this.pool ||
      getPostgresPool();

    const client =
      await pool
        .connect();

    try {
      const resolved =
        await this
          .identityResolver
          .resolveScope(
            client,
            {
              organizationId:
                runtimeScope
                  .organizationId,

              environmentId:
                runtimeScope
                  .environmentId,
            }
          );

      return {
        organizationId:
          String(
            resolved
              .organizationUuid
          ),

        environmentId:
          String(
            resolved
              .environmentUuid
          ),
      };
    } finally {
      client.release();
    }
  }

  normalizeControlScope(
    value = {}
  ) {
    const organizationId =
      value.organizationId ||
      value.organizationUuid ||
      value.organization
        ?.id ||
      null;

    const environmentId =
      value.environmentId ||
      value.environmentUuid ||
      value.environment
        ?.id ||
      null;

    if (
      !organizationId ||
      !environmentId
    ) {
      throw Object.assign(
        new Error(
          "Unable to resolve PostgreSQL migration control scope"
        ),
        {
          code:
            "MIGRATION_CONTROL_SCOPE_RESOLUTION_FAILED",
        }
      );
    }

    return {
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

  // ==========================================================================
  // OBSERVATION
  // ==========================================================================

  async safeRecord(
    observation
  ) {
    try {
      await this
        .observationStore
        .record(
          observation
        );
    } catch (
      error
    ) {
      /*
       * Observability must never modify application read semantics.
       */
      this.warn(
        observation.domain,
        observation.operation,
        error
      );
    }
  }

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  warn(
    domain,
    operation,
    error
  ) {
    if (
      typeof this.logger
        ?.warn !==
        "function"
    ) {
      return;
    }

    this.logger.warn(
      "[migration-shadow-read]",
      {
        domain,

        operation,

        code:
          error?.code ||
          null,

        message:
          error?.message ||
          String(
            error
          ),
      }
    );
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  assertInput({
    scope,
    domain,
    operation,
    primaryRead,
    shadowRead,
  }) {
    if (
      !scope
        ?.organizationId ||
      !scope
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Migration shadow read requires organization/environment scope"
        ),
        {
          code:
            "MIGRATION_SHADOW_SCOPE_REQUIRED",
        }
      );
    }

    if (
      !domain
    ) {
      throw Object.assign(
        new Error(
          "Migration shadow read requires domain"
        ),
        {
          code:
            "MIGRATION_SHADOW_DOMAIN_REQUIRED",
        }
      );
    }

    if (
      !operation
    ) {
      throw Object.assign(
        new Error(
          "Migration shadow read requires operation"
        ),
        {
          code:
            "MIGRATION_SHADOW_OPERATION_REQUIRED",
        }
      );
    }

    if (
      typeof primaryRead !==
        "function" ||
      typeof shadowRead !==
        "function"
    ) {
      throw Object.assign(
        new Error(
          "Migration shadow read requires primaryRead and shadowRead functions"
        ),
        {
          code:
            "MIGRATION_SHADOW_READ_FUNCTION_REQUIRED",
        }
      );
    }
  }
}

// ============================================================================
// IDENTITY HELPERS
// ============================================================================

function resolveIdentity(
  explicitIdentity,
  value,
  adapter
) {
  if (
    explicitIdentity !==
      null &&
    explicitIdentity !==
      undefined
  ) {
    return String(
      explicitIdentity
    );
  }

  if (
    typeof adapter
      ?.getSourceIdentity ===
      "function"
  ) {
    const identity =
      adapter
        .getSourceIdentity(
          value
        );

    return identity == null
      ? null
      : String(
          identity
        );
  }

  const candidate =
    value?.id ||
    value?._id ||
    value?.eventId ||
    value?.incidentId ||
    value?.decisionId ||
    null;

  return candidate == null
    ? null
    : normalizeId(
        candidate
      );
}

function normalizeId(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    typeof value
      ?.toHexString ===
      "function"
  ) {
    return value
      .toHexString();
  }

  return String(
    value
  );
}

module.exports =
  MigrationShadowReadService;