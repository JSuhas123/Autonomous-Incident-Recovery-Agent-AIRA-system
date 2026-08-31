"use strict";

const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "../../../persistence/postgres/PostgresTenantScope"
  );


const PROBE_VERSION =
  "21.10C-live-v3";


const RLS_CERTIFICATION_ROLE =
  "aira_rls_certifier";


class LiveTenantIsolationProbe {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );


    this.queueService =
      options.queueService ||
      null;


    this.idempotencyService =
      options.idempotencyService ||
      null;
  }


  // ==========================================================================
  // POSTGRESQL RLS ISOLATION
  // ==========================================================================

  async verifyPostgresRlsIsolation(
    sourceScope,
    targetScope
  ) {
    requireDifferentScopes(
      sourceScope,
      targetScope
    );


    /*
     * IMPORTANT
     * ---------
     *
     * tenancy.organizations and tenancy.environments are scope-resolution
     * tables. They are intentionally accessed before PostgresTenantScope
     * installs tenant session context.
     *
     * They are therefore NOT valid tables for proving RLS isolation.
     *
     * resources.resources is a canonical tenant-owned operational table.
     *
     * The local PostgreSQL bootstrap role may be SUPERUSER/BYPASSRLS.
     * Consequently every actual RLS canary operation below explicitly enters
     * the dedicated restricted Phase-21 role:
     *
     *     SET LOCAL ROLE aira_rls_certifier
     *
     * PostgresTenantScope resolves the tenant and installs:
     *
     *     aira.organization_id
     *     aira.environment_id
     *
     * before this callback begins.
     *
     * SET LOCAL ROLE changes PostgreSQL privilege identity but does not replace
     * those transaction-local AIRA tenant settings.
     */

    const canaryPublicId =
      `phase21-10c-rls-${crypto.randomUUID()}`;


    let targetInsert =
      null;


    let targetRead =
      null;


    let sourceRead =
      null;


    let cleanup =
      null;


    try {
      // ======================================================================
      // 1. TARGET TENANT CREATES CANARY
      // ======================================================================

      targetInsert =
        await this.scope.run(
          targetScope,

          async (
            client,
            resolved
          ) => {
            const certifierRole =
              await enterRlsCertificationRole(
                client
              );


            const settingsBeforeInsert =
              await readActiveScopeSettings(
                client
              );


            const tenantUuid =
              resolved
                .organization
                ?.tenant_id ||
              resolved
                .environment
                ?.tenant_id ||
              null;


            if (
              !tenantUuid
            ) {
              throw createError(
                "Resolved tenant UUID is required for RLS canary insertion",
                "PHASE21_RLS_CANARY_TENANT_UUID_REQUIRED"
              );
            }


            const inserted =
              await client.query(
                `
                  INSERT INTO resources.resources (
                    public_id,
                    tenant_id,
                    organization_id,
                    environment_id,
                    provider,
                    resource_type,
                    external_id,
                    name,
                    labels,
                    current_state,
                    metadata,
                    discovered_at,
                    last_seen_at
                  )
                  VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    'aira.reliability-lab',
                    'phase21.rls.canary',
                    $1,
                    'Phase 21.10C RLS Canary',
                    $5::jsonb,
                    $6::jsonb,
                    $7::jsonb,
                    NOW(),
                    NOW()
                  )
                  RETURNING
                    id,
                    public_id,
                    organization_id,
                    environment_id
                `,
                [
                  canaryPublicId,

                  tenantUuid,

                  String(
                    resolved
                      .organizationUuid
                  ),

                  String(
                    resolved
                      .environmentUuid
                  ),

                  JSON.stringify({
                    phase:
                      "21.10C",

                    safetyClass:
                      "LAB_ONLY",

                    canary:
                      true,

                    executionAuthorized:
                      false,
                  }),

                  JSON.stringify({
                    status:
                      "RLS_CANARY",
                  }),

                  JSON.stringify({
                    phase:
                      "21.10C",

                    purpose:
                      "POSTGRES_RLS_ISOLATION_CERTIFICATION",

                    temporary:
                      true,

                    executionAuthorized:
                      false,
                  }),
                ]
              );


            const settingsAfterInsert =
              await readActiveScopeSettings(
                client
              );


            return {
              inserted:
                inserted.rows.length ===
                1,

              resourceId:
                inserted.rows[0]
                  ?.id ||
                null,

              publicId:
                inserted.rows[0]
                  ?.public_id ||
                null,

              organizationUuid:
                String(
                  resolved
                    .organizationUuid
                ),

              environmentUuid:
                String(
                  resolved
                    .environmentUuid
                ),

              certifierRole,

              settingsBeforeInsert,

              settingsAfterInsert,
            };
          }
        );


      if (
        targetInsert
          .inserted !==
        true
      ) {
        throw createError(
          "Unable to create target RLS canary",
          "PHASE21_RLS_CANARY_INSERT_FAILED"
        );
      }


      // ======================================================================
      // 2. TARGET TENANT MUST SEE ITS OWN CANARY
      // ======================================================================

      targetRead =
        await this.scope.run(
          targetScope,

          async (
            client,
            resolved
          ) => {
            const certifierRole =
              await enterRlsCertificationRole(
                client
              );


            const result =
              await client.query(
                `
                  SELECT
                    id,
                    public_id,
                    organization_id,
                    environment_id
                  FROM resources.resources
                  WHERE
                    public_id = $1
                  LIMIT 1
                `,
                [
                  canaryPublicId,
                ]
              );


            const settings =
              await readActiveScopeSettings(
                client
              );


            return {
              visible:
                result.rows.length ===
                1,

              row:
                result.rows[0] ||
                null,

              organizationUuid:
                String(
                  resolved
                    .organizationUuid
                ),

              environmentUuid:
                String(
                  resolved
                    .environmentUuid
                ),

              certifierRole,

              settings,
            };
          }
        );


      // ======================================================================
      // 3. SOURCE TENANT MUST NOT SEE TARGET CANARY
      // ======================================================================

      sourceRead =
        await this.scope.run(
          sourceScope,

          async (
            client,
            resolved
          ) => {
            const certifierRole =
              await enterRlsCertificationRole(
                client
              );


            const result =
              await client.query(
                `
                  SELECT
                    id,
                    public_id,
                    organization_id,
                    environment_id
                  FROM resources.resources
                  WHERE
                    public_id = $1
                  LIMIT 1
                `,
                [
                  canaryPublicId,
                ]
              );


            const settings =
              await readActiveScopeSettings(
                client
              );


            return {
              visible:
                result.rows.length >
                0,

              organizationUuid:
                String(
                  resolved
                    .organizationUuid
                ),

              environmentUuid:
                String(
                  resolved
                    .environmentUuid
                ),

              certifierRole,

              settings,
            };
          }
        );


      // ======================================================================
      // 4. VERIFY TENANT SESSION SETTINGS SURVIVED ROLE SWITCH
      // ======================================================================

      const sourceSettingsCorrect =
        settingsMatch(
          sourceRead
            .settings,

          sourceRead
            .organizationUuid,

          sourceRead
            .environmentUuid
        );


      const targetSettingsCorrect =
        settingsMatch(
          targetRead
            .settings,

          targetRead
            .organizationUuid,

          targetRead
            .environmentUuid
        );


      const targetInsertSettingsCorrect =
        settingsMatch(
          targetInsert
            .settingsAfterInsert,

          targetInsert
            .organizationUuid,

          targetInsert
            .environmentUuid
        );


      // ======================================================================
      // 5. VERIFY CERTIFICATION ROLE WAS ACTUALLY RESTRICTED
      // ======================================================================

      const certifierRolesSafe =
        roleEvidenceSafe(
          targetInsert
            .certifierRole
        ) &&
        roleEvidenceSafe(
          targetRead
            .certifierRole
        ) &&
        roleEvidenceSafe(
          sourceRead
            .certifierRole
        );


      // ======================================================================
      // 6. RESULT
      // ======================================================================

      const pass =
        targetInsert
          .inserted ===
          true &&

        targetRead
          .visible ===
          true &&

        sourceRead
          .visible ===
          false &&

        sourceSettingsCorrect ===
          true &&

        targetSettingsCorrect ===
          true &&

        targetInsertSettingsCorrect ===
          true &&

        certifierRolesSafe ===
          true;


      return {
        probeVersion:
          PROBE_VERSION,

        type:
          "POSTGRES_FORCE_RLS_CANARY",

        protectedTable:
          "resources.resources",

        certificationRole:
          RLS_CERTIFICATION_ROLE,

        sourceScope,

        targetScope,

        canaryPublicId,

        targetCanaryCreated:
          targetInsert
            .inserted,

        sourceCanSeeTarget:
          sourceRead
            .visible,

        targetCanSeeSelf:
          targetRead
            .visible,

        sourceSettingsCorrect,

        targetSettingsCorrect,

        targetInsertSettingsCorrect,

        certifierRolesSafe,

        sourceRoleEvidence:
          sourceRead
            .certifierRole,

        targetReadRoleEvidence:
          targetRead
            .certifierRole,

        targetInsertRoleEvidence:
          targetInsert
            .certifierRole,

        identityResolutionTablesUsedAsRlsCanary:
          false,

        rlsProtectedOperationalTableUsed:
          true,

        superuserUsedForProtectedCanaryOperation:
          false,

        bypassRlsUsedForProtectedCanaryOperation:
          false,

        pass,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    } finally {
      // ======================================================================
      // CLEANUP UNDER TARGET TENANT + RESTRICTED ROLE
      // ======================================================================

      if (
        targetInsert
          ?.inserted
      ) {
        try {
          cleanup =
            await this.scope.run(
              targetScope,

              async (
                client,
                resolved
              ) => {
                const certifierRole =
                  await enterRlsCertificationRole(
                    client
                  );


                const settings =
                  await readActiveScopeSettings(
                    client
                  );


                if (
                  !settingsMatch(
                    settings,

                    String(
                      resolved
                        .organizationUuid
                    ),

                    String(
                      resolved
                        .environmentUuid
                    )
                  )
                ) {
                  throw createError(
                    "Target tenant scope changed before RLS canary cleanup",
                    "PHASE21_RLS_CANARY_CLEANUP_SCOPE_MISMATCH"
                  );
                }


                const deleted =
                  await client.query(
                    `
                      DELETE FROM resources.resources
                      WHERE
                        public_id = $1
                      RETURNING id
                    `,
                    [
                      canaryPublicId,
                    ]
                  );


                return {
                  deleted:
                    deleted.rows.length ===
                    1,

                  certifierRole,

                  executionAuthorized:
                    false,
                };
              }
            );


          if (
            cleanup
              .deleted !==
            true
          ) {
            console.warn(
              `[phase21.10c] RLS canary cleanup did not delete ${canaryPublicId}`
            );
          }
        } catch (
          cleanupError
        ) {
          console.warn(
            `[phase21.10c] RLS canary cleanup failed for ${canaryPublicId}: ${cleanupError.message}`
          );
        }
      }
    }
  }


  // ==========================================================================
  // IDEMPOTENCY ISOLATION
  // ==========================================================================

  async verifyIdempotencyIsolation(
    leftScope,
    rightScope
  ) {
    if (
      !this.idempotencyService
    ) {
      throw createError(
        "Idempotency service is required for live isolation probe",
        "PHASE21_IDEMPOTENCY_SERVICE_REQUIRED"
      );
    }


    requireDifferentScopes(
      leftScope,
      rightScope
    );


    const key =
      `phase21-10c-${crypto.randomUUID()}`;


    const operation =
      "tenant-isolation-certification";


    const leftValue = {
      owner:
        leftScope.tenantId,

      run:
        key,

      executionAuthorized:
        false,
    };


    const rightValue = {
      owner:
        rightScope.tenantId,

      run:
        key,

      executionAuthorized:
        false,
    };


    await this.idempotencyService
      .recordRequest(
        leftScope.tenantId,
        key,
        operation,
        leftValue,
        120
      );


    const leftRead =
      await this.idempotencyService
        .getCachedResult(
          leftScope.tenantId,
          key,
          operation
        );


    const rightBeforeWrite =
      await this.idempotencyService
        .getCachedResult(
          rightScope.tenantId,
          key,
          operation
        );


    await this.idempotencyService
      .recordRequest(
        rightScope.tenantId,
        key,
        operation,
        rightValue,
        120
      );


    const rightRead =
      await this.idempotencyService
        .getCachedResult(
          rightScope.tenantId,
          key,
          operation
        );


    const leftAfterRightWrite =
      await this.idempotencyService
        .getCachedResult(
          leftScope.tenantId,
          key,
          operation
        );


    const pass =
      leftRead
        ?.owner ===
        leftScope.tenantId &&

      rightBeforeWrite ===
        null &&

      rightRead
        ?.owner ===
        rightScope.tenantId &&

      leftAfterRightWrite
        ?.owner ===
        leftScope.tenantId;


    return {
      probeVersion:
        PROBE_VERSION,

      type:
        "TENANT_SCOPED_IDEMPOTENCY",

      sharedLogicalKey:
        key,

      leftTenantId:
        leftScope.tenantId,

      rightTenantId:
        rightScope.tenantId,

      leftReadOwner:
        leftRead
          ?.owner ||
        null,

      rightBeforeWriteOwner:
        rightBeforeWrite
          ?.owner ||
        null,

      rightReadOwner:
        rightRead
          ?.owner ||
        null,

      leftAfterRightWriteOwner:
        leftAfterRightWrite
          ?.owner ||
        null,

      pass,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // RABBITMQ ENVELOPE ISOLATION
  // ==========================================================================

  async verifyRabbitMqEnvelopeIsolation(
    leftScope,
    rightScope
  ) {
    if (
      !this.queueService
    ) {
      throw createError(
        "Queue service is required for RabbitMQ isolation probe",
        "PHASE21_QUEUE_SERVICE_REQUIRED"
      );
    }


    requireDifferentScopes(
      leftScope,
      rightScope
    );


    const topic =
      `phase21.10c.tenant-isolation.${crypto.randomUUID()}`;


    const leftCorrelationId =
      crypto.randomUUID();


    const rightCorrelationId =
      crypto.randomUUID();


    const left =
      await this.queueService
        .publishEvent(
          topic,

          {
            probe:
              "phase21-10c",

            tenantMarker:
              leftScope.tenantId,

            executionAuthorized:
              false,
          },

          {
            tenantId:
              leftScope.tenantId,

            organizationId:
              leftScope.organizationId,

            environmentId:
              leftScope.environmentId,

            correlationId:
              leftCorrelationId,
          }
        );


    const right =
      await this.queueService
        .publishEvent(
          topic,

          {
            probe:
              "phase21-10c",

            tenantMarker:
              rightScope.tenantId,

            executionAuthorized:
              false,
          },

          {
            tenantId:
              rightScope.tenantId,

            organizationId:
              rightScope.organizationId,

            environmentId:
              rightScope.environmentId,

            correlationId:
              rightCorrelationId,
          }
        );


    return {
      probeVersion:
        PROBE_VERSION,

      type:
        "RABBITMQ_TENANT_ENVELOPE",

      topic,

      left: {
        tenantId:
          leftScope.tenantId,

        organizationId:
          leftScope.organizationId,

        environmentId:
          leftScope.environmentId,

        correlationId:
          left.correlationId,

        eventId:
          left.eventId,
      },

      right: {
        tenantId:
          rightScope.tenantId,

        organizationId:
          rightScope.organizationId,

        environmentId:
          rightScope.environmentId,

        correlationId:
          right.correlationId,

        eventId:
          right.eventId,
      },

      distinctEvents:
        left.eventId !==
        right.eventId,

      distinctCorrelations:
        left.correlationId !==
        right.correlationId,

      pass:
        Boolean(
          left.eventId &&
          right.eventId &&

          left.eventId !==
            right.eventId &&

          left.correlationId &&
          right.correlationId &&

          left.correlationId !==
            right.correlationId
        ),

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// POSTGRES RLS CERTIFICATION ROLE
// ============================================================================

async function enterRlsCertificationRole(
  client
) {
  /*
   * PostgresTenantScope has already:
   *
   *   1. resolved the organization/environment,
   *   2. started the transaction,
   *   3. installed aira.organization_id / aira.environment_id.
   *
   * SET LOCAL ROLE only lasts for the current transaction.
   */

  await client.query(
    `SET LOCAL ROLE ${RLS_CERTIFICATION_ROLE}`
  );


  const result =
    await client.query(
      `
        SELECT
          current_user,
          session_user,
          r.rolsuper,
          r.rolbypassrls,
          r.rolcanlogin,
          r.rolcreatedb,
          r.rolcreaterole
        FROM pg_roles r
        WHERE
          r.rolname = current_user
        LIMIT 1
      `
    );


  const row =
    result.rows[0];


  if (
    !row
  ) {
    throw createError(
      "Unable to inspect Phase 21 RLS certification role",
      "PHASE21_RLS_CERTIFIER_ROLE_NOT_FOUND"
    );
  }


  if (
    String(
      row.current_user
    ) !==
    RLS_CERTIFICATION_ROLE
  ) {
    throw createError(
      `Unexpected PostgreSQL certification role: ${row.current_user}`,
      "PHASE21_RLS_CERTIFIER_ROLE_NOT_ACTIVE"
    );
  }


  if (
    normalizePgBoolean(
      row.rolsuper
    ) ===
      true
  ) {
    throw createError(
      "Phase 21 RLS certification role must not be superuser",
      "PHASE21_RLS_CERTIFIER_ROLE_SUPERUSER"
    );
  }


  if (
    normalizePgBoolean(
      row.rolbypassrls
    ) ===
      true
  ) {
    throw createError(
      "Phase 21 RLS certification role must not bypass RLS",
      "PHASE21_RLS_CERTIFIER_ROLE_BYPASSRLS"
    );
  }


  if (
    normalizePgBoolean(
      row.rolcanlogin
    ) ===
      true
  ) {
    throw createError(
      "Phase 21 RLS certification role must remain NOLOGIN",
      "PHASE21_RLS_CERTIFIER_ROLE_CAN_LOGIN"
    );
  }


  if (
    normalizePgBoolean(
      row.rolcreatedb
    ) ===
      true ||
    normalizePgBoolean(
      row.rolcreaterole
    ) ===
      true
  ) {
    throw createError(
      "Phase 21 RLS certification role has excessive administrative privileges",
      "PHASE21_RLS_CERTIFIER_ROLE_OVER_PRIVILEGED"
    );
  }


  return {
    currentUser:
      String(
        row.current_user
      ),

    sessionUser:
      String(
        row.session_user
      ),

    superuser:
      normalizePgBoolean(
        row.rolsuper
      ),

    bypassRls:
      normalizePgBoolean(
        row.rolbypassrls
      ),

    canLogin:
      normalizePgBoolean(
        row.rolcanlogin
      ),

    createDb:
      normalizePgBoolean(
        row.rolcreatedb
      ),

    createRole:
      normalizePgBoolean(
        row.rolcreaterole
      ),

    executionAuthorized:
      false,
  };
}


// ============================================================================
// POSTGRES SCOPE HELPERS
// ============================================================================

async function readActiveScopeSettings(
  client
) {
  const result =
    await client.query(
      `
        SELECT
          current_setting(
            'aira.organization_id',
            TRUE
          ) AS organization_id,

          current_setting(
            'aira.environment_id',
            TRUE
          ) AS environment_id
      `
    );


  return {
    organizationId:
      result.rows[0]
        ?.organization_id ||
      null,

    environmentId:
      result.rows[0]
        ?.environment_id ||
      null,
  };
}


function settingsMatch(
  settings,
  organizationUuid,
  environmentUuid
) {
  return (
    String(
      settings
        ?.organizationId ||
      ""
    ) ===
      String(
        organizationUuid
      ) &&

    String(
      settings
        ?.environmentId ||
      ""
    ) ===
      String(
        environmentUuid
      )
  );
}


function roleEvidenceSafe(
  evidence
) {
  return Boolean(
    evidence &&
    evidence.currentUser ===
      RLS_CERTIFICATION_ROLE &&

    evidence.superuser ===
      false &&

    evidence.bypassRls ===
      false &&

    evidence.canLogin ===
      false &&

    evidence.createDb ===
      false &&

    evidence.createRole ===
      false &&

    evidence.executionAuthorized ===
      false
  );
}


function normalizePgBoolean(
  value
) {
  if (
    value ===
      true ||
    value ===
      "t" ||
    value ===
      "true" ||
    value ===
      1 ||
    value ===
      "1"
  ) {
    return true;
  }


  return false;
}


// ============================================================================
// SCOPE VALIDATION
// ============================================================================

function requireDifferentScopes(
  left,
  right
) {
  requireScope(
    left
  );


  requireScope(
    right
  );


  const identical =
    String(
      left.organizationId
    ) ===
      String(
        right.organizationId
      ) &&

    String(
      left.environmentId
    ) ===
      String(
        right.environmentId
      );


  if (
    identical
  ) {
    throw createError(
      "Isolation probe requires two different tenant/environment scopes",
      "PHASE21_DISTINCT_TENANT_SCOPES_REQUIRED"
    );
  }
}


function requireScope(
  scope
) {
  if (
    !scope
      ?.tenantId ||

    !scope
      ?.organizationId ||

    !scope
      ?.environmentId
  ) {
    throw createError(
      "tenantId, organizationId and environmentId are required",
      "PHASE21_TENANT_SCOPE_REQUIRED"
    );
  }
}


// ============================================================================
// ERROR
// ============================================================================

function createError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21LiveTenantIsolationProbeError",

      code,

      executionAuthorized:
        false,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PROBE_VERSION,

  RLS_CERTIFICATION_ROLE,

  LiveTenantIsolationProbe,

  enterRlsCertificationRole,
};