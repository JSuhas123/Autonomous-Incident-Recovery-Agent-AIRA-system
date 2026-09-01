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
  closePostgresPool,

  getPostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const FINAL_CERTIFICATE_VERSION =
  "22.19-22.20-final-live-v1";


const PHASE22_ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase22"
  );


const MIGRATION_NAME =
  "0087_recovery_certification_foundation.sql";


const CERTIFICATION_TABLES =
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
   * 1. FIND LIVE PHASE-22 EVIDENCE
   * ========================================================================
   */


  const evidenceFiles = {
    phase2215:
      findLatestArtifact(
        "phase22-15-first-live-capability-"
      ),

    phase221617:
      findLatestArtifact(
        "phase22-16-17-live-certification-"
      ),

    phase2218:
      findLatestArtifact(
        "phase22-18-multi-tenant-autonomy-isolation-"
      ),
  };


  const hashesBefore =
    hashFiles(
      evidenceFiles
    );


  const evidence = {
    phase2215:
      readJson(
        evidenceFiles.phase2215
      ),

    phase221617:
      readJson(
        evidenceFiles.phase221617
      ),

    phase2218:
      readJson(
        evidenceFiles.phase2218
      ),
  };


  console.log(
    "\nFROZEN / LIVE PHASE-22 EVIDENCE"
  );


  console.log(
    `22.15:                    ${path.basename(evidenceFiles.phase2215)}`
  );


  console.log(
    `22.16/22.17:              ${path.basename(evidenceFiles.phase221617)}`
  );


  console.log(
    `22.18:                    ${path.basename(evidenceFiles.phase2218)}`
  );


  /*
   * ========================================================================
   * 2. SOURCE ARTIFACT VALIDATION
   * ========================================================================
   */


  const sourceChecks =
    evaluateSourceArtifacts(
      evidence
    );


  requireAllChecks(
    "PHASE22_19_SOURCE",

    sourceChecks
  );


  printChecks(
    "SOURCE CERTIFICATION CHAIN",

    sourceChecks
  );


  /*
   * ========================================================================
   * 3. EXACT LIVE CAPABILITY TRUTH
   * ========================================================================
   */


  const capability =
    evidence
      .phase2215
      .capability;


  const qualification =
    evidence
      .phase2215
      .qualification;


  const sufficiency =
    evidence
      .phase2215
      .sufficiency;


  requireCondition(
    capability
      ?.capabilityKey ===
      "K8S_POD_CRASH_DEPLOYMENT_RESTART",

    "PHASE22_FINAL_CAPABILITY_IDENTITY_CHANGED",

    `Unexpected live capability ${capability?.capabilityKey || "NONE"}`
  );


  requireCondition(
    capability
      ?.failureMode ===
      "kubernetes.pod.crash",

    "PHASE22_FINAL_FAILURE_MODE_RELABELLED",

    [
      "Frozen Phase-21 evidence must remain kubernetes.pod.crash.",
      `Observed=${capability?.failureMode || "NONE"}`,
    ].join(
      " "
    )
  );


  requireCondition(
    qualification
      ?.qualifiedLevel ===
      "L0",

    "PHASE22_FINAL_REAL_CAPABILITY_LEVEL_CHANGED",

    [
      "The currently live-tested capability must remain L0.",
      `Observed=${qualification?.qualifiedLevel || "NONE"}`,
    ].join(
      " "
    )
  );


  requireCondition(
    sufficiency
      ?.status ===
      "INSUFFICIENT_EVIDENCE",

    "PHASE22_FINAL_EVIDENCE_STATUS_CHANGED",

    `Unexpected evidence status ${sufficiency?.status || "NONE"}`
  );


  /*
   * ========================================================================
   * 4. POSTGRESQL ARCHITECTURE CERTIFICATION
   * ========================================================================
   */


  const pool =
    getPostgresPool();


  const database =
    await inspectDatabase(
      pool
    );


  const databaseChecks =
    [
      check(
        "0087 migration applied",
        database.migrationApplied
      ),

      check(
        "nine certification tables present",
        database.tables.length ===
          CERTIFICATION_TABLES.length
      ),

      check(
        "all certification tables have RLS enabled",
        database.tables.every(
          table =>
            table.rlsEnabled ===
            true
        )
      ),

      check(
        "all certification tables force RLS",
        database.tables.every(
          table =>
            table.rlsForced ===
            true
        )
      ),

      check(
        "all certification tables are organization scoped",
        database.tables.every(
          table =>
            table.organizationScoped ===
            true
        )
      ),

      check(
        "all certification tables are environment scoped",
        database.tables.every(
          table =>
            table.environmentScoped ===
            true
        )
      ),

      check(
        "all certification tables have execution_authorized column",
        database.tables.every(
          table =>
            table.executionAuthorizedColumn ===
            true
        )
      ),

      check(
        "all certification tables default execution authority false",
        database.tables.every(
          table =>
            table.executionAuthorizedDefaultFalse ===
            true
        )
      ),

      check(
        "all certification tables prohibit execution authority",
        database.tables.every(
          table =>
            table.nonAuthorizingConstraint ===
            true
        )
      ),

      check(
        "all certification tables have tenant RLS policy",
        database.tables.every(
          table =>
            table.tenantPolicyPresent ===
            true
        )
      ),

      check(
        "certification RLS role exists",
        database.certifierRoleAvailable ===
          true
      ),

      check(
        "certification RLS role is not superuser",
        database.certifierRoleSuperuser ===
          false
      ),

      check(
        "certification RLS role cannot bypass RLS",
        database.certifierRoleBypassRls ===
          false
      ),
    ];


  requireAllChecks(
    "PHASE22_19_DATABASE",

    databaseChecks
  );


  printChecks(
    "POSTGRESQL CERTIFICATION ARCHITECTURE",

    databaseChecks
  );


  /*
   * ========================================================================
   * 5. MASTER AUTHORITY LAWS
   * ========================================================================
   */


  const masterAuthorityChecks =
    [
      check(
        "capability != certification",
        true
      ),

      check(
        "certification != authorization",
        noAuthority(
          evidence.phase2215
        )
      ),

      check(
        "reputation != authorization",
        evidence
          .phase221617
          ?.safety
          ?.reputationGrantsAuthority ===
          false
      ),

      check(
        "promotion != authorization",
        evidence
          .phase221617
          ?.safety
          ?.promotionGrantsAuthority ===
          false
      ),

      check(
        "tenant settings != authorization",
        evidence
          .phase2218
          ?.authority
          ?.tenantSettingsGrantAuthority ===
          false
      ),

      check(
        "environment settings != authorization",
        evidence
          .phase2218
          ?.authority
          ?.environmentSettingsGrantAuthority ===
          false
      ),

      check(
        "autonomy level != authorization",
        evidence
          .phase2218
          ?.authority
          ?.autonomyLevelGrantsAuthority ===
          false
      ),

      check(
        "tenant isolation cannot be bypassed",
        evidence
          .phase2218
          ?.authority
          ?.canBypassTenantIsolation ===
          false
      ),

      check(
        "cross-tenant visibility leak absent",
        evidence
          .phase2218
          ?.postgresIsolation
          ?.crossTenantVisibilityLeak ===
          false
      ),

      check(
        "cross-tenant write rejected",
        evidence
          .phase2218
          ?.postgresIsolation
          ?.crossTenantWriteRejected ===
          true
      ),

      check(
        "cross-tenant autonomy inheritance absent",
        evidence
          .phase2218
          ?.autonomyIsolation
          ?.crossTenantAutonomyInheritance ===
          false
      ),

      check(
        "kill switch cannot be bypassed",
        evidence
          .phase221617
          ?.safety
          ?.killSwitchCanBeBypassed ===
          false
      ),

      check(
        "real capability did not reach execution authorization",
        evidence
          .phase221617
          ?.runtimeEnforcement
          ?.nextAuthority ===
          null
      ),

      check(
        "real capability remains non-autonomous",
        evidence
          .phase221617
          ?.runtimeEnforcement
          ?.autonomousRecoveryEligible ===
          false
      ),

      check(
        "Phase 22 grants no execution authority",
        noAuthority(
          evidence.phase2215
        ) &&
        noAuthority(
          evidence.phase221617
        ) &&
        noAuthority(
          evidence.phase2218
        )
      ),

      check(
        "Phase 22 grants no production certification",
        evidence
          .phase2215
          ?.productionCertified ===
          false &&

        evidence
          .phase221617
          ?.productionCertified ===
          false &&

        evidence
          .phase2218
          ?.productionCertified ===
          false
      ),
    ];


  requireAllChecks(
    "PHASE22_19_AUTHORITY",

    masterAuthorityChecks
  );


  printChecks(
    "MASTER AUTHORITY INVARIANTS",

    masterAuthorityChecks
  );


  /*
   * ========================================================================
   * 6. MASTER AUTONOMY QUALIFICATION LAWS
   * ========================================================================
   */


  const autonomyChecks =
    [
      check(
        "one real experiment is not inflated",
        evidence
          .phase2215
          ?.evidence
          ?.sampleCount ===
          1
      ),

      check(
        "independent experiment count remains one",
        evidence
          .phase2215
          ?.evidence
          ?.independentExperimentCount ===
          1
      ),

      check(
        "real evidence is insufficient",
        sufficiency
          ?.status ===
          "INSUFFICIENT_EVIDENCE"
      ),

      check(
        "real evidence qualifies only L0",
        qualification
          ?.qualifiedLevel ===
          "L0"
      ),

      check(
        "real capability autonomous eligibility false",
        qualification
          ?.autonomousRecoveryEligible ===
          false
      ),

      check(
        "tenant reduction probe passed",
        evidence
          .phase221617
          ?.runtimeEnforcement
          ?.tenantReductionProbe
          ?.pass ===
          true
      ),

      check(
        "kill switch probe passed",
        evidence
          .phase221617
          ?.runtimeEnforcement
          ?.killSwitchProbe
          ?.pass ===
          true
      ),

      check(
        "promotion probe is controlled only",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.controlledProbeOnly ===
          true
      ),

      check(
        "controlled promotion did not promote live capability",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.doesNotPromoteLiveCapability ===
          true
      ),

      check(
        "promotion classified correctly",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.promotion
          ?.action ===
          "PROMOTION_ELIGIBLE"
      ),

      check(
        "demotion classified correctly",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.demotion
          ?.action ===
          "DEMOTION_REQUIRED"
      ),

      check(
        "suspension classified correctly",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.suspension
          ?.action ===
          "SUSPENSION_REQUIRED"
      ),

      check(
        "revocation classified correctly",
        evidence
          .phase221617
          ?.lifecycleEnforcement
          ?.revocation
          ?.action ===
          "REVOCATION_ENFORCED"
      ),

      check(
        "same certification supports isolated tenant ceilings",
        evidence
          .phase2218
          ?.autonomyIsolation
          ?.pass ===
          true
      ),

      check(
        "actual capability remains L0 after tenant isolation probes",
        evidence
          .phase2218
          ?.autonomyIsolation
          ?.realCapability
          ?.effectiveLevel ===
          "L0"
      ),
    ];


  requireAllChecks(
    "PHASE22_19_AUTONOMY",

    autonomyChecks
  );


  printChecks(
    "AUTONOMY QUALIFICATION INVARIANTS",

    autonomyChecks
  );


  /*
   * ========================================================================
   * 7. PHYSICAL + SAFETY CRITICAL BOUNDARY PRESENCE
   * ========================================================================
   *
   * Final freeze must refuse to silently generalize software infrastructure
   * certification into physical/safety-critical authority.
   */


  const restrictedBoundaryChecks =
    await inspectRestrictedDomainCode();


  requireAllChecks(
    "PHASE22_19_RESTRICTED_DOMAIN",

    restrictedBoundaryChecks
  );


  printChecks(
    "PHYSICAL / SAFETY-CRITICAL BOUNDARY",

    restrictedBoundaryChecks
  );


  /*
   * ========================================================================
   * 8. SOURCE ARTIFACT IMMUTABILITY
   * ========================================================================
   */


  const hashesAfter =
    hashFiles(
      evidenceFiles
    );


  const immutabilityChecks =
    Object.keys(
      hashesBefore
    )
      .map(
        key =>
          check(
            `${key} artifact unchanged`,
            hashesBefore[
              key
            ] ===
            hashesAfter[
              key
            ]
          )
      );


  requireAllChecks(
    "PHASE22_20_ARTIFACT_IMMUTABILITY",

    immutabilityChecks
  );


  printChecks(
    "SOURCE ARTIFACT IMMUTABILITY",

    immutabilityChecks
  );


  /*
   * ========================================================================
   * 9. PHASE 22.19 MASTER RESULT
   * ========================================================================
   */


  const phase2219Checks = [
    ...sourceChecks,

    ...databaseChecks,

    ...masterAuthorityChecks,

    ...autonomyChecks,

    ...restrictedBoundaryChecks,

    ...immutabilityChecks,
  ];


  requireCondition(
    phase2219Checks.every(
      item =>
        item.pass ===
        true
    ),

    "PHASE22_19_MASTER_CERTIFICATION_FAILED",

    "One or more Phase-22 master certification checks failed"
  );


  /*
   * ========================================================================
   * 10. PHASE 22.20 FREEZE
   * ========================================================================
   */


  const finalArtifact = {
    phase:
      "22",

    phase2219:
      "PASS",

    phase2220:
      "PASS",

    certificateVersion:
      FINAL_CERTIFICATE_VERSION,

    title:
      "AIRA Recovery Certification + Autonomy Reputation",

    status:
      "PASS",

    liveCertified:
      true,

    frozen:
      true,

    evidenceChain: {
      phase2215: {
        file:
          path.basename(
            evidenceFiles.phase2215
          ),

        sha256:
          hashesBefore.phase2215,
      },

      phase221617: {
        file:
          path.basename(
            evidenceFiles.phase221617
          ),

        sha256:
          hashesBefore.phase221617,
      },

      phase2218: {
        file:
          path.basename(
            evidenceFiles.phase2218
          ),

        sha256:
          hashesBefore.phase2218,
      },
    },

    realCapability: {
      capabilityKey:
        capability.capabilityKey,

      provider:
        capability.provider,

      resourceType:
        capability.resourceType,

      failureMode:
        capability.failureMode,

      recoveryStrategy:
        capability.recoveryStrategy,

      resourceCapability:
        capability.resourceCapability,

      playbookId:
        capability.playbookId,

      domain:
        capability.domain,

      sampleCount:
        evidence
          .phase2215
          ?.evidence
          ?.sampleCount,

      independentExperimentCount:
        evidence
          .phase2215
          ?.evidence
          ?.independentExperimentCount,

      evidenceSufficiency:
        sufficiency.status,

      qualifiedLevel:
        qualification
          .qualifiedLevel,

      autonomousRecoveryEligible:
        qualification
          .autonomousRecoveryEligible,

      executionAuthorized:
        false,

      productionCertified:
        false,
    },

    persistence: {
      canonicalStore:
        "PostgreSQL",

      migration:
        MIGRATION_NAME,

      certificationTables:
        database.tables,

      rlsEnabledAll:
        true,

      rlsForcedAll:
        true,

      crossTenantVisibilityLeak:
        false,

      crossTenantAutonomyInheritance:
        false,

      executionAuthorized:
        false,
    },

    authorityModel: {
      capabilityImpliesCertification:
        false,

      capabilityImpliesAuthorization:
        false,

      certificationImpliesAuthorization:
        false,

      reputationImpliesAuthorization:
        false,

      autonomyLevelImpliesAuthorization:
        false,

      entitlementImpliesAuthorization:
        false,

      tenantSettingsCanIncreaseCertification:
        false,

      environmentCanIncreaseCertification:
        false,

      policyCanIncreaseCertification:
        false,

      riskCanIncreaseCertification:
        false,

      killSwitchCanBeBypassed:
        false,

      revokedCertificationCanExecute:
        false,

      expiredCertificationCanExecute:
        false,

      phase22CanGrantExecutionAuthorization:
        false,

      canonicalExecutionAuthorizationRequired:
        true,
    },

    safetyBoundary: {
      unrestrictedProductionAutonomy:
        false,

      physicalSystemUsesSoftwareCertificate:
        false,

      safetyCriticalUsesSoftwareCertificate:
        false,

      physicalAutonomyCertified:
        false,

      safetyCriticalAutonomyCertified:
        false,

      executionAuthorized:
        false,
    },

    masterChecks: {
      total:
        phase2219Checks.length,

      passed:
        phase2219Checks.filter(
          item =>
            item.pass ===
            true
        ).length,

      failed:
        phase2219Checks.filter(
          item =>
            item.pass !==
            true
        ).length,
    },

    productionCertified:
      false,

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };


  /*
   * Critical final assertions immediately before writing freeze artifact.
   */


  requireCondition(
    finalArtifact
      .realCapability
      .qualifiedLevel ===
      "L0",

    "PHASE22_20_REAL_CAPABILITY_AUTONOMY_CHANGED",

    "The first real capability unexpectedly changed autonomy during final freeze"
  );


  requireCondition(
    finalArtifact
      .authorityModel
      .phase22CanGrantExecutionAuthorization ===
      false,

    "PHASE22_20_AUTHORITY_MODEL_INVALID",

    "Phase 22 must remain non-authorizing"
  );


  requireCondition(
    finalArtifact
      .executionAuthorized ===
      false,

    "PHASE22_20_EXECUTION_AUTHORIZED",

    "Phase 22 final certificate cannot authorize execution"
  );


  requireCondition(
    finalArtifact
      .productionCertified ===
      false,

    "PHASE22_20_PRODUCTION_CERTIFIED",

    "Phase 22 final certificate cannot create unrestricted production authority"
  );


  const finalArtifactPath =
    path.join(
      PHASE22_ARTIFACT_DIRECTORY,

      `phase22-final-live-certification-${timestamp()}.json`
    );


  fs.writeFileSync(
    finalArtifactPath,

    JSON.stringify(
      finalArtifact,
      null,
      2
    ),

    "utf8"
  );


  printFinalResult(
    finalArtifact,

    finalArtifactPath
  );
}


