"use strict";

/**
 * AIRA PHASE 21.19C + 21.19D — BATCH 10C/D FINAL LIVE CERTIFICATION
 *
 * 21.19C — Persistence + Architecture Certification
 * 21.19D — Final Phase-21 Freeze
 *
 * This certifier is evidence-only and non-authorizing.
 * It performs read-only PostgreSQL inspection plus rollback-only immutability
 * probes. It does not execute infrastructure actions, grant authority, or
 * certify production.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PostgresReliabilityLabRepository =
  require("../persistence/postgres/PostgresReliabilityLabRepository");

const {
  closePostgresPool,
} = require("../persistence/postgres/postgresPool");

const CERTIFICATE_VERSION =
  "21.19cd-batch10-final-v1";

const ARTIFACT_DIR =
  path.resolve(
    __dirname,
    "..",
    "artifacts",
    "phase21"
  );

const MIGRATION_DIR =
  path.resolve(
    __dirname,
    "..",
    "persistence",
    "postgres",
    "migrations"
  );

const RELIABILITY_TABLES =
  Object.freeze([
    "lab_environments",
    "experiment_definitions",
    "experiment_runs",
    "failure_injections",
    "observations",
    "assertion_results",
    "metrics",
  ]);

const REQUIRED_ASSERTIONS =
  Object.freeze([
    "RECOVERY_VERIFIED",
    "NO_IMMEDIATE_RECURRENCE",
    "FALSE_RECOVERY_PREVENTED",
    "ROLLBACK_ESCALATION_CLASSIFICATION",
  ]);

const REQUIRED_METRICS =
  Object.freeze([
    "recovery_verified",
    "recurrence_detected",
    "false_recovery_prevented",
    "verification_window_ms",
    "post_recovery_http_latency_ms",
    "experiment_score",
  ]);

const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",
  });


async function main() {
  const configuration =
    loadConfiguration();

  assertProcessSafety();

  printHeader(
    configuration
  );


  // ==========================================================================
  // 1. FROZEN PHASE-21 EVIDENCE
  // ==========================================================================

  printSection(
    "FROZEN PHASE-21 EVIDENCE"
  );


  const evidence =
    Object.freeze({
      capacity10b:
        loadLatestArtifact(
          "phase21-10b-final-certification-"
        ),

      tenantIsolation10c:
        loadLatestArtifact(
          "phase21-10c-final-certification-"
        ),

      resilience10d:
        loadLatestArtifact(
          "phase21-10d-final-certification-"
        ),

      batch6:
        loadLatestArtifact(
          "phase21-batch6-live-certification-"
        ),

      batch7:
        loadLatestArtifact(
          "phase21-batch7-live-certification-"
        ),

      batch8a:
        loadLatestArtifact(
          "phase21-batch8a-live-certification-"
        ),

      batch8b:
        loadLatestArtifact(
          "phase21-batch8b-live-certification-"
        ),

      batch9:
        loadLatestArtifact(
          "phase21-batch9-live-certification-"
        ),

      batch10ab:
        loadLatestArtifact(
          "phase21-batch10ab-live-certification-"
        ),
    });


  for (
    const [
      key,
      item,
    ]
    of Object.entries(
      evidence
    )
  ) {
    console.log(
      `${key.padEnd(24)} ${path.basename(
        item.path
      )}`
    );
  }


  const evidenceHashesBefore =
    hashEvidenceSet(
      evidence
    );


  const batch7 =
    evidence
      .batch7
      .artifact;

  const batch8b =
    evidence
      .batch8b
      .artifact;

  const batch9 =
    evidence
      .batch9
      .artifact;

  const batch10ab =
    evidence
      .batch10ab
      .artifact;

  const tenantIsolation =
    evidence
      .tenantIsolation10c
      .artifact;


  const experimentRunId =
    requiredString(
      batch9
        .experimentRunId,

      "PHASE21_BATCH10CD_EXPERIMENT_RUN_ID_MISSING"
    );

  const incidentId =
    requiredString(
      batch9
        .incidentId,

      "PHASE21_BATCH10CD_INCIDENT_ID_MISSING"
    );


  requireCondition(
    batch10ab
      .experimentRunId ===
      experimentRunId &&

    batch10ab
      .incidentId ===
      incidentId &&

    batch10ab
      .passed ===
      true,

    "PHASE21_BATCH10CD_AB_LINEAGE_INVALID",

    "Batch 10A/B evidence does not match the final experiment lineage"
  );


  requireCondition(
    batch8b
      .incidentId ===
      incidentId,

    "PHASE21_BATCH10CD_BATCH8B_LINEAGE_INVALID",

    "Batch 8B incident lineage does not match Batch 9"
  );


  requireCondition(
    batch7
      .experimentRunId ===
      experimentRunId &&

    batch7
      .incidentId ===
      incidentId,

    "PHASE21_BATCH10CD_BATCH7_LINEAGE_INVALID",

    "Batch 7 experiment lineage does not match Batch 9"
  );


  // ==========================================================================
  // 2. CANONICAL POSTGRESQL LAB STATE
  // ==========================================================================

  printSection(
    "CANONICAL POSTGRESQL LAB STATE"
  );


  const repository =
    new PostgresReliabilityLabRepository();


  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    lab,

    "PHASE21_BATCH10CD_LAB_NOT_FOUND",

    "Canonical Reliability Lab was not found"
  );


  requireCondition(
    normalize(
      lab.status
    ) ===
      "AVAILABLE",

    "PHASE21_BATCH10CD_LAB_NOT_AVAILABLE",

    `Expected AVAILABLE lab; actual=${lab.status}`
  );


  requireCondition(
    normalize(
      lab.safetyClass
    ) ===
      "LAB_ONLY" &&

    lab.production !==
      true &&

    lab.executionAuthorized !==
      true,

    "PHASE21_BATCH10CD_LAB_SAFETY_INVALID",

    "Final Reliability Lab safety invariant failed"
  );


  const experiment =
    await repository
      .getExperimentRun({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        experimentRunId,
      });


  requireCondition(
    experiment,

    "PHASE21_BATCH10CD_EXPERIMENT_NOT_FOUND",

    `Experiment run not found: ${experimentRunId}`
  );


  requireCondition(
    experiment
      .executionAuthorized !==
      true,

    "PHASE21_BATCH10CD_EXPERIMENT_AUTHORITY_LEAK",

    "Reliability experiment unexpectedly authorizes execution"
  );


  console.log(
    `Experiment run:           ${experimentRunId}`
  );

  console.log(
    `Incident:                 ${incidentId}`
  );

  console.log(
    `Correlation ID:           ${experiment.correlationId}`
  );

  console.log(
    `Lab status:               ${lab.status}`
  );

  console.log(
    `Safety class:             ${lab.safetyClass}`
  );

  console.log(
    "Production:               false"
  );

  console.log(
    "Phase21 authority:        false"
  );


  // ==========================================================================
  // 3. 21.19C — PERSISTENCE + ARCHITECTURE
  // ==========================================================================

  printSection(
    "21.19C — PERSISTENCE + ARCHITECTURE CERTIFICATION"
  );


  const architecture =
    await inspectArchitecture({
      repository,
      configuration,
      experimentRunId,
      incidentId,
      batch8b,
      batch9,
      tenantIsolation,
    });


  const cChecks =
    [];


  const certifyC =
    (
      name,
      pass,
      details = {}
    ) => {
      requireCondition(
        pass ===
          true,

        "PHASE21_BATCH10CD_ARCHITECTURE_CHECK_FAILED",

        `21.19C certification failed: ${name}`
      );


      cChecks.push({
        name,

        pass:
          true,

        details,
      });


      console.log(
        `${name.padEnd(47)} PASS`
      );
    };


  certifyC(
    "Reliability migrations canonical",
    architecture
      .migrations
      .pass,
    architecture
      .migrations
  );


  certifyC(
    "Reliability tables present",
    architecture
      .tables
      .pass,
    architecture
      .tables
  );


  certifyC(
    "RLS enabled + forced",
    architecture
      .rls
      .pass,
    architecture
      .rls
  );


  certifyC(
    "Tenant policies scoped + non-authorizing",
    architecture
      .policies
      .pass,
    architecture
      .policies
  );


  certifyC(
    "RLS certifier role hardened",
    architecture
      .certifierRole
      .pass,
    architecture
      .certifierRole
  );


  certifyC(
    "Tenant isolation live-certified",
    architecture
      .tenantIsolation
      .pass,
    architecture
      .tenantIsolation
  );


  certifyC(
    "Experiment definition immutable",
    architecture
      .experimentImmutability
      .pass,
    architecture
      .experimentImmutability
  );


  certifyC(
    "Failure provenance complete",
    architecture
      .failureProvenance
      .pass,
    architecture
      .failureProvenance
  );


  certifyC(
    "Recovery provenance complete",
    architecture
      .recoveryProvenance
      .pass,
    architecture
      .recoveryProvenance
  );


  certifyC(
    "Correlation lineage intact",
    architecture
      .correlationLineage
      .pass,
    architecture
      .correlationLineage
  );


  certifyC(
    "Authorization lineage intact",
    architecture
      .authorizationLineage
      .pass,
    architecture
      .authorizationLineage
  );


  certifyC(
    "Verification lineage intact",
    architecture
      .verificationLineage
      .pass,
    architecture
      .verificationLineage
  );


  certifyC(
    "Metric lineage intact",
    architecture
      .metricLineage
      .pass,
    architecture
      .metricLineage
  );


  certifyC(
    "Assertion lineage intact",
    architecture
      .assertionLineage
      .pass,
    architecture
      .assertionLineage
  );


  certifyC(
    "Reliability evidence never authorizes",
    architecture
      .authorityInvariant
      .pass,
    architecture
      .authorityInvariant
  );


  certifyC(
    "PostgreSQL is canonical evidence store",
    architecture
      .postgresCanonical
      .pass,
    architecture
      .postgresCanonical
  );


  // ==========================================================================
  // 4. 21.19D — FINAL PHASE-21 FREEZE
  // ==========================================================================

  printSection(
    "21.19D — FINAL PHASE-21 FREEZE"
  );


  const freezeChecks =
    [];


  const certifyD =
    (
      name,
      pass,
      details = {}
    ) => {
      requireCondition(
        pass ===
          true,

        "PHASE21_BATCH10CD_FINAL_FREEZE_FAILED",

        `21.19D freeze condition failed: ${name}`
      );


      freezeChecks.push({
        name,

        pass:
          true,

        details,
      });


      console.log(
        `${name.padEnd(47)} PASS`
      );
    };


  certifyD(
    "21.10B capacity certification frozen",

    artifactFrozenPass(
      evidence
        .capacity10b
        .artifact
    )
  );


  certifyD(
    "21.10C tenant isolation frozen",

    artifactFrozenPass(
      evidence
        .tenantIsolation10c
        .artifact
    )
  );


  certifyD(
    "21.10D resilience report frozen",

    artifactFrozenPass(
      evidence
        .resilience10d
        .artifact
    )
  );


  certifyD(
    "21.11-21.12 live evidence frozen",

    artifactFrozenPass(
      evidence
        .batch6
        .artifact
    )
  );


  certifyD(
    "21.13-21.14 live evidence frozen",

    artifactFrozenPass(
      evidence
        .batch7
        .artifact
    )
  );


  certifyD(
    "21.15 safe-refusal evidence passed",

    evidence
      .batch8a
      .artifact
      .passed ===
      true
  );


  certifyD(
    "21.16 authorized LAB_ONLY evidence passed",

    evidence
      .batch8b
      .artifact
      .passed ===
      true
  );


  certifyD(
    "21.17-21.18 live evidence passed",

    evidence
      .batch9
      .artifact
      .passed ===
      true
  );


  certifyD(
    "21.19A end-to-end certification passed",

    batch10ab
      .endToEnd &&

    Object.values(
      batch10ab
        .endToEnd
    )
      .every(
        value =>
          value ===
          true
      )
  );


  certifyD(
    "21.19B master safety certification passed",

    Array.isArray(
      batch10ab
        .safetyChecks
    ) &&

    batch10ab
      .safetyChecks
      .length >=
      14 &&

    batch10ab
      .safetyChecks
      .every(
        item =>
          item.pass ===
          true
      )
  );


  certifyD(
    "21.19C persistence architecture passed",

    cChecks.length ===
      16 &&

    cChecks.every(
      item =>
        item.pass ===
        true
    )
  );


  certifyD(
    "Lab returned to AVAILABLE",

    normalize(
      lab.status
    ) ===
      "AVAILABLE"
  );


  certifyD(
    "Ground truth remained evaluator-only",

    batch7
      .groundTruth
      ?.passedToAira ===
      false &&

    batch9
      .groundTruthPassedToAira ===
      false &&

    batch10ab
      .groundTruthPassedToAira ===
      false
  );


  certifyD(
    "Phase21 grants no execution authority",

    batch8b
      .phase21ExecutionAuthorized ===
      false &&

    batch9
      .phase21ExecutionAuthorized ===
      false &&

    batch10ab
      .phase21ExecutionAuthorized ===
      false &&

    experiment
      .executionAuthorized !==
      true &&

    lab
      .executionAuthorized !==
      true
  );


  certifyD(
    "Production certification remains false",

    batch8b
      .productionCertified ===
      false &&

    batch9
      .productionCertified ===
      false &&

    batch10ab
      .productionCertified ===
      false &&

    lab.production ===
      false
  );


  const evidenceHashesAfter =
    hashEvidenceSet(
      evidence
    );


  certifyD(
    "Frozen historical artifacts unchanged",

    stableStringify(
      evidenceHashesBefore
    ) ===
      stableStringify(
        evidenceHashesAfter
      ),

    {
      before:
        evidenceHashesBefore,

      after:
        evidenceHashesAfter,
    }
  );


  const finalLab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  certifyD(
    "Final canonical lab safety intact",

    finalLab &&

    normalize(
      finalLab.status
    ) ===
      "AVAILABLE" &&

    normalize(
      finalLab.safetyClass
    ) ===
      "LAB_ONLY" &&

    finalLab.production ===
      false &&

    finalLab.executionAuthorized !==
      true
  );


  // ==========================================================================
  // 5. FINAL FREEZE CERTIFICATE
  // ==========================================================================

  const certificate =
    Object.freeze({
      certificateVersion:
        CERTIFICATE_VERSION,

      certifiedAt:
        new Date()
          .toISOString(),

      phase:
        "21",

      subphase:
        "21.19C-21.19D",

      batch:
        "10C/D",

      certificationType:
        "FINAL_RELIABILITY_LAB_FREEZE",

      status:
        "PASS",

      liveCertified:
        true,

      frozen:
        true,

      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      tenantId:
        configuration
          .tenantId,

      labEnvironmentId:
        configuration
          .labEnvironmentId,

      experimentRunId,

      incidentId,

      correlationId:
        experiment
          .correlationId,

      sourceEvidence:
        Object.fromEntries(
          Object.entries(
            evidence
          )
            .map(
              ([
                key,
                item,
              ]) => [
                key,

                {
                  artifact:
                    path.basename(
                      item.path
                    ),

                  sha256:
                    evidenceHashesBefore[
                      key
                    ],
                },
              ]
            )
        ),

      persistenceArchitecture: {
        pass:
          true,

        checks:
          cChecks,

        inspection:
          architecture,
      },

      finalFreeze: {
        pass:
          true,

        checks:
          freezeChecks,
      },

      phase21: {
        name:
          "RELIABILITY LAB",

        status:
          "LIVE CERTIFIED",

        result:
          "PASS",

        frozen:
          true,
      },

      authority: {
        productionCertified:
          false,

        executionAuthorizedByPhase21:
          false,

        canGrantAutonomy:
          false,

        canBypassPolicy:
          false,

        canBypassApproval:
          false,

        phase21IsEvidenceOnly:
          true,
      },

      groundTruthPassedToAira:
        false,

      phase21ExecutionAuthorized:
        false,

      productionCertified:
        false,

      finalLabStatus:
        finalLab.status,

      passed:
        true,
    });


  const artifactPath =
    writeCertificate(
      certificate
    );


  printSection(
    "FINAL PHASE-21 RESULT"
  );


  console.log(
    "PHASE 21.19C — PERSISTENCE + ARCHITECTURE: PASS"
  );

  console.log(
    "PHASE 21.19D — FINAL PHASE-21 FREEZE:      PASS"
  );

  console.log(
    ""
  );

  console.log(
    "PHASE 21 — RELIABILITY LAB"
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
    "Production certified:             false"
  );

  console.log(
    "Execution authorized by Phase21:  false"
  );

  console.log(
    "Ground truth leaked:               false"
  );

  console.log(
    `Final lab status:                  ${finalLab.status}`
  );

  console.log(
    `Artifact:                          ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 10C/D STATUS: LIVE CERTIFIED / PASS / FROZEN"
  );

  console.log(
    "PHASE 21 STATUS: LIVE CERTIFIED / PASS / FROZEN"
  );
}


// ============================================================================
// ARCHITECTURE INSPECTION
// ============================================================================

async function inspectArchitecture({
  repository,
  configuration,
  experimentRunId,
  incidentId,
  batch8b,
  batch9,
  tenantIsolation,
}) {
  return repository
    .scope
    .run(
      {
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const migrationState =
          await inspectMigrations(
            client
          );

        const relationState =
          await inspectReliabilityRelations(
            client
          );

        const policyState =
          await inspectPolicies(
            client
          );

        const certifierRole =
          await inspectCertifierRole(
            client
          );

        const immutability =
          await inspectExperimentImmutability(
            client,
            experimentRunId
          );


        const experimentResult =
          await client.query(
            `
              SELECT
                er.id,
                er.public_id,
                er.experiment_key,
                er.experiment_version,
                er.correlation_id,
                er.execution_authorized

              FROM
                reliability.experiment_runs er

              WHERE
                er.organization_id = $1
                AND er.environment_id = $2
                AND er.public_id = $3

              LIMIT 1
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              experimentRunId,
            ]
          );


        requireCondition(
          experimentResult
            .rows
            .length ===
            1,

          "PHASE21_BATCH10CD_CANONICAL_RUN_MISSING",

          "Canonical experiment run disappeared during architecture inspection"
        );


        const experimentRow =
          experimentResult
            .rows[0];


        const failureResult =
          await client.query(
            `
              SELECT
                fi.public_id,
                fi.failure_domain,
                fi.failure_type,
                fi.target_resource_public_id,
                fi.target_resource_type,
                fi.injector_key,
                fi.injector_version,
                fi.state,
                fi.provenance,
                fi.execution_authorized

              FROM
                reliability.failure_injections fi

              WHERE
                fi.organization_id = $1
                AND fi.environment_id = $2
                AND fi.experiment_run_id = $3

              ORDER BY
                fi.requested_at ASC
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              experimentRow.id,
            ]
          );


        const observationResult =
          await client.query(
            `
              SELECT
                o.public_id,
                o.observation_type,
                o.source,
                o.reference_type,
                o.reference_id,
                o.summary,
                o.execution_authorized

              FROM
                reliability.observations o

              WHERE
                o.organization_id = $1
                AND o.environment_id = $2
                AND o.experiment_run_id = $3

              ORDER BY
                o.observed_at ASC
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              experimentRow.id,
            ]
          );


        const assertionResult =
          await client.query(
            `
              SELECT
                ar.public_id,
                ar.assertion_key,
                ar.status,
                ar.reason_code,
                ar.details,
                ar.execution_authorized

              FROM
                reliability.assertion_results ar

              WHERE
                ar.organization_id = $1
                AND ar.environment_id = $2
                AND ar.experiment_run_id = $3

              ORDER BY
                ar.assertion_key ASC
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              experimentRow.id,
            ]
          );


        const metricResult =
          await client.query(
            `
              SELECT
                m.public_id,
                m.metric_key,
                m.value,
                m.unit,
                m.metadata,
                m.execution_authorized

              FROM
                reliability.metrics m

              WHERE
                m.organization_id = $1
                AND m.environment_id = $2
                AND m.experiment_run_id = $3

              ORDER BY
                m.metric_key ASC
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              experimentRow.id,
            ]
          );


        const executionLineageResult =
          await client.query(
            `
              SELECT
                a.public_id AS authorization_id,
                a.authorization_granted,
                a.status AS authorization_status,
                a.plan_id AS authorization_plan_id,
                a.plan_hash AS authorization_plan_hash,

                rd.public_id AS recovery_decision_id,

                r.public_id AS execution_request_id,
                r.plan_id AS request_plan_id,
                r.plan_hash AS request_plan_hash,
                r.state AS request_state,
                r.playbook_id,
                r.candidate_id

              FROM
                execution.authorizations a

              JOIN
                execution.execution_requests r
              ON
                r.authorization_id =
                a.id

              JOIN
                execution.recovery_decisions rd
              ON
                rd.id =
                a.recovery_decision_id

              WHERE
                a.organization_id = $1
                AND a.environment_id = $2
                AND a.public_id = $3
                AND r.public_id = $4

              LIMIT 1
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              batch8b
                .authorizationId,

              batch8b
                .executionRequestId,
            ]
          );


        const authorityLeakResult =
          await client.query(
            `
              SELECT

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.lab_environments
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.experiment_definitions
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.experiment_runs
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.failure_injections
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.observations
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.assertion_results
                  WHERE
                    execution_authorized = TRUE
                )

                +

                (
                  SELECT
                    COUNT(*)::integer
                  FROM
                    reliability.metrics
                  WHERE
                    execution_authorized = TRUE
                )

                AS authority_leak_count
            `
          );


        const failures =
          failureResult.rows;

        const observations =
          observationResult.rows;

        const assertions =
          assertionResult.rows;

        const metrics =
          metricResult.rows;

        const executionLineage =
          executionLineageResult
            .rows[0] ||
          null;


        const recoveryObservation =
          [
            ...observations,
          ]
            .reverse()
            .find(
              row =>
                row.observation_type ===
                  "RECOVERY_VERIFICATION_AND_SCORING" &&

                row.source ===
                  "PHASE21_BATCH9_LIVE_CERTIFIER"
            ) ||
          null;


        const expectedAssertionKeys =
          new Set(
            REQUIRED_ASSERTIONS
          );

        const observedAssertionKeys =
          new Set(
            assertions
              .filter(
                row =>
                  row.status ===
                  "PASS"
              )
              .map(
                row =>
                  row.assertion_key
              )
          );


        const expectedMetricKeys =
          new Set(
            REQUIRED_METRICS
          );

        const observedMetricKeys =
          new Set(
            metrics.map(
              row =>
                row.metric_key
            )
          );


        const canonicalFailure =
          failures.find(
            row =>
              row.provenance
                ?.source ===
                "AIRA_PHASE_21_FAILURE_INJECTION_ENGINE" &&

              row.provenance
                ?.experimentRunId ===
                experimentRunId
          ) ||
          null;


        const rlsPass =
          RELIABILITY_TABLES.every(
            table =>
              relationState
                .byTable[
                  table
                ]
                ?.rowSecurity ===
                true &&

              relationState
                .byTable[
                  table
                ]
                ?.forceRowSecurity ===
                true
          );


        const policyPass =
          RELIABILITY_TABLES.every(
            table => {
              const policy =
                policyState
                  .byTable[
                    table
                  ];

              if (!policy) {
                return false;
              }

              const combined =
                `${policy.qual || ""} ${policy.withCheck || ""}`;

              return (
                combined.includes(
                  "current_organization_id"
                ) &&

                combined.includes(
                  "current_environment_id"
                ) &&

                String(
                  policy.withCheck ||
                  ""
                )
                  .includes(
                    "execution_authorized"
                  )
              );
            }
          );


        const failureProvenancePass =
          Boolean(
            canonicalFailure
          ) &&

          canonicalFailure
            .execution_authorized ===
            false &&

          canonicalFailure
            .provenance
            ?.recoveryProvenance ===
            false &&

          canonicalFailure
            .provenance
            ?.evaluatorGroundTruthIncluded ===
            false &&

          canonicalFailure
            .provenance
            ?.executionAuthorized ===
            false;


        const correlationLineagePass =
          Boolean(
            experimentRow
              .correlation_id
          ) &&

          Boolean(
            canonicalFailure
          ) &&

          canonicalFailure
            .provenance
            ?.correlationId ===
            experimentRow
              .correlation_id;


        const authorizationLineagePass =
          Boolean(
            executionLineage
          ) &&

          executionLineage
            .authorization_id ===
            batch8b
              .authorizationId &&

          executionLineage
            .execution_request_id ===
            batch8b
              .executionRequestId &&

          executionLineage
            .recovery_decision_id ===
            batch8b
              .recoveryDecisionId &&

          executionLineage
            .authorization_granted ===
            true &&

          executionLineage
            .request_plan_id ===
            batch8b
              .planId &&

          executionLineage
            .request_plan_hash ===
            batch8b
              .planHash &&

          executionLineage
            .authorization_plan_id ===
            batch8b
              .planId &&

          executionLineage
            .authorization_plan_hash ===
            batch8b
              .planHash;


        const recoveryProvenancePass =
          authorizationLineagePass &&

          executionLineage
            .playbook_id ===
            batch8b
              .selectedPlaybookId &&

          executionLineage
            .candidate_id ===
            batch8b
              .selectedCandidateId;


        const verificationLineagePass =
          Boolean(
            recoveryObservation
          ) &&

          normalize(
            recoveryObservation
              .reference_type
          ) ===
            "INCIDENT" &&

          recoveryObservation
            .reference_id ===
            incidentId &&

          recoveryObservation
            .summary
            ?.certificateVersion ===
            "21.17-18-batch9-live-v1" &&

          recoveryObservation
            .summary
            ?.executionEvidence
            ?.authorizationId ===
            batch8b
              .authorizationId &&

          recoveryObservation
            .summary
            ?.executionEvidence
            ?.executionRequestId ===
            batch8b
              .executionRequestId &&

          recoveryObservation
            .summary
            ?.executionEvidence
            ?.planId ===
            batch8b
              .planId &&

          recoveryObservation
            .execution_authorized ===
            false;


        const assertionLineagePass =
          REQUIRED_ASSERTIONS.every(
            key =>
              observedAssertionKeys
                .has(
                  key
                )
          ) &&

          assertions
            .filter(
              row =>
                expectedAssertionKeys
                  .has(
                    row.assertion_key
                  )
            )
            .every(
              row =>
                row.execution_authorized ===
                  false &&

                row.details
                  ?.certificateVersion ===
                  "21.17-18-batch9-live-v1" &&

                row.details
                  ?.executionAuthorized ===
                  false &&

                row.details
                  ?.groundTruthPassedToAira ===
                  false
            );


        const metricLineagePass =
          REQUIRED_METRICS.every(
            key =>
              observedMetricKeys
                .has(
                  key
                )
          ) &&

          metrics
            .filter(
              row =>
                expectedMetricKeys
                  .has(
                    row.metric_key
                  )
            )
            .every(
              row =>
                row.execution_authorized ===
                  false &&

                Number.isFinite(
                  Number(
                    row.value
                  )
                ) &&

                row.metadata
                  ?.certificateVersion ===
                  "21.17-18-batch9-live-v1" &&

                row.metadata
                  ?.executionAuthorized ===
                  false &&

                row.metadata
                  ?.groundTruthPassedToAira ===
                  false
            );


        const tenantIsolationPass =
          tenantIsolation
            .pass ===
            true &&

          tenantIsolation
            .liveCertified ===
            true &&

          tenantIsolation
            .postgresIsolation
            ?.pass ===
            true &&

          tenantIsolation
            .postgresIsolation
            ?.forceRlsCanary ===
            true &&

          tenantIsolation
            .postgresIsolation
            ?.crossTenantVisibilityLeak ===
            false &&

          tenantIsolation
            .redisIsolation
            ?.collisions ===
            0 &&

          tenantIsolation
            .rabbitMqIsolation
            ?.envelopeLeaks ===
            0 &&

          tenantIsolation
            .multiTenant
            ?.boundaryViolations ===
            0;


        const authorityLeakCount =
          Number(
            authorityLeakResult
              .rows[0]
              ?.authority_leak_count ||
            0
          );


        const postgresCanonicalPass =
          migrationState.pass &&

          relationState.pass &&

          rlsPass &&

          Boolean(
            canonicalFailure
          ) &&

          Boolean(
            recoveryObservation
          ) &&

          assertionLineagePass &&

          metricLineagePass;


        return Object.freeze({
          migrations:
            migrationState,

          tables:
            relationState,

          rls: {
            pass:
              rlsPass,

            tables:
              relationState
                .byTable,
          },

          policies: {
            pass:
              policyPass,

            policies:
              policyState
                .byTable,
          },

          certifierRole,

          tenantIsolation: {
            pass:
              tenantIsolationPass,

            liveCertified:
              tenantIsolation
                .liveCertified,

            forceRlsCanary:
              tenantIsolation
                .postgresIsolation
                ?.forceRlsCanary ===
                true,

            crossTenantVisibilityLeak:
              tenantIsolation
                .postgresIsolation
                ?.crossTenantVisibilityLeak,

            redisCollisions:
              tenantIsolation
                .redisIsolation
                ?.collisions,

            rabbitMqEnvelopeLeaks:
              tenantIsolation
                .rabbitMqIsolation
                ?.envelopeLeaks,

            boundaryViolations:
              tenantIsolation
                .multiTenant
                ?.boundaryViolations,
          },

          experimentImmutability:
            immutability,

          failureProvenance: {
            pass:
              failureProvenancePass,

            evidenceCount:
              failures.length,

            evidenceId:
              canonicalFailure
                ?.public_id ||
              null,

            failureType:
              canonicalFailure
                ?.failure_type ||
              null,

            injectorKey:
              canonicalFailure
                ?.injector_key ||
              null,

            provenanceSource:
              canonicalFailure
                ?.provenance
                ?.source ||
              null,
          },

          recoveryProvenance: {
            pass:
              recoveryProvenancePass,

            recoveryDecisionId:
              executionLineage
                ?.recovery_decision_id ||
              null,

            selectedPlaybookId:
              executionLineage
                ?.playbook_id ||
              null,

            selectedCandidateId:
              executionLineage
                ?.candidate_id ||
              null,
          },

          correlationLineage: {
            pass:
              correlationLineagePass,

            experimentCorrelationId:
              experimentRow
                .correlation_id,

            failureCorrelationId:
              canonicalFailure
                ?.provenance
                ?.correlationId ||
              null,
          },

          authorizationLineage: {
            pass:
              authorizationLineagePass,

            authorizationId:
              executionLineage
                ?.authorization_id ||
              null,

            executionRequestId:
              executionLineage
                ?.execution_request_id ||
              null,

            recoveryDecisionId:
              executionLineage
                ?.recovery_decision_id ||
              null,

            planId:
              executionLineage
                ?.request_plan_id ||
              null,

            planHash:
              executionLineage
                ?.request_plan_hash ||
              null,
          },

          verificationLineage: {
            pass:
              verificationLineagePass,

            observationId:
              recoveryObservation
                ?.public_id ||
              null,

            referenceId:
              recoveryObservation
                ?.reference_id ||
              null,

            authorizationId:
              recoveryObservation
                ?.summary
                ?.executionEvidence
                ?.authorizationId ||
              null,

            executionRequestId:
              recoveryObservation
                ?.summary
                ?.executionEvidence
                ?.executionRequestId ||
              null,

            planId:
              recoveryObservation
                ?.summary
                ?.executionEvidence
                ?.planId ||
              null,
          },

          metricLineage: {
            pass:
              metricLineagePass,

            expectedMetricKeys:
              REQUIRED_METRICS,

            observedMetricKeys:
              [
                ...observedMetricKeys,
              ]
                .sort(),
          },

          assertionLineage: {
            pass:
              assertionLineagePass,

            expectedAssertionKeys:
              REQUIRED_ASSERTIONS,

            observedAssertionKeys:
              [
                ...observedAssertionKeys,
              ]
                .sort(),
          },

          authorityInvariant: {
            pass:
              authorityLeakCount ===
                0 &&

              experimentRow
                .execution_authorized ===
                false,

            authorityLeakCount,

            experimentExecutionAuthorized:
              experimentRow
                .execution_authorized,
          },

          postgresCanonical: {
            pass:
              postgresCanonicalPass,

            experimentRunId,

            failureEvidenceRows:
              failures.length,

            observationRows:
              observations.length,

            assertionRows:
              assertions.length,

            metricRows:
              metrics.length,

            batch9PostgresEvidencePersisted:
              batch9
                .postgresEvidencePersisted ===
                true,
          },
        });
      }
    );
}


async function inspectMigrations(
  client
) {
  const required =
    [
      {
        version:
          "0082",

        filename:
          "0082_reliability_lab_foundation.sql",
      },

      {
        version:
          "0084",

        filename:
          "0084_phase21_rls_certification_role.sql",
      },
    ];


  const result =
    await client.query(
      `
        SELECT
          version,
          filename,
          checksum,
          applied_at

        FROM
          aira_schema_migrations

        WHERE
          version =
          ANY($1::text[])
      `,
      [
        required.map(
          item =>
            item.version
        ),
      ]
    );


  const byVersion =
    Object.fromEntries(
      result.rows.map(
        row => [
          row.version,
          row,
        ]
      )
    );


  const checks =
    required.map(
      item => {
        const row =
          byVersion[
            item.version
          ];

        const filePath =
          path.join(
            MIGRATION_DIR,
            item.filename
          );

        const raw =
          fs.readFileSync(
            filePath,
            "utf8"
          );

        const sql =
          raw.charCodeAt(0) ===
            0xfeff
            ? raw.slice(1)
            : raw;

        const checksum =
          sha256Text(
            sql
          );

        return {
          version:
            item.version,

          filename:
            item.filename,

          applied:
            Boolean(
              row
            ),

          filenameMatches:
            row
              ?.filename ===
            item.filename,

          checksumMatches:
            row
              ?.checksum ===
            checksum,

          appliedAt:
            row
              ?.applied_at ||
            null,
        };
      }
    );


  return {
    pass:
      checks.every(
        item =>
          item.applied &&
          item.filenameMatches &&
          item.checksumMatches
      ),

    checks,
  };
}


async function inspectReliabilityRelations(
  client
) {
  const result =
    await client.query(
      `
        SELECT
          c.relname AS table_name,
          c.relrowsecurity,
          c.relforcerowsecurity

        FROM
          pg_class c

        JOIN
          pg_namespace n
        ON
          n.oid =
          c.relnamespace

        WHERE
          n.nspname =
            'reliability'

          AND
          c.relkind =
            'r'

          AND
          c.relname =
          ANY($1::text[])
      `,
      [
        RELIABILITY_TABLES,
      ]
    );


  const byTable =
    Object.fromEntries(
      result.rows.map(
        row => [
          row.table_name,

          {
            present:
              true,

            rowSecurity:
              row.relrowsecurity ===
              true,

            forceRowSecurity:
              row.relforcerowsecurity ===
              true,
          },
        ]
      )
    );


  for (
    const table
    of RELIABILITY_TABLES
  ) {
    if (
      !byTable[
        table
      ]
    ) {
      byTable[
        table
      ] = {
        present:
          false,

        rowSecurity:
          false,

        forceRowSecurity:
          false,
      };
    }
  }


  return {
    pass:
      RELIABILITY_TABLES.every(
        table =>
          byTable[
            table
          ]
            .present ===
          true
      ),

    byTable,
  };
}


async function inspectPolicies(
  client
) {
  const result =
    await client.query(
      `
        SELECT
          tablename,
          policyname,
          cmd,
          qual,
          with_check

        FROM
          pg_policies

        WHERE
          schemaname =
            'reliability'

          AND
          tablename =
          ANY($1::text[])
      `,
      [
        RELIABILITY_TABLES,
      ]
    );


  const byTable =
    {};


  for (
    const row
    of result.rows
  ) {
    if (
      row.policyname ===
      `reliability_${row.tablename}_tenant_policy`
    ) {
      byTable[
        row.tablename
      ] = {
        policyName:
          row.policyname,

        command:
          row.cmd,

        qual:
          row.qual,

        withCheck:
          row.with_check,
      };
    }
  }


  return {
    byTable,
  };
}


async function inspectCertifierRole(
  client
) {
  const result =
    await client.query(
      `
        SELECT
          rolname,
          rolsuper,
          rolbypassrls,
          rolcanlogin,
          rolcreatedb,
          rolcreaterole,
          rolinherit

        FROM
          pg_roles

        WHERE
          rolname =
            'aira_rls_certifier'

        LIMIT 1
      `
    );


  const row =
    result
      .rows[0] ||
    null;


  const pass =
    Boolean(
      row
    ) &&

    row.rolsuper ===
      false &&

    row.rolbypassrls ===
      false &&

    row.rolcanlogin ===
      false &&

    row.rolcreatedb ===
      false &&

    row.rolcreaterole ===
      false &&

    row.rolinherit ===
      false;


  return {
    pass,

    exists:
      Boolean(
        row
      ),

    noSuperuser:
      row
        ?.rolsuper ===
      false,

    noBypassRls:
      row
        ?.rolbypassrls ===
      false,

    noLogin:
      row
        ?.rolcanlogin ===
      false,

    noCreateDb:
      row
        ?.rolcreatedb ===
      false,

    noCreateRole:
      row
        ?.rolcreaterole ===
      false,

    noInherit:
      row
        ?.rolinherit ===
      false,
  };
}


async function inspectExperimentImmutability(
  client,
  experimentRunId
) {
  const definitionResult =
    await client.query(
      `
        SELECT
          ed.id,
          ed.public_id

        FROM
          reliability.experiment_definitions ed

        JOIN
          reliability.experiment_runs er
        ON
          er.experiment_definition_id =
          ed.id

        WHERE
          er.public_id =
          $1

        LIMIT 1
      `,
      [
        experimentRunId,
      ]
    );


  requireCondition(
    definitionResult
      .rows
      .length ===
      1,

    "PHASE21_BATCH10CD_DEFINITION_NOT_FOUND",

    "Experiment definition for final run was not found"
  );


  const definition =
    definitionResult
      .rows[0];


  const triggerResult =
    await client.query(
      `
        SELECT
          t.tgname,
          t.tgenabled,
          pg_get_triggerdef(
            t.oid
          ) AS definition

        FROM
          pg_trigger t

        JOIN
          pg_class c
        ON
          c.oid =
          t.tgrelid

        JOIN
          pg_namespace n
        ON
          n.oid =
          c.relnamespace

        WHERE
          n.nspname =
            'reliability'

          AND
          c.relname =
            'experiment_definitions'

          AND
          NOT t.tgisinternal
      `
    );


  const triggerNames =
    new Set(
      triggerResult
        .rows
        .map(
          row =>
            row.tgname
        )
    );


  const updateTriggerPresent =
    triggerNames.has(
      "trg_reliability_experiment_definition_no_update"
    );

  const deleteTriggerPresent =
    triggerNames.has(
      "trg_reliability_experiment_definition_no_delete"
    );


  /*
   * These probes are always rolled back to SAVEPOINT.
   *
   * If immutability is functioning, PostgreSQL rejects the operation.
   * If the trigger were missing, the operation is still rolled back and
   * therefore cannot mutate historical evidence.
   */
  const updateRejected =
    await rollbackOnlyMutationProbe(
      client,

      "phase21_immutability_update",

      `
        UPDATE
          reliability.experiment_definitions

        SET
          description =
          description

        WHERE
          id = $1
      `,

      [
        definition.id,
      ],

      "Reliability experiment definitions are immutable"
    );


  const deleteRejected =
    await rollbackOnlyMutationProbe(
      client,

      "phase21_immutability_delete",

      `
        DELETE FROM
          reliability.experiment_definitions

        WHERE
          id = $1
      `,

      [
        definition.id,
      ],

      "Reliability experiment definitions are immutable"
    );


  return {
    pass:
      updateTriggerPresent &&
      deleteTriggerPresent &&
      updateRejected &&
      deleteRejected,

    definitionId:
      definition
        .public_id,

    updateTriggerPresent,

    deleteTriggerPresent,

    updateRejected,

    deleteRejected,

    probesRolledBack:
      true,
  };
}


