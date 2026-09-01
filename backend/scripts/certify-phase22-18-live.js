"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const crypto =
  require(
    "crypto"
  );


require(
  "dotenv"
)
  .config({
    path:
      path.resolve(
        __dirname,
        "../.env"
      ),
  });


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../constants/recoveryCertification"
  );


const {
  RuntimeAutonomyEligibilityGate,
} =
  require(
    "../services/certification/runtimeAutonomyEligibilityGate"
  );


const PostgresIdentityResolver =
  require(
    "../persistence/postgres/PostgresIdentityResolver"
  );


const {
  getPostgresPool,

  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const CERTIFICATE_VERSION =
  "22.18-multi-tenant-autonomy-isolation-v1";


const ORGANIZATION_ID =
  process.env
    .AIRA_PHASE22_ORGANIZATION_ID ||
  "aira-dev-org";


const ENVIRONMENT_ID =
  process.env
    .AIRA_PHASE22_ENVIRONMENT_ID ||
  "env_aira_development";


const PHASE22_ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase22"
  );


const EXPECTED_CERTIFICATION_TABLES =
  Object.freeze([
    "certified_capabilities",
    "certification_runs",
    "evidence_links",
    "metric_snapshots",
    "autonomy_evaluations",
    "certificates",
    "certificate_constraints",
    "status_history",
    "revocations",
  ]);