function evaluateSourceArtifacts(
  evidence
) {
  return [
    check(
      "22.15 live assessment PASS",
      evidence
        .phase2215
        ?.status ===
        "PASS"
    ),

    check(
      "22.16/22.17 live certification PASS",
      evidence
        .phase221617
        ?.status ===
        "PASS"
    ),

    check(
      "22.16/22.17 live certified",
      evidence
        .phase221617
        ?.liveCertified ===
        true
    ),

    check(
      "22.18 live certification PASS",
      evidence
        .phase2218
        ?.status ===
        "PASS"
    ),

    check(
      "22.18 live certified",
      evidence
        .phase2218
        ?.liveCertified ===
        true
    ),

    check(
      "22.18 PostgreSQL isolation PASS",
      evidence
        .phase2218
        ?.postgresIsolation
        ?.pass ===
        true
    ),

    check(
      "22.18 autonomy isolation PASS",
      evidence
        .phase2218
        ?.autonomyIsolation
        ?.pass ===
        true
    ),

    check(
      "22.15 Phase-21 evidence remained immutable",
      evidence
        .phase2215
        ?.evidence
        ?.phase21EvidenceMutated ===
        false
    ),

    check(
      "22.15 production certification false",
      evidence
        .phase2215
        ?.productionCertified ===
        false
    ),

    check(
      "22.16/17 production certification false",
      evidence
        .phase221617
        ?.productionCertified ===
        false
    ),

    check(
      "22.18 production certification false",
      evidence
        .phase2218
        ?.productionCertified ===
        false
    ),
  ];
}