async function rollbackOnlyMutationProbe(
  client,
  savepoint,
  sql,
  values,
  expectedMessage
) {
  await client.query(
    `SAVEPOINT ${savepoint}`
  );


  try {
    await client.query(
      sql,
      values
    );

    await client.query(
      `ROLLBACK TO SAVEPOINT ${savepoint}`
    );

    await client.query(
      `RELEASE SAVEPOINT ${savepoint}`
    );

    return false;
  } catch (
    error
  ) {
    await client.query(
      `ROLLBACK TO SAVEPOINT ${savepoint}`
    );

    await client.query(
      `RELEASE SAVEPOINT ${savepoint}`
    );

    return String(
      error
        ?.message ||
      ""
    )
      .includes(
        expectedMessage
      );
  }
}


// ============================================================================
// ARTIFACTS
// ============================================================================

function loadLatestArtifact(
  prefix
) {
  requireCondition(
    fs.existsSync(
      ARTIFACT_DIR
    ),

    "PHASE21_BATCH10CD_ARTIFACT_DIRECTORY_MISSING",

    `Artifact directory does not exist: ${ARTIFACT_DIR}`
  );


  const candidates =
    fs.readdirSync(
      ARTIFACT_DIR,
      {
        withFileTypes:
          true,
      }
    )
      .filter(
        entry =>
          entry.isFile()
      )
      .map(
        entry =>
          entry.name
      )
      .filter(
        name =>
          name.startsWith(
            prefix
          ) &&

          name.endsWith(
            ".json"
          )
      )
      .map(
        name => {
          const artifactPath =
            path.join(
              ARTIFACT_DIR,
              name
            );

          return {
            path:
              artifactPath,

            mtimeMs:
              fs.statSync(
                artifactPath
              )
                .mtimeMs,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.mtimeMs -
          left.mtimeMs
      );


  requireCondition(
    candidates.length >
      0,

    "PHASE21_BATCH10CD_REQUIRED_ARTIFACT_MISSING",

    `No artifact found with prefix ${prefix}`
  );


  for (
    const candidate
    of candidates
  ) {
    try {
      const artifact =
        JSON.parse(
          fs.readFileSync(
            candidate.path,
            "utf8"
          )
        );


      if (
        isPassingArtifact(
          artifact
        )
      ) {
        return Object.freeze({
          path:
            candidate.path,

          artifact:
            Object.freeze(
              artifact
            ),
        });
      }
    } catch {
      /*
       * Continue to the next historical candidate.
       */
    }
  }


  throw certificationError(
    "PHASE21_BATCH10CD_NO_PASSING_ARTIFACT",

    `No passing artifact found with prefix ${prefix}`
  );
}


function isPassingArtifact(
  artifact
) {
  if (
    !artifact ||

    typeof artifact !==
      "object"
  ) {
    return false;
  }


  if (
    artifact.passed ===
      true ||

    artifact.pass ===
      true ||

    artifact.status ===
      "PASS" ||

    artifact.finalResult
      ?.pass ===
      true
  ) {
    return true;
  }


  /*
   * Batch 7 predates the generic passed:true certificate field.
   */
  if (
    artifact.certificate ===
      "21.13-14-live-v1" &&

    artifact.frozen ===
      true &&

    artifact.assertions
      ?.detected ===
      "PASS" &&

    artifact.assertions
      ?.correlated ===
      "PASS" &&

    artifact.assertions
      ?.diagnosisCorrect ===
      "PASS" &&

    artifact.reset
      ?.succeeded ===
      true &&

    artifact.reset
      ?.baselineRestored ===
      true &&

    artifact.finalLabStatus ===
      "AVAILABLE" &&

    artifact.productionCertified ===
      false &&

    artifact.executionAuthorized ===
      false
  ) {
    return true;
  }


  return false;
}


function artifactFrozenPass(
  artifact
) {
  return (
    isPassingArtifact(
      artifact
    ) &&

    (
      artifact.frozen ===
        true ||

      artifact.finalResult
        ?.frozen ===
        true
    )
  );
}


function hashEvidenceSet(
  evidence
) {
  return Object.fromEntries(
    Object.entries(
      evidence
    )
      .map(
        ([
          key,
          item,
        ]) => [
          key,

          sha256File(
            item.path
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


function sha256Text(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      value
    )
    .digest(
      "hex"
    );
}


function stableStringify(
  value
) {
  return JSON.stringify(
    sortValue(
      value
    )
  );
}


function sortValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortValue
    );
  }


  if (
    value &&

    typeof value ===
      "object" &&

    !(
      value instanceof
      Date
    )
  ) {
    return Object.keys(
      value
    )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[
            key
          ] =
            sortValue(
              value[
                key
              ]
            );

          return result;
        },

        {}
      );
  }


  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString();
  }


  return value;
}