async function main() {
  printHeader();


  /*
   * ========================================================================
   * 1. LOAD PREVIOUS LIVE CERTIFICATES
   * ========================================================================
   */


  const phase2215Path =
    findLatestArtifact(
      "phase22-15-first-live-capability-"
    );


  const phase221617Path =
    findLatestArtifact(
      "phase22-16-17-live-certification-"
    );


  const phase2215 =
    readJson(
      phase2215Path
    );


  const phase221617 =
    readJson(
      phase221617Path
    );


  requireCondition(
    phase2215.status ===
      "PASS",

    "PHASE22_18_2215_NOT_PASSING",

    "Phase 22.15 source certificate is not PASS"
  );


  requireCondition(
    phase221617.status ===
      "PASS",

    "PHASE22_18_221617_NOT_PASSING",

    "Phase 22.16/22.17 source certificate is not PASS"
  );


  requireCondition(
    phase2215
      .executionAuthorized !==
      true &&

    phase221617
      .executionAuthorized !==
      true,

    "PHASE22_18_PRIOR_AUTHORITY_LEAK",

    "Prior Phase-22 evidence unexpectedly grants authority"
  );


  console.log(
    "\nPRIOR LIVE CERTIFICATION"
  );


  console.log(
    `22.15:                    ${path.basename(phase2215Path)}`
  );


  console.log(
    `22.16/17:                 ${path.basename(phase221617Path)}`
  );


  console.log(
    `Real capability level:    ${phase2215.qualification?.qualifiedLevel}`
  );


  /*
   * ========================================================================
   * 2. RESOLVE REAL TENANT SCOPE
   * ========================================================================
   */


  const pool =
    getPostgresPool();


  const client =
    await pool.connect();


  let resolved;


  try {
    const resolver =
      new PostgresIdentityResolver();


    resolved =
      await resolver
        .resolveScope(
          client,

          {
            organizationId:
              ORGANIZATION_ID,

            environmentId:
              ENVIRONMENT_ID,
          }
        );
  } finally {
    client.release();
  }


  console.log(
    "\nREAL TENANT"
  );


  console.log(
    `Organization:             ${ORGANIZATION_ID}`
  );


  console.log(
    `Environment:              ${ENVIRONMENT_ID}`
  );


  console.log(
    `Organization UUID:        ${resolved.organizationUuid}`
  );


  console.log(
    `Environment UUID:         ${resolved.environmentUuid}`
  );


  /*
   * ========================================================================
   * 3. CERTIFICATION SCHEMA RLS
   * ========================================================================
   */


  const rlsResult =
    await inspectCertificationRls(
      pool
    );


  requireCondition(
    rlsResult.tables.length ===
      EXPECTED_CERTIFICATION_TABLES.length,

    "PHASE22_18_CERTIFICATION_TABLE_COUNT_INVALID",

    [
      `Expected ${EXPECTED_CERTIFICATION_TABLES.length} certification tables.`,
      `Observed ${rlsResult.tables.length}.`,
    ].join(
      " "
    )
  );


  for (
    const expectedTable
    of EXPECTED_CERTIFICATION_TABLES
  ) {
    const table =
      rlsResult.tables.find(
        entry =>
          entry.tableName ===
          expectedTable
      );


    requireCondition(
      Boolean(
        table
      ),

      "PHASE22_18_CERTIFICATION_TABLE_MISSING",

      `Missing certification.${expectedTable}`
    );


    requireCondition(
      table.rlsEnabled ===
        true,

      "PHASE22_18_RLS_DISABLED",

      `RLS disabled on certification.${expectedTable}`
    );


    requireCondition(
      table.rlsForced ===
        true,

      "PHASE22_18_RLS_NOT_FORCED",

      `RLS is not forced on certification.${expectedTable}`
    );


    requireCondition(
      table.executionAuthorizedColumn ===
        true,

      "PHASE22_18_AUTHORITY_COLUMN_MISSING",

      `execution_authorized missing from certification.${expectedTable}`
    );


    requireCondition(
      table.executionAuthorizedDefaultFalse ===
        true,

      "PHASE22_18_AUTHORITY_DEFAULT_UNSAFE",

      `execution_authorized does not default FALSE on certification.${expectedTable}`
    );


    requireCondition(
      table.nonAuthorizingConstraint ===
        true,

      "PHASE22_18_AUTHORITY_CONSTRAINT_MISSING",

      `Non-authorizing CHECK constraint missing on certification.${expectedTable}`
    );


    requireCondition(
      table.tenantPolicyPresent ===
        true,

      "PHASE22_18_TENANT_POLICY_MISSING",

      `Tenant RLS policy missing on certification.${expectedTable}`
    );
  }


  console.log(
    "\n--------------------------------------------------------------"
  );


  console.log(
    "CERTIFICATION POSTGRESQL ISOLATION"
  );


  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const table
    of rlsResult.tables
  ) {
    console.log(
      `${table.tableName.padEnd(28)} RLS=${table.rlsEnabled} FORCE=${table.rlsForced} TENANT=${table.tenantPolicyPresent} NONAUTH=${table.nonAuthorizingConstraint}`
    );
  }


  /*
   * ========================================================================
   * 4. REAL RLS CANARY
   * ========================================================================
   *
   * We do not create fake permanent organizations or certification records.
   *
   * Instead we create a transaction-local PostgreSQL table using the exact
   * same organization/environment/execution-authorized RLS law.
   *
   * The hardened non-BYPASSRLS certification role performs the visibility
   * checks.
   */


  const canary =
    await runRlsCanary({
      pool,

      organizationUuid:
        resolved.organizationUuid,

      environmentUuid:
        resolved.environmentUuid,
    });


  requireCondition(
    canary.certifierRoleAvailable ===
      true,

    "PHASE22_18_CERTIFIER_ROLE_MISSING",

    "aira_rls_certifier role is unavailable"
  );


  requireCondition(
    canary.certifierRoleSafe ===
      true,

    "PHASE22_18_CERTIFIER_ROLE_UNSAFE",

    "aira_rls_certifier has superuser or BYPASSRLS authority"
  );


  requireCondition(
    canary.sourceCanSeeOwnRow ===
      true,

    "PHASE22_18_SOURCE_VISIBILITY_FAILED",

    "Source tenant could not see its own RLS canary"
  );


  requireCondition(
    canary.crossTenantVisibilityLeak ===
      false,

    "PHASE22_18_CROSS_TENANT_VISIBILITY_LEAK",

    "Foreign tenant could see source tenant certification canary"
  );


  requireCondition(
    canary.crossTenantWriteRejected ===
      true,

    "PHASE22_18_CROSS_TENANT_WRITE_NOT_BLOCKED",

    "Foreign tenant was able to create source-tenant certification evidence"
  );


  requireCondition(
    canary.sourceRecoveredAfterScopeRestore ===
      true,

    "PHASE22_18_SESSION_SCOPE_RESTORE_FAILED",

    "Restoring tenant scope did not restore source visibility"
  );


  console.log(
    "\nRLS CANARY"
  );


  console.log(
    `Certification role safe:  ${canary.certifierRoleSafe}`
  );


  console.log(
    `Source sees own row:       ${canary.sourceCanSeeOwnRow}`
  );


  console.log(
    `Foreign tenant sees row:   ${canary.foreignVisibleCount}`
  );


  console.log(
    `Cross-tenant leak:         ${canary.crossTenantVisibilityLeak}`
  );


  console.log(
    `Cross-tenant write block:  ${canary.crossTenantWriteRejected}`
  );


  console.log(
    `Scope restore:             ${canary.sourceRecoveredAfterScopeRestore}`
  );


  /*
   * ========================================================================
   * 5. AUTONOMY CEILING ISOLATION
   * ========================================================================
   *
   * Controlled semantic probe:
   *
   * Both tenants receive the SAME hypothetical L5 capability certificate.
   * Only their local runtime controls differ.
   *
   * This does not promote the real 22.15 capability.
   */


  const gate =
    new RuntimeAutonomyEligibilityGate();


  const tenantA =
    gate.evaluate(
      runtimeProbe({
        autonomyMode:
          "autonomous",

        allowAutonomousRecovery:
          true,
      })
    );


  const tenantB =
    gate.evaluate(
      runtimeProbe({
        autonomyMode:
          "recommend_only",

        allowAutonomousRecovery:
          false,
      })
    );


  requireCondition(
    tenantA.effectiveLevel ===
      AUTONOMY_LEVEL.L5,

    "PHASE22_18_TENANT_A_CEILING_FAILED",

    `Expected controlled Tenant A L5; actual=${tenantA.effectiveLevel}`
  );


  requireCondition(
    tenantB.effectiveLevel ===
      AUTONOMY_LEVEL.L2,

    "PHASE22_18_TENANT_B_CEILING_FAILED",

    `Expected controlled Tenant B L2; actual=${tenantB.effectiveLevel}`
  );


  requireCondition(
    tenantA
      .autonomousRecoveryEligible ===
      true &&

    tenantB
      .autonomousRecoveryEligible ===
      false,

    "PHASE22_18_AUTONOMY_TENANT_LEAK",

    "Autonomy eligibility leaked across tenant controls"
  );


  requireCondition(
    tenantA.executionAuthorized ===
      false &&

    tenantB.executionAuthorized ===
      false,

    "PHASE22_18_RUNTIME_AUTHORITY_LEAK",

    "Tenant autonomy isolation probe granted execution authority"
  );


  /*
   * Real capability must STILL remain L0.
   */


  const realCapabilityProbe =
    gate.evaluate({
      ...runtimeProbe({
        autonomyMode:
          "autonomous",

        allowAutonomousRecovery:
          true,
      }),

      certification: {
        qualifiedLevel:
          phase2215
            .qualification
            .qualifiedLevel,

        confidence:
          phase2215
            .qualification
            .confidence ??
          1,

        status:
          "CERTIFIED",

        executionAuthorized:
          false,
      },
    });


  requireCondition(
    realCapabilityProbe
      .effectiveLevel ===
      AUTONOMY_LEVEL.L0,

    "PHASE22_18_REAL_CAPABILITY_ESCALATED",

    [
      "Tenant controls increased the actual live capability above L0.",
      `actual=${realCapabilityProbe.effectiveLevel}`,
    ].join(
      " "
    )
  );


  console.log(
    "\n--------------------------------------------------------------"
  );


  console.log(
    "AUTONOMY TENANT ISOLATION"
  );


  console.log(
    "--------------------------------------------------------------"
  );


  console.log(
    `Controlled Tenant A:      ${tenantA.effectiveLevel}`
  );


  console.log(
    `Controlled Tenant B:      ${tenantB.effectiveLevel}`
  );


  console.log(
    `Tenant A autonomous:      ${tenantA.autonomousRecoveryEligible}`
  );


  console.log(
    `Tenant B autonomous:      ${tenantB.autonomousRecoveryEligible}`
  );


  console.log(
    `Real capability level:    ${realCapabilityProbe.effectiveLevel}`
  );


  console.log(
    "Execution authorized:     false"
  );


  /*
   * ========================================================================
   * 6. WRITE ARTIFACT
   * ========================================================================
   */


  fs.mkdirSync(
    PHASE22_ARTIFACT_DIRECTORY,

    {
      recursive:
        true,
    }
  );


  const result = {
    phase:
      "22.18",

    certificateVersion:
      CERTIFICATE_VERSION,

    status:
      "PASS",

    liveCertified:
      true,

    source: {
      phase2215Artifact:
        path.basename(
          phase2215Path
        ),

      phase221617Artifact:
        path.basename(
          phase221617Path
        ),

      realCapabilityLevel:
        phase2215
          .qualification
          ?.qualifiedLevel,
    },

    postgresIsolation: {
      pass:
        true,

      expectedTableCount:
        EXPECTED_CERTIFICATION_TABLES.length,

      tables:
        rlsResult.tables,

      rlsCanary:
        canary,

      crossTenantVisibilityLeak:
        false,

      crossTenantWriteRejected:
        true,
    },

    autonomyIsolation: {
      pass:
        true,

      controlledProbeOnly:
        true,

      tenantA: {
        effectiveLevel:
          tenantA.effectiveLevel,

        autonomousRecoveryEligible:
          tenantA
            .autonomousRecoveryEligible,

        executionAuthorized:
          false,
      },

      tenantB: {
        effectiveLevel:
          tenantB.effectiveLevel,

        autonomousRecoveryEligible:
          tenantB
            .autonomousRecoveryEligible,

        executionAuthorized:
          false,
      },

      realCapability: {
        effectiveLevel:
          realCapabilityProbe
            .effectiveLevel,

        autonomousRecoveryEligible:
          realCapabilityProbe
            .autonomousRecoveryEligible,

        executionAuthorized:
          false,
      },

      crossTenantAutonomyInheritance:
        false,
    },

    authority: {
      certificationGrantsAuthority:
        false,

      tenantSettingsGrantAuthority:
        false,

      environmentSettingsGrantAuthority:
        false,

      autonomyLevelGrantsAuthority:
        false,

      canBypassTenantIsolation:
        false,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    productionCertified:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };


  const artifactPath =
    path.join(
      PHASE22_ARTIFACT_DIRECTORY,

      `phase22-18-multi-tenant-autonomy-isolation-${timestamp()}.json`
    );


  fs.writeFileSync(
    artifactPath,

    JSON.stringify(
      result,
      null,
      2
    ),

    "utf8"
  );


  console.log(
    "\n=============================================================="
  );


  console.log(
    "PHASE 22.18 — MULTI-TENANT AUTONOMY ISOLATION: PASS"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "PostgreSQL RLS:            PASS"
  );


  console.log(
    "Cross-tenant visibility:   0 leaks"
  );


  console.log(
    "Cross-tenant autonomy:     0 inheritance"
  );


  console.log(
    "Execution authorized:      false"
  );


  console.log(
    "Production certified:      false"
  );


  console.log(
    `Artifact: ${artifactPath}`
  );
}