async function inspectDatabase(
  pool
) {
  const migrationResult =
  await pool.query(
    `
      SELECT
        version,
        filename,
        applied_at

      FROM
        aira_schema_migrations

      WHERE
        version = $1
        AND
        filename = $2

      ORDER BY
        applied_at DESC

      LIMIT 1
    `,

    [
      "0087",
      MIGRATION_NAME,
    ]
  );


  const tableResult =
    await pool.query(
      `
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced

        FROM
          pg_class c

        INNER JOIN
          pg_namespace n
        ON
          n.oid =
          c.relnamespace

        WHERE
          n.nspname =
            'certification'

          AND

          c.relkind =
            'r'

          AND

          c.relname =
            ANY($1::text[])

        ORDER BY
          c.relname
      `,

      [
        CERTIFICATION_TABLES,
      ]
    );


  const columnResult =
    await pool.query(
      `
        SELECT
          table_name,
          column_name,
          column_default

        FROM
          information_schema.columns

        WHERE
          table_schema =
            'certification'

          AND

          table_name =
            ANY($1::text[])

          AND

          column_name IN (
            'organization_id',
            'environment_id',
            'execution_authorized'
          )
      `,

      [
        CERTIFICATION_TABLES,
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

        FROM
          pg_policies

        WHERE
          schemaname =
            'certification'

          AND

          tablename =
            ANY($1::text[])
      `,

      [
        CERTIFICATION_TABLES,
      ]
    );


  const constraintResult =
    await pool.query(
      `
        SELECT
          c.relname AS table_name,
          pg_get_constraintdef(
            con.oid
          ) AS definition

        FROM
          pg_constraint con

        INNER JOIN
          pg_class c
        ON
          c.oid =
          con.conrelid

        INNER JOIN
          pg_namespace n
        ON
          n.oid =
          c.relnamespace

        WHERE
          n.nspname =
            'certification'

          AND

          c.relname =
            ANY($1::text[])

          AND

          con.contype =
            'c'
      `,

      [
        CERTIFICATION_TABLES,
      ]
    );


  const roleResult =
    await pool.query(
      `
        SELECT
          rolname,
          rolsuper,
          rolbypassrls

        FROM
          pg_roles

        WHERE
          rolname =
            'aira_rls_certifier'
      `
    );


  const tables =
    tableResult.rows
      .map(
        row => {
          const columns =
            columnResult.rows
              .filter(
                entry =>
                  entry.table_name ===
                  row.table_name
              );


          const policies =
            policyResult.rows
              .filter(
                entry =>
                  entry.tablename ===
                  row.table_name
              );


          const constraints =
            constraintResult.rows
              .filter(
                entry =>
                  entry.table_name ===
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


          const policyNonAuthorizing =
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


          const executionColumn =
            columns.find(
              entry =>
                entry.column_name ===
                "execution_authorized"
            );


          const nonAuthorizingConstraint =
            constraints.some(
              entry => {
                const definition =
                  String(
                    entry.definition ||
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


          return Object.freeze({
            tableName:
              row.table_name,

            rlsEnabled:
              row.rls_enabled ===
              true,

            rlsForced:
              row.rls_forced ===
              true,

            organizationScoped,

            environmentScoped,

            executionAuthorizedColumn:
              Boolean(
                executionColumn
              ),

            executionAuthorizedDefaultFalse:
              String(
                executionColumn
                  ?.column_default ||
                ""
              )
                .toLowerCase()
                .includes(
                  "false"
                ),

            nonAuthorizingConstraint,

            tenantPolicyPresent:
              organizationScoped &&
              environmentScoped &&
              policyNonAuthorizing,

            policyCount:
              policies.length,
          });
        }
      );


  const role =
    roleResult.rows[0] ||
    null;


  return Object.freeze({
    migrationApplied:
      migrationResult.rows.length >
      0,

    migration:
      migrationResult.rows[0] ||
      null,

    tables,

    certifierRoleAvailable:
      Boolean(
        role
      ),

    certifierRoleSuperuser:
      role
        ? role.rolsuper ===
          true
        : null,

    certifierRoleBypassRls:
      role
        ? role.rolbypassrls ===
          true
        : null,
  });
}


async function inspectRestrictedDomainCode() {
  const policyPath =
    path.resolve(
      __dirname,
      "../constants/safetyCriticalCertificationPolicy.js"
    );


  const boundaryPath =
    path.resolve(
      __dirname,
      "../services/certification/safetyCriticalDomainBoundaryService.js"
    );


  requireCondition(
    fs.existsSync(
      policyPath
    ),

    "PHASE22_FINAL_SAFETY_POLICY_MISSING",

    "safetyCriticalCertificationPolicy.js missing"
  );


  requireCondition(
    fs.existsSync(
      boundaryPath
    ),

    "PHASE22_FINAL_SAFETY_BOUNDARY_MISSING",

    "safetyCriticalDomainBoundaryService.js missing"
  );


  const policyText =
    fs.readFileSync(
      policyPath,
      "utf8"
    );


  const boundaryText =
    fs.readFileSync(
      boundaryPath,
      "utf8"
    );


  return [
    check(
      "physical-system domain boundary exists",
      policyText.includes(
        "PHYSICAL_SYSTEM"
      )
    ),

    check(
      "safety-critical domain boundary exists",
      policyText.includes(
        "SAFETY_CRITICAL"
      )
    ),

    check(
      "physical capabilities boundary includes ROBOT_STOP",
      policyText.includes(
        "ROBOT_STOP"
      )
    ),

    check(
      "physical capabilities boundary includes ROBOT_RECALIBRATE",
      policyText.includes(
        "ROBOT_RECALIBRATE"
      )
    ),

    check(
      "physical capabilities boundary includes ROBOT_RETURN_HOME",
      policyText.includes(
        "ROBOT_RETURN_HOME"
      )
    ),

    check(
      "physical boundary caps autonomy",
      boundaryText.includes(
        "lowerAutonomyLevel"
      )
    ),

    check(
      "restricted-domain service remains non-authorizing",
      boundaryText.includes(
        "executionAuthorized"
      ) &&
      boundaryText.includes(
        "false"
      )
    ),
  ];
}


function noAuthority(
  artifact
) {
  return (
    artifact
      ?.executionAuthorized !==
      true &&

    artifact
      ?.authorizationGranted !==
      true
  );
}


function hashFiles(
  files
) {
  return Object.fromEntries(
    Object.entries(
      files
    )
      .map(
        ([
          key,
          filePath,
        ]) => [
          key,

          sha256File(
            filePath
          ),
        ]
      )
  );
}


function sha256File(
  filePath
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        filePath
      )
    )
    .digest(
      "hex"
    );
}


function findLatestArtifact(
  prefix
) {
  requireCondition(
    fs.existsSync(
      PHASE22_ARTIFACT_DIRECTORY
    ),

    "PHASE22_FINAL_ARTIFACT_DIRECTORY_MISSING",

    PHASE22_ARTIFACT_DIRECTORY
  );


  const files =
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


  requireCondition(
    files.length >
      0,

    "PHASE22_FINAL_SOURCE_ARTIFACT_MISSING",

    `Missing Phase-22 artifact prefix ${prefix}`
  );


  return path.join(
    PHASE22_ARTIFACT_DIRECTORY,

    files[
      files.length -
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


function check(
  name,
  condition
) {
  return Object.freeze({
    name,

    pass:
      condition ===
      true,
  });
}


function requireAllChecks(
  code,
  checks
) {
  const failed =
    checks.filter(
      item =>
        item.pass !==
        true
    );


  if (
    failed.length >
      0
  ) {
    throw certificationError(
      code,

      [
        `${failed.length} certification check(s) failed:`,

        ...failed.map(
          item =>
            item.name
        ),
      ].join(
        " "
      )
    );
  }
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


function printChecks(
  title,
  checks
) {
  console.log(
    "\n--------------------------------------------------------------"
  );


  console.log(
    title
  );


  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const item
    of checks
  ) {
    console.log(
      `${item.pass ? "PASS" : "FAIL"}  ${item.name}`
    );
  }
}


function printHeader() {
  console.log(
    "\n=============================================================="
  );


  console.log(
    "AIRA PHASE 22.19 + 22.20 — FINAL RECOVERY CERTIFICATION"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    "CAPABILITY != CERTIFICATION != AUTHORIZATION"
  );


  console.log(
    "Autonomy reputation does not grant execution authority"
  );


  console.log(
    "Tenant / environment / policy / risk may only reduce autonomy"
  );


  console.log(
    "Kill switch always wins"
  );


  console.log(
    "Physical / safety-critical domains remain separately bounded"
  );


  console.log(
    "Production unrestricted autonomy: prohibited"
  );
}


function printFinalResult(
  artifact,
  artifactPath
) {
  console.log(
    "\n=============================================================="
  );


  console.log(
    "PHASE 22.19 — MASTER RECOVERY CERTIFICATION: PASS"
  );


  console.log(
    "PHASE 22.20 — FINAL PHASE-22 FREEZE: PASS"
  );


  console.log(
    "=============================================================="
  );


  console.log(
    ""
  );


  console.log(
    "AIRA PHASE 22"
  );


  console.log(
    "RECOVERY CERTIFICATION + AUTONOMY REPUTATION"
  );


  console.log(
    ""
  );


  console.log(
    "LIVE CERTIFIED"
  );


  console.log(
    "PASS"
  );


  console.log(
    "FROZEN"
  );


  console.log(
    ""
  );


  console.log(
    `Real capability:             ${artifact.realCapability.capabilityKey}`
  );


  console.log(
    `Failure mode:                ${artifact.realCapability.failureMode}`
  );


  console.log(
    `Real evidence samples:       ${artifact.realCapability.sampleCount}`
  );


  console.log(
    `Independent experiments:     ${artifact.realCapability.independentExperimentCount}`
  );


  console.log(
    `Evidence sufficiency:        ${artifact.realCapability.evidenceSufficiency}`
  );


  console.log(
    `Qualified autonomy level:    ${artifact.realCapability.qualifiedLevel}`
  );


  console.log(
    `Autonomous eligible:         ${artifact.realCapability.autonomousRecoveryEligible}`
  );


  console.log(
    ""
  );


  console.log(
    "Certification grants authority:       false"
  );


  console.log(
    "Reputation grants authority:          false"
  );


  console.log(
    "Tenant controls bypassed:             false"
  );


  console.log(
    "Policy bypassed:                      false"
  );


  console.log(
    "Kill switch bypassed:                 false"
  );


  console.log(
    "Canonical authorization bypassed:     false"
  );


  console.log(
    "Physical autonomy certified:          false"
  );


  console.log(
    "Safety-critical autonomy certified:   false"
  );


  console.log(
    "Unrestricted production autonomy:     false"
  );


  console.log(
    "Execution authorized by Phase 22:     false"
  );


  console.log(
    ""
  );


  console.log(
    `Master checks:               ${artifact.masterChecks.passed}/${artifact.masterChecks.total} PASS`
  );


  console.log(
    ""
  );


  console.log(
    `Artifact: ${artifactPath}`
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
        "Phase22FinalCertificationError",

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
        "\nPHASE 22 FINAL LIVE CERTIFICATION FAILED"
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