function writeCertificate(
  certificate
) {
  fs.mkdirSync(
    ARTIFACT_DIR,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );


  const artifactPath =
    path.join(
      ARTIFACT_DIR,

      `phase21-final-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,

    `${JSON.stringify(
      certificate,
      null,
      2
    )}\n`,

    "utf8"
  );


  return artifactPath;
}


// ============================================================================
// CONFIGURATION / SAFETY
// ============================================================================

function loadConfiguration() {
  return Object.freeze({
    organizationId:
      readEnv(
        "PHASE21_ORGANIZATION_ID",
        DEFAULTS.organizationId
      ),

    environmentId:
      readEnv(
        "PHASE21_ENVIRONMENT_ID",
        DEFAULTS.environmentId
      ),

    tenantId:
      readEnv(
        "PHASE21_TENANT_ID",
        DEFAULTS.tenantId
      ),

    labEnvironmentId:
      readEnv(
        "PHASE21_LAB_ENVIRONMENT_ID",
        DEFAULTS.labEnvironmentId
      ),
  });
}


function assertProcessSafety() {
  const nodeEnv =
    normalize(
      process.env
        .NODE_ENV
    );

  const deploymentEnv =
    normalize(
      process.env
        .DEPLOYMENT_ENVIRONMENT ||

      process.env
        .APP_ENV ||

      process.env
        .ENVIRONMENT
    );


  requireCondition(
    nodeEnv !==
      "PRODUCTION",

    "PHASE21_BATCH10CD_PRODUCTION_NODE_ENV_BLOCKED",

    "Final Phase-21 certification cannot run with NODE_ENV=production"
  );


  requireCondition(
    ![
      "PRODUCTION",
      "PROD",
    ].includes(
      deploymentEnv
    ),

    "PHASE21_BATCH10CD_PRODUCTION_ENVIRONMENT_BLOCKED",

    "Final Phase-21 certification cannot run against production"
  );


  requireCondition(
    parseBoolean(
      process.env
        .PRODUCTION
    ) !==
      true,

    "PHASE21_BATCH10CD_PRODUCTION_FLAG_BLOCKED",

    "Final Phase-21 certification cannot run when PRODUCTION=true"
  );
}


// ============================================================================
// COMMON HELPERS
// ============================================================================

function readEnv(
  name,
  fallback
) {
  const value =
    process.env[
      name
    ];


  return (
    value ===
      undefined ||

    value ===
      null ||

    String(
      value
    )
      .trim() ===
      ""
  )
    ? fallback
    : String(
        value
      )
        .trim();
}


function requiredString(
  value,
  code
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim();


  requireCondition(
    normalized.length >
      0,

    code,

    `Required value missing: ${code}`
  );


  return normalized;
}


function normalize(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toUpperCase();
}


function parseBoolean(
  value
) {
  if (
    value ===
      undefined ||

    value ===
      null ||

    value ===
      ""
  ) {
    return null;
  }


  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();


  if (
    [
      "true",
      "1",
      "yes",
      "y",
      "on",
    ].includes(
      normalized
    )
  ) {
    return true;
  }


  if (
    [
      "false",
      "0",
      "no",
      "n",
      "off",
    ].includes(
      normalized
    )
  ) {
    return false;
  }


  return null;
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    !condition
  ) {
    throw certificationError(
      code,
      message
    );
  }
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
        "Phase21Batch10CDFinalCertificationError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


// ============================================================================
// OUTPUT
// ============================================================================

function printHeader(
  configuration
) {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21 — BATCH 10C/D FINAL LIVE CERTIFICATION"
  );

  console.log(
    "PHASE 21.19C — PERSISTENCE + ARCHITECTURE CERTIFICATION"
  );

  console.log(
    "PHASE 21.19D — FINAL PHASE-21 FREEZE"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate version:      ${CERTIFICATE_VERSION}`
  );

  console.log(
    `Organization:             ${configuration.organizationId}`
  );

  console.log(
    `Environment:              ${configuration.environmentId}`
  );

  console.log(
    `Tenant:                   ${configuration.tenantId}`
  );

  console.log(
    `Lab environment:          ${configuration.labEnvironmentId}`
  );

  console.log(
    "Execution authority:      NONE"
  );

  console.log(
    "Production authority:     NONE"
  );

  console.log(
    "Ground truth to AIRA:     false"
  );

  console.log(
    "=============================================================="
  );
}


function printSection(
  title
) {
  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    title
  );

  console.log(
    "--------------------------------------------------------------"
  );
}


// ============================================================================
// ENTRYPOINT
// ============================================================================

main()
  .then(
    async () => {
      try {
        await closePostgresPool();
      } catch {
        /*
         * Certification result must not be changed by
         * connection-pool shutdown logging.
         */
      }


      process.exitCode =
        0;
    }
  )
  .catch(
    async error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 21 BATCH 10C/D FINAL CERTIFICATION: FAILED"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `Code:                     ${error?.code || "UNEXPECTED_ERROR"}`
      );

      console.error(
        `Message:                  ${error?.message || String(error)}`
      );


      if (
        process.env
          .PHASE21_DEBUG ===
        "true"
      ) {
        console.error(
          ""
        );

        console.error(
          error?.stack ||
          error
        );
      }


      console.error(
        ""
      );

      console.error(
        "Production certified:     false"
      );

      console.error(
        "Phase21 authorized:       false"
      );

      console.error(
        "Ground truth leaked:      false"
      );


      try {
        await closePostgresPool();
      } catch {
        /*
         * Preserve original certification failure.
         */
      }


      process.exitCode =
        1;
    }
  );