async function inspectCertificationRls(
  pool
) {
  const tableResult =
    await pool.query(
      `
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced

        FROM pg_class c

        INNER JOIN pg_namespace n
          ON n.oid = c.relnamespace

        WHERE
          n.nspname = 'certification'
          AND
          c.relkind = 'r'
          AND
          c.relname = ANY($1::text[])

        ORDER BY
          c.relname
      `,

      [
        EXPECTED_CERTIFICATION_TABLES,
      ]
    );


  const columnResult =
    await pool.query(
      `
        SELECT
          table_name,
          column_default

        FROM information_schema.columns

        WHERE
          table_schema = 'certification'
          AND
          column_name = 'execution_authorized'
          AND
          table_name = ANY($1::text[])
      `,

      [
        EXPECTED_CERTIFICATION_TABLES,
      ]
    );


  const policyResult =
    await pool.query(
      `
        SELECT
          tablename,
          policyname,
          qual,
          with_check

        FROM pg_policies

        WHERE
          schemaname = 'certification'
          AND
          tablename = ANY($1::text[])
      `,

      [
        EXPECTED_CERTIFICATION_TABLES,
      ]
    );


  const checkResult =
    await pool.query(
      `
        SELECT
          c.relname AS table_name,
          pg_get_constraintdef(con.oid) AS definition

        FROM pg_constraint con

        INNER JOIN pg_class c
          ON c.oid =
             con.conrelid

        INNER JOIN pg_namespace n
          ON n.oid =
             c.relnamespace

        WHERE
          n.nspname = 'certification'
          AND
          con.contype = 'c'
          AND
          c.relname = ANY($1::text[])
      `,

      [
        EXPECTED_CERTIFICATION_TABLES,
      ]
    );


  const tables =
    tableResult.rows.map(
      row => {
        const column =
          columnResult.rows.find(
            candidate =>
              candidate.table_name ===
              row.table_name
          );


        const policies =
          policyResult.rows.filter(
            candidate =>
              candidate.tablename ===
              row.table_name
          );


        const checks =
          checkResult.rows.filter(
            candidate =>
              candidate.table_name ===
              row.table_name
          );


        const combinedPolicy =
          policies
            .map(
              policy =>
                [
                  policy.qual ||
                    "",

                  policy.with_check ||
                    "",
                ]
                  .join(
                    " "
                  )
            )
            .join(
              " "
            )
            .toLowerCase();


       const organizationScoped =
  combinedPolicy.includes(
    "tenancy.current_organization_id"
  ) ||

  combinedPolicy.includes(
    "aira.organization_id"
  );


const environmentScoped =
  combinedPolicy.includes(
    "tenancy.current_environment_id"
  ) ||

  combinedPolicy.includes(
    "aira.environment_id"
  );


const nonAuthorizingPolicy =
  combinedPolicy.includes(
    "execution_authorized"
  ) &&

  (
    combinedPolicy.includes(
      "false"
    ) ||

    combinedPolicy.includes(
      "not execution_authorized"
    )
  );


const tenantPolicyPresent =
  organizationScoped &&
  environmentScoped &&
  nonAuthorizingPolicy;


        const nonAuthorizingConstraint =
          checks.some(
            constraint => {
              const definition =
                String(
                  constraint.definition ||
                  ""
                )
                  .toLowerCase();


              return (
                definition.includes(
                  "execution_authorized"
                ) &&

                (
                  definition.includes(
                    "false"
                  ) ||

                  definition.includes(
                    "not execution_authorized"
                  )
                )
              );
            }
          );


        const defaultValue =
          String(
            column
              ?.column_default ||
            ""
          )
            .toLowerCase();


        return Object.freeze({
  tableName:
    row.table_name,

  rlsEnabled:
    row.rls_enabled ===
    true,

  rlsForced:
    row.rls_forced ===
    true,

  executionAuthorizedColumn:
    Boolean(
      column
    ),

  executionAuthorizedDefaultFalse:
    defaultValue.includes(
      "false"
    ),

  organizationScoped,

  environmentScoped,

  nonAuthorizingPolicy,

  tenantPolicyPresent,

  nonAuthorizingConstraint,

  policyCount:
    policies.length,
});
      }
    );


  return {
    tables,
  };
}


async function runRlsCanary({
  pool,
  organizationUuid,
  environmentUuid,
}) {
  const client =
    await pool.connect();


  const foreignOrganizationUuid =
    crypto.randomUUID();


  const foreignEnvironmentUuid =
    crypto.randomUUID();


  try {
    await client.query(
      "BEGIN"
    );


    const roleResult =
      await client.query(
        `
          SELECT
            rolname,
            rolsuper,
            rolbypassrls

          FROM pg_roles

          WHERE
            rolname =
              'aira_rls_certifier'
        `
      );


    const role =
      roleResult.rows[0];


    requireCondition(
      Boolean(
        role
      ),

      "PHASE22_18_CERTIFIER_ROLE_MISSING",

      "aira_rls_certifier is required for the RLS canary"
    );


    requireCondition(
      role.rolsuper ===
        false &&

      role.rolbypassrls ===
        false,

      "PHASE22_18_CERTIFIER_ROLE_UNSAFE",

      "aira_rls_certifier must be NOSUPERUSER and NOBYPASSRLS"
    );


    await client.query(
      `
        CREATE TEMP TABLE
          phase22_autonomy_rls_canary (
            id UUID PRIMARY KEY,
            organization_id UUID NOT NULL,
            environment_id UUID NOT NULL,
            marker TEXT NOT NULL,
            execution_authorized BOOLEAN NOT NULL
              DEFAULT FALSE,

            CONSTRAINT
              phase22_canary_never_authorizes
              CHECK (
                execution_authorized =
                  FALSE
              )
          )
        ON COMMIT DROP
      `
    );


    await client.query(
      `
        ALTER TABLE
          phase22_autonomy_rls_canary
        ENABLE ROW LEVEL SECURITY
      `
    );


    await client.query(
      `
        ALTER TABLE
          phase22_autonomy_rls_canary
        FORCE ROW LEVEL SECURITY
      `
    );


    await client.query(
      `
        CREATE POLICY
          phase22_autonomy_canary_tenant_policy
        ON
          phase22_autonomy_rls_canary

        USING (
          organization_id =
            NULLIF(
              current_setting(
                'aira.organization_id',
                true
              ),
              ''
            )::uuid

          AND

          environment_id =
            NULLIF(
              current_setting(
                'aira.environment_id',
                true
              ),
              ''
            )::uuid

          AND

          execution_authorized =
            FALSE
        )

        WITH CHECK (
          organization_id =
            NULLIF(
              current_setting(
                'aira.organization_id',
                true
              ),
              ''
            )::uuid

          AND

          environment_id =
            NULLIF(
              current_setting(
                'aira.environment_id',
                true
              ),
              ''
            )::uuid

          AND

          execution_authorized =
            FALSE
        )
      `
    );


    await client.query(
      `
        GRANT
          SELECT,
          INSERT
        ON
          phase22_autonomy_rls_canary
        TO
          aira_rls_certifier
      `
    );


    /*
     * Run the actual canary as the hardened non-BYPASSRLS role.
     */
    await client.query(
      "SET LOCAL ROLE aira_rls_certifier"
    );


    await setTenantScope(
      client,
      organizationUuid,
      environmentUuid
    );


    const canaryId =
      crypto.randomUUID();


    await client.query(
      `
        INSERT INTO
          phase22_autonomy_rls_canary (
            id,
            organization_id,
            environment_id,
            marker,
            execution_authorized
          )
        VALUES (
          $1,
          $2,
          $3,
          'SOURCE_TENANT',
          FALSE
        )
      `,

      [
        canaryId,
        organizationUuid,
        environmentUuid,
      ]
    );


    const sourceResult =
      await client.query(
        `
          SELECT COUNT(*)::integer AS count

          FROM
            phase22_autonomy_rls_canary

          WHERE
            id = $1
        `,

        [
          canaryId,
        ]
      );


    const sourceVisibleCount =
      sourceResult.rows[0]
        .count;


    /*
     * Switch only the session tenant scope.
     *
     * The underlying row does not change.
     */
    await setTenantScope(
      client,
      foreignOrganizationUuid,
      foreignEnvironmentUuid
    );


    const foreignResult =
      await client.query(
        `
          SELECT COUNT(*)::integer AS count

          FROM
            phase22_autonomy_rls_canary

          WHERE
            id = $1
        `,

        [
          canaryId,
        ]
      );


    const foreignVisibleCount =
      foreignResult.rows[0]
        .count;


    /*
     * Prove WITH CHECK as well as USING.
     */
    let crossTenantWriteRejected =
      false;


    await client.query(
      "SAVEPOINT phase22_cross_tenant_write"
    );


    try {
      await client.query(
        `
          INSERT INTO
            phase22_autonomy_rls_canary (
              id,
              organization_id,
              environment_id,
              marker,
              execution_authorized
            )
          VALUES (
            $1,
            $2,
            $3,
            'ILLEGAL_CROSS_TENANT_WRITE',
            FALSE
          )
        `,

        [
          crypto.randomUUID(),
          organizationUuid,
          environmentUuid,
        ]
      );


      await client.query(
        "ROLLBACK TO SAVEPOINT phase22_cross_tenant_write"
      );
    } catch (
      error
    ) {
      crossTenantWriteRejected =
        true;


      await client.query(
        "ROLLBACK TO SAVEPOINT phase22_cross_tenant_write"
      );
    }


    /*
     * Restore source scope and prove session isolation did not corrupt it.
     */
    await setTenantScope(
      client,
      organizationUuid,
      environmentUuid
    );


    const restoredResult =
      await client.query(
        `
          SELECT COUNT(*)::integer AS count

          FROM
            phase22_autonomy_rls_canary

          WHERE
            id = $1
        `,

        [
          canaryId,
        ]
      );


    const restoredCount =
      restoredResult.rows[0]
        .count;


    await client.query(
      "RESET ROLE"
    );


    await client.query(
      "COMMIT"
    );


    return Object.freeze({
      certifierRoleAvailable:
        true,

      certifierRoleSafe:
        true,

      sourceVisibleCount,

      sourceCanSeeOwnRow:
        sourceVisibleCount ===
        1,

      foreignVisibleCount,

      crossTenantVisibilityLeak:
        foreignVisibleCount !==
        0,

      crossTenantWriteRejected,

      restoredVisibleCount:
        restoredCount,

      sourceRecoveredAfterScopeRestore:
        restoredCount ===
        1,

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    try {
      await client.query(
        "RESET ROLE"
      );
    } catch (
      resetError
    ) {
      error.resetRoleError =
        resetError;
    }


    try {
      await client.query(
        "ROLLBACK"
      );
    } catch (
      rollbackError
    ) {
      error.rollbackError =
        rollbackError;
    }


    throw error;
  } finally {
    client.release();
  }
}


async function setTenantScope(
  client,
  organizationUuid,
  environmentUuid
) {
  await client.query(
    `
      SELECT
        set_config(
          'aira.organization_id',
          $1,
          true
        ),

        set_config(
          'aira.environment_id',
          $2,
          true
        )
    `,

    [
      String(
        organizationUuid
      ),

      String(
        environmentUuid
      ),
    ]
  );
}


function runtimeProbe({
  autonomyMode,
  allowAutonomousRecovery,
}) {
  return {
    certification: {
      qualifiedLevel:
        AUTONOMY_LEVEL.L5,

      confidence:
        1,

      status:
        "CERTIFIED",

      executionAuthorized:
        false,
    },

    tenantSettings: {
      autonomyMode,

      allowAutonomousRecovery,

      allowProductionAutonomy:
        false,

      requireApprovalForProduction:
        true,

      requireApprovalForDestructiveActions:
        true,

      minimumConfidenceForAutonomy:
        0.95,

      verificationRequired:
        true,

      rollbackRequiredWhenAvailable:
        true,
    },

    environmentCeiling:
      AUTONOMY_LEVEL.L5,

    policy: {
      status:
        "ELIGIBLE",
    },

    actionRisk: {
      level:
        "LOW",

      score:
        0.1,
    },

    killSwitch: {
      state:
        "ENABLED",

      allowed:
        true,

      blocked:
        false,
    },

    production:
      false,

    destructive:
      false,

    constraints:
      [],

    constraintContext:
      {},

    executionAuthorized:
      false,

    authorizationGranted:
      false,
  };
}


function findLatestArtifact(
  prefix
) {
  if (
    !fs.existsSync(
      PHASE22_ARTIFACT_DIRECTORY
    )
  ) {
    throw certificationError(
      "PHASE22_ARTIFACT_DIRECTORY_MISSING",

      PHASE22_ARTIFACT_DIRECTORY
    );
  }


  const candidates =
    fs.readdirSync(
      PHASE22_ARTIFACT_DIRECTORY
    )
      .filter(
        file =>
          file.startsWith(
            prefix
          ) &&
          file.endsWith(
            ".json"
          )
      )
      .sort();


  if (
    candidates.length ===
      0
  ) {
    throw certificationError(
      "PHASE22_SOURCE_ARTIFACT_MISSING",

      `No artifact found with prefix ${prefix}`
    );
  }


  return path.join(
    PHASE22_ARTIFACT_DIRECTORY,

    candidates[
      candidates.length -
      1
    ]
  );
}


function readJson(
  filePath
) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}


function timestamp() {
  return new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      "-"
    );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition !==
      true
  ) {
    throw certificationError(
      code,
      message
    );
  }
}


function printHeader() {
  console.log(
    "\n=============================================================="
  );


  console.log(
    "AIRA PHASE 22.18 — MULTI-TENANT AUTONOMY ISOLATION"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "Certification tenant isolation: required"
  );


  console.log(
    "Autonomy ceiling inheritance: prohibited"
  );


  console.log(
    "Cross-tenant authority: prohibited"
  );


  console.log(
    "Execution authority: NONE"
  );
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase22TenantIsolationCertificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


main()
  .catch(
    error => {
      console.error(
        "\nPHASE 22.18 LIVE CERTIFICATION FAILED"
      );


      console.error(
        `Code: ${error.code || "UNKNOWN"}`
      );


      console.error(
        error.stack ||
        error.message ||
        error
      );


      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await closePostgresPool();
      } catch (
        error
      ) {
        console.error(
          "PostgreSQL pool close warning:",
          error.message
        );
      }
    }
  );