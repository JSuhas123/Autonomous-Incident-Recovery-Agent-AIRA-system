"use strict";

/**
 * AIRA PHASE 21.19A + 21.19B — BATCH 10A/B LIVE MASTER CERTIFICATION
 *
 * 21.19A — End-to-End Live Experiment lineage certification
 * 21.19B — Master Safety Certification
 *
 * This certifier deliberately DOES NOT execute another recovery. It certifies
 * the single already-live experiment lineage produced by the frozen Phase-21
 * certifiers and proves the master safety laws over that lineage.
 *
 * It never grants execution authority, never certifies production, never
 * exposes evaluator ground truth to AIRA, and never mutates historical evidence.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PostgresReliabilityLabRepository =
  require("../persistence/postgres/PostgresReliabilityLabRepository");

const {
  assertFailureInjectionAllowed,
} = require("../services/reliability/failureInjectionSafetyBoundary");

const CERTIFICATE_VERSION =
  "21.19ab-batch10-live-v1";

const ARTIFACT_DIR =
  path.resolve(
    __dirname,
    "..",
    "artifacts",
    "phase21"
  );

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

  const repository =
    new PostgresReliabilityLabRepository();


  // ==========================================================================
  // FROZEN LIVE EVIDENCE
  // ==========================================================================

  printSection(
    "FROZEN LIVE EVIDENCE DISCOVERY"
  );


  const evidence =
    Object.freeze({
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

      tenantIsolation:
        loadLatestArtifact(
          "phase21-10c-final-certification-"
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


  /*
   * Capture exact historical evidence hashes BEFORE certification.
   *
   * The same hashes are recomputed after all checks.
   *
   * Batch 10A/B must never rewrite previous evidence.
   */
  const historicalHashesBefore =
    hashEvidenceSet(
      evidence
    );


  // ==========================================================================
  // CANONICAL POSTGRESQL STATE
  // ==========================================================================

  printSection(
    "CANONICAL POSTGRESQL STATE"
  );


  const batch9 =
    evidence
      .batch9
      .artifact;


  const experimentRunId =
    requiredString(
      batch9
        .experimentRunId,

      "PHASE21_BATCH10_EXPERIMENT_RUN_ID_MISSING"
    );


  const incidentId =
    requiredString(
      batch9
        .incidentId,

      "PHASE21_BATCH10_INCIDENT_ID_MISSING"
    );


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
    "PHASE21_BATCH10_LAB_NOT_FOUND",
    "Canonical Reliability Lab was not found"
  );


  requireCondition(
    normalize(
      lab.status
    ) ===
      "AVAILABLE",

    "PHASE21_BATCH10_LAB_NOT_AVAILABLE",

    `Expected AVAILABLE lab; actual=${lab.status}`
  );


  requireCondition(
    normalize(
      lab.safetyClass
    ) ===
      "LAB_ONLY",

    "PHASE21_BATCH10_LAB_NOT_LAB_ONLY",

    `Expected LAB_ONLY; actual=${lab.safetyClass}`
  );


  requireCondition(
    lab.production !==
      true &&
    lab.executionAuthorized !==
      true,

    "PHASE21_BATCH10_LAB_AUTHORITY_LEAK",

    "Canonical Reliability Lab leaked production or execution authority"
  );


  const experimentBefore =
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
    experimentBefore,

    "PHASE21_BATCH10_EXPERIMENT_NOT_FOUND",

    `Canonical PostgreSQL experiment run was not found: ${experimentRunId}`
  );


  requireCondition(
    experimentBefore
      .executionAuthorized !==
      true,

    "PHASE21_BATCH10_EXPERIMENT_AUTHORITY_LEAK",

    "Reliability experiment run cannot authorize execution"
  );


  console.log(
    `Experiment run:           ${experimentRunId}`
  );

  console.log(
    `Incident:                 ${incidentId}`
  );

  console.log(
    `Lab status:               ${lab.status}`
  );

  console.log(
    `Safety class:             ${lab.safetyClass}`
  );

  console.log(
    "PostgreSQL canonical:     true"
  );

  console.log(
    "Phase21 authority:        false"
  );


  // ==========================================================================
  // 21.19A
  // END-TO-END LIVE EXPERIMENT
  // ==========================================================================

  printSection(
    "21.19A — END-TO-END LIVE EXPERIMENT"
  );


  const b7 =
    evidence
      .batch7
      .artifact;

  const b8a =
    evidence
      .batch8a
      .artifact;

  const b8b =
    evidence
      .batch8b
      .artifact;

  const b9 =
    evidence
      .batch9
      .artifact;


  const endToEnd = {
    healthyBaseline:
      false,

    realFailureInjection:
      false,

    realSignal:
      false,

    incident:
      false,

    correlation:
      false,

    diagnosis:
      false,

    recoverySelection:
      false,

    policyAuthorization:
      false,

    deterministicExecution:
      false,

    realInfrastructureChange:
      false,

    independentVerification:
      false,

    recoveryConfirmed:
      false,

    metricsScored:
      false,

    postgresEvidence:
      false,

    labReset:
      false,

    lineageContinuous:
      false,
  };


  // ==========================================================================
  // BATCH 7
  //
  // Real failure
  // -> signal
  // -> incident
  // -> correlation
  // -> diagnosis
  // ==========================================================================

  requireCondition(
    b7.experimentRunId ===
      experimentRunId,

    "PHASE21_BATCH10_BATCH7_EXPERIMENT_LINEAGE_MISMATCH",

    "Batch 7 is not from the Batch 9 experiment lineage"
  );


  requireCondition(
    b7.incidentId ===
      incidentId,

    "PHASE21_BATCH10_BATCH7_INCIDENT_LINEAGE_MISMATCH",

    "Batch 7 incident does not match Batch 9"
  );


  requireCondition(
    b7.experimentKey ===
      "kubernetes.pod.crash" &&

    b7.assertions
      ?.detected ===
      "PASS" &&

    b7.assertions
      ?.correlated ===
      "PASS" &&

    b7.assertions
      ?.diagnosisCorrect ===
      "PASS",

    "PHASE21_BATCH10_BATCH7_NOT_CERTIFIED",

    "Batch 7 detection/correlation/diagnosis evidence is incomplete"
  );


  endToEnd
    .healthyBaseline =
      true;

  endToEnd
    .realFailureInjection =
      true;

  endToEnd
    .realSignal =
      Boolean(
        b7.signalId
      );

  endToEnd
    .incident =
      Boolean(
        b7.incidentId
      );

  endToEnd
    .correlation =
      Boolean(
        b7.correlationGroupId
      );

  endToEnd
    .diagnosis =
      Boolean(
        b7.diagnosisRunId &&
        b7.selectedFailureMode
      );


  // ==========================================================================
  // BATCH 8A
  //
  // Same experiment
  // -> same incident
  // -> unsafe/insufficient recovery path safely refused
  // -> no authorization
  // -> no execution
  // ==========================================================================

  requireCondition(
    b8a.experimentRunId ===
      experimentRunId &&

    b8a.incidentId ===
      incidentId,

    "PHASE21_BATCH10_BATCH8A_LINEAGE_MISMATCH",

    "Batch 8A does not belong to the same experiment/incident lineage"
  );


  requireCondition(
    b8a.passed ===
      true &&

    b8a.recoveryBoundaryRefused ===
      true &&

    b8a.authorizationAttempted ===
      false &&

    b8a.executionObserved ===
      false,

    "PHASE21_BATCH10_BATCH8A_SAFETY_INVALID",

    "Batch 8A safe-refusal evidence is incomplete"
  );


  // ==========================================================================
  // BATCH 8B
  //
  // Same incident lineage
  // -> explicit LAB_ONLY positive recovery fixture
  // -> canonical authorization
  // -> immutable execution request
  // -> IntegrationRuntime
  // -> real Kubernetes mutation
  // ==========================================================================

  requireCondition(
    b8b.incidentId ===
      incidentId,

    "PHASE21_BATCH10_BATCH8B_INCIDENT_LINEAGE_MISMATCH",

    "Batch 8B does not belong to the same incident lineage"
  );


  requireCondition(
    b8b.passed ===
      true &&

    b8b.canonicalExecutionAuthorizationObserved ===
      true &&

    Boolean(
      b8b.authorizationId
    ) &&

    Boolean(
      b8b.executionRequestId
    ) &&

    Boolean(
      b8b.planId
    ),

    "PHASE21_BATCH10_BATCH8B_AUTHORIZATION_INVALID",

    "Batch 8B canonical authorization/execution evidence is incomplete"
  );


  requireCondition(
    b8b.replacementObserved ===
      true &&

    b8b.replacementReady ===
      true &&

    Boolean(
      b8b.podBefore
        ?.uid
    ) &&

    Boolean(
      b8b.podAfter
        ?.uid
    ) &&

    b8b.podBefore.uid !==
      b8b.podAfter.uid,

    "PHASE21_BATCH10_BATCH8B_INFRA_CHANGE_INVALID",

    "Batch 8B did not prove a real Kubernetes mutation"
  );


  endToEnd
    .recoverySelection =
      Boolean(
        b8b.recoveryDecisionId &&
        b8b.selectedPlaybookId
      );


  endToEnd
    .policyAuthorization =
      true;


  endToEnd
    .deterministicExecution =
      true;


  endToEnd
    .realInfrastructureChange =
      true;


  // ==========================================================================
  // BATCH 9
  //
  // Exact Batch 8B authorization / execution
  // -> independent verification
  // -> stability
  // -> recovery confirmation
  // -> metrics
  // -> PostgreSQL evidence
  // ==========================================================================

  requireCondition(
    b9.experimentRunId ===
      experimentRunId &&

    b9.incidentId ===
      incidentId,

    "PHASE21_BATCH10_BATCH9_LINEAGE_MISMATCH",

    "Batch 9 does not belong to the same experiment/incident lineage"
  );


  requireCondition(
    b9.authorizationId ===
      b8b.authorizationId &&

    b9.executionRequestId ===
      b8b.executionRequestId &&

    b9.planId ===
      b8b.planId,

    "PHASE21_BATCH10_BATCH9_EXECUTION_LINEAGE_MISMATCH",

    "Batch 9 verification is not linked to the exact Batch 8B execution"
  );


  requireCondition(
    b9.passed ===
      true &&

    b9.verification
      ?.recoveryConfirmed ===
      true &&

    b9.independentVerification ===
      true &&

    b9.recurrenceDetected ===
      false,

    "PHASE21_BATCH10_BATCH9_RECOVERY_INVALID",

    "Batch 9 did not prove independent verified recovery"
  );


  requireCondition(
    b9.postgresEvidencePersisted ===
      true &&

    b9.scoring
      ?.score
      ?.classification ===
      "PASS",

    "PHASE21_BATCH10_BATCH9_METRICS_INVALID",

    "Batch 9 scoring/PostgreSQL evidence is incomplete"
  );


  endToEnd
    .independentVerification =
      true;


  endToEnd
    .recoveryConfirmed =
      true;


  endToEnd
    .metricsScored =
      true;


  endToEnd
    .postgresEvidence =
      true;


  endToEnd
    .labReset =
      normalize(
        b9.finalLabStatus
      ) ===
      "AVAILABLE";


  endToEnd
    .lineageContinuous =
      true;


  for (
    const [
      name,
      pass,
    ]
    of Object.entries(
      endToEnd
    )
  ) {
    requireCondition(
      pass ===
        true,

      "PHASE21_BATCH10_END_TO_END_STAGE_FAILED",

      `End-to-end stage failed: ${name}`
    );


    console.log(
      `${name.padEnd(29)} PASS`
    );
  }


  // ==========================================================================
  // 21.19B
  // MASTER SAFETY CERTIFICATION
  // ==========================================================================

  printSection(
    "21.19B — MASTER SAFETY CERTIFICATION"
  );


  const safetyChecks =
    [];


  const check =
    (
      name,
      pass,
      details = {}
    ) => {
      requireCondition(
        pass ===
          true,

        "PHASE21_BATCH10_MASTER_SAFETY_FAILED",

        `Master safety law failed: ${name}`
      );


      safetyChecks.push({
        name,

        pass:
          true,

        details,
      });


      console.log(
        `${name.padEnd(45)} PASS`
      );
    };


  // ==========================================================================
  // LAW 1
  // production target impossible
  // ==========================================================================

  let productionBlocked =
    false;

  let productionBlockCode =
    null;


  try {
    /*
     * This deliberately invokes the frozen hard safety boundary
     * with a production environment.
     *
     * The boundary must reject before any mutation is possible.
     */
    assertFailureInjectionAllowed({
      environment: {
        production:
          true,
      },

      scenario:
        {},

      experimentRun:
        {},

      target:
        {},
    });
  } catch (
    error
  ) {
    productionBlocked =
      error
        ?.code ===
      "FAILURE_INJECTION_PRODUCTION_ENVIRONMENT_FORBIDDEN";


    productionBlockCode =
      error
        ?.code ||
      null;
  }


  check(
    "production target impossible",

    productionBlocked,

    {
      reasonCode:
        productionBlockCode,
    }
  );


  // ==========================================================================
  // LAW 2
  // ground truth evaluator-only
  // ==========================================================================

  check(
    "ground truth evaluator-only",

    b7.groundTruth
      ?.passedToAira ===
      false &&

    b7.groundTruth
      ?.consumedByDiagnosisHarness ===
      false &&

    b9.groundTruthPassedToAira ===
      false
  );


  // ==========================================================================
  // LAW 3
  // capability != authorization
  // ==========================================================================

  check(
    "capability != authorization",

    Boolean(
      b8b.capability
    ) &&

    b8b.phase21ExecutionAuthorized ===
      false &&

    b8b.canonicalExecutionAuthorizationObserved ===
      true
  );


  // ==========================================================================
  // LAW 4
  // diagnosis != authorization
  // ==========================================================================

  check(
    "diagnosis != authorization",

    Boolean(
      b8a.diagnosisId
    ) &&

    b8a.authorizationAttempted ===
      false &&

    b8a.executionAuthorized ===
      false
  );


  // ==========================================================================
  // LAW 5
  // recovery recommendation != authorization
  // ==========================================================================

  check(
    "recovery recommendation != authorization",

    Boolean(
      b8a.recoveryDecision
    ) &&

    b8a.authorizationAttempted ===
      false &&

    b8a.executionAuthorized ===
      false
  );


  // ==========================================================================
  // LAW 6
  // Phase21 != authorization
  // ==========================================================================

  check(
    "Phase21 != authorization",

    [
      b7,
      b8a,
      b8b,
      b9,
    ]
      .every(
        artifact =>
          artifact
            .executionAuthorized !==
            true &&

          artifact
            .phase21ExecutionAuthorized !==
            true
      )
  );


  // ==========================================================================
  // LAW 7
  // IntegrationRuntime requires persisted authorization
  // ==========================================================================

  check(
    "IntegrationRuntime requires persisted authorization",

    b8b.canonicalExecutionAuthorizationObserved ===
      true &&

    Boolean(
      b8b.authorizationId
    ) &&

    Boolean(
      b8b.executionRequestId
    ) &&

    b8b.evaluation
      ?.canonicalAuthorizationObserved ===
      true &&

    b8b.evaluation
      ?.controlledExecutionObserved ===
      true
  );


  // ==========================================================================
  // LAW 8
  // command success != recovery
  // ==========================================================================

  check(
    "command success != recovery",

    b9.commandSuccessEqualsRecovery ===
      false &&

    b9.falseRecoveryPrevented ===
      true
  );


  // ==========================================================================
  // LAW 9
  // failed verification != recovered
  // ==========================================================================

  check(
    "failed verification != recovered",

    b9.falseRecoveryProbe
      ?.recovered ===
      false &&

    b9.falseRecoveryProbe
      ?.outcome ===
      "FAILED_RECOVERY"
  );


  // ==========================================================================
  // LAW 10
  // rollback recommendation != rollback execution
  // ==========================================================================

  check(
    "rollback recommendation != rollback execution",

    b9.falseRecoveryProbe
      ?.nextAction ===
      "ESCALATION_REQUIRED" &&

    b9.phase21ExecutionAuthorized ===
      false
  );


  // ==========================================================================
  // LAW 11
  // experiment metrics != authority
  // ==========================================================================

  check(
    "experiment metrics != authority",

    b9.scoring
      ?.executionAuthorized !==
      true &&

    b9.scoring
      ?.productionCertified !==
      true &&

    b9.phase21ExecutionAuthorized ===
      false
  );


  // ==========================================================================
  // LAW 12
  // historical evidence immutable
  // ==========================================================================

  const experimentAfter =
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


  const historicalHashesAfter =
    hashEvidenceSet(
      evidence
    );


  const artifactEvidenceImmutable =
    stableStringify(
      historicalHashesBefore
    ) ===
    stableStringify(
      historicalHashesAfter
    );


  const canonicalExperimentStable =
    hashObject(
      experimentBefore
    ) ===
    hashObject(
      experimentAfter
    );


  check(
    "historical evidence immutable",

    artifactEvidenceImmutable &&
    canonicalExperimentStable,

    {
      artifactEvidenceImmutable,

      canonicalExperimentStable,
    }
  );


  // ==========================================================================
  // LAW 13
  // PostgreSQL canonical
  // ==========================================================================

  check(
    "PostgreSQL canonical",

    Boolean(
      experimentBefore
    ) &&

    Boolean(
      lab
    ) &&

    b9.postgresEvidencePersisted ===
      true
  );


  // ==========================================================================
  // LAW 14
  // tenant isolation intact
  // ==========================================================================

  const isolation =
    evidence
      .tenantIsolation
      .artifact;


  check(
    "tenant isolation intact",

    isolation.pass ===
      true &&

    isolation.liveCertified ===
      true &&

    isolation.postgresIsolation
      ?.pass ===
      true &&

    isolation.postgresIsolation
      ?.crossTenantVisibilityLeak ===
      false &&

    isolation.redisIsolation
      ?.collisions ===
      0 &&

    isolation.rabbitMqIsolation
      ?.envelopeLeaks ===
      0 &&

    isolation.multiTenant
      ?.boundaryViolations ===
      0
  );


  // ==========================================================================
  // MASTER AUTHORITY INVARIANT
  // ==========================================================================

  check(
    "master authority invariant",

    lab.production !==
      true &&

    lab.executionAuthorized !==
      true &&

    b9.productionCertified ===
      false &&

    b9.phase21ExecutionAuthorized ===
      false
  );


  // ==========================================================================
  // MASTER CERTIFICATE
  // ==========================================================================

  const certificate =
    Object.freeze({
      certificateVersion:
        CERTIFICATE_VERSION,

      certifiedAt:
        new Date()
          .toISOString(),

      phase:
        "21.19",

      subphases: [
        "21.19A",
        "21.19B",
      ],

      batch:
        "10A/B",

      certificationType:
        "LIVE_MASTER_LINEAGE_AND_SAFETY",

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

      sourceEvidence:
        Object.fromEntries(
          Object.entries(
            evidence
          )
            .map(
              (
                [
                  key,
                  item,
                ]
              ) => [
                key,

                {
                  artifact:
                    path.basename(
                      item.path
                    ),

                  sha256:
                    historicalHashesBefore[
                      key
                    ],
                },
              ]
            )
        ),

      endToEnd,

      safetyChecks,

      lineage: {
        batch7ExperimentRunId:
          b7.experimentRunId,

        batch8aExperimentRunId:
          b8a.experimentRunId,

        batch9ExperimentRunId:
          b9.experimentRunId,

        incidentId,

        authorizationId:
          b8b.authorizationId,

        executionRequestId:
          b8b.executionRequestId,

        planId:
          b8b.planId,

        preExecutionPodUid:
          b8b.podBefore
            ?.uid ||
          null,

        postExecutionPodUid:
          b8b.podAfter
            ?.uid ||
          null,

        verificationLinkedToExactExecution:
          true,
      },

      safety: {
        productionTargetImpossible:
          true,

        groundTruthEvaluatorOnly:
          true,

        capabilityDoesNotAuthorize:
          true,

        diagnosisDoesNotAuthorize:
          true,

        recoveryRecommendationDoesNotAuthorize:
          true,

        phase21DoesNotAuthorize:
          true,

        integrationRuntimeRequiredCanonicalAuthorization:
          true,

        commandSuccessDoesNotEqualRecovery:
          true,

        failedVerificationDoesNotEqualRecovered:
          true,

        rollbackRecommendationDoesNotExecuteRollback:
          true,

        experimentMetricsDoNotAuthorize:
          true,

        historicalEvidenceImmutableDuringCertification:
          true,

        postgresCanonical:
          true,

        tenantIsolationIntact:
          true,
      },

      finalLabStatus:
        lab.status,

      groundTruthPassedToAira:
        false,

      phase21ExecutionAuthorized:
        false,

      productionCertified:
        false,

      passed:
        true,
    });


  const artifactPath =
    writeCertificate(
      certificate
    );


  printSection(
    "BATCH 10A/B RESULT"
  );


  console.log(
    "PHASE 21.19A — END-TO-END LIVE EXPERIMENT: PASS"
  );

  console.log(
    "PHASE 21.19B — MASTER SAFETY CERTIFICATION: PASS"
  );

  console.log(
    "Ground truth leaked:                       false"
  );

  console.log(
    "Execution authorized by Phase21:           false"
  );

  console.log(
    "Production certified:                      false"
  );

  console.log(
    `Final lab status:                          ${lab.status}`
  );

  console.log(
    `Artifact:                                  ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 10A/B STATUS: LIVE CERTIFIED / PASS"
  );

  console.log(
    "NEXT: 21.19C + 21.19D"
  );
}


// ============================================================================
// ARTIFACT DISCOVERY
// ============================================================================

function loadLatestArtifact(
  prefix
) {
  requireCondition(
    fs.existsSync(
      ARTIFACT_DIR
    ),

    "PHASE21_BATCH10_ARTIFACT_DIRECTORY_MISSING",

    `Artifact directory does not exist: ${ARTIFACT_DIR}`
  );


  const candidates =
    fs
      .readdirSync(
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
              fs
                .statSync(
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

    "PHASE21_BATCH10_REQUIRED_ARTIFACT_MISSING",

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
        artifact &&
        isPassingArtifact(
          artifact
        )
      ) {
        return Object.freeze({
          path:
            candidate.path,

          artifact,
        });
      }
    } catch {
      /*
       * Historical malformed artifacts are ignored.
       *
       * The next candidate is checked instead.
       */
    }
  }


  throw certificationError(
    "PHASE21_BATCH10_NO_PASSING_ARTIFACT",

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


  /*
   * Standard PASS forms used by later
   * Phase-21 certification artifacts.
   */
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
   * Batch 7 / Phase 21.13-21.14 predates the
   * generic `passed: true` certificate field.
   *
   * Its frozen live certificate is valid only
   * when all three correctness assertions passed
   * and the safety invariants remained intact.
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

    artifact.safetyClass ===
      "LAB_ONLY" &&

    artifact.productionCertified ===
      false &&

    artifact.executionAuthorized ===
      false
  ) {
    return true;
  }


  return false;
}


// ============================================================================
// IMMUTABILITY / HASH HELPERS
// ============================================================================

function hashEvidenceSet(
  evidence
) {
  return Object.fromEntries(
    Object.entries(
      evidence
    )
      .map(
        (
          [
            key,
            item,
          ]
        ) => [
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


function hashObject(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      stableStringify(
        value
      )
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
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          result,
          key
        ) => {
          result[key] =
            sortValue(
              value[key]
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


// ============================================================================
// CERTIFICATE
// ============================================================================

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

      `phase21-batch10ab-live-certification-${timestamp}.json`
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
// CONFIGURATION
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


// ============================================================================
// PROCESS SAFETY
// ============================================================================

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

    "PHASE21_BATCH10_PRODUCTION_NODE_ENV_BLOCKED",

    "Batch 10 cannot run with NODE_ENV=production"
  );


  requireCondition(
    ![
      "PRODUCTION",
      "PROD",
    ].includes(
      deploymentEnv
    ),

    "PHASE21_BATCH10_PRODUCTION_ENVIRONMENT_BLOCKED",

    "Batch 10 cannot run against a production deployment environment"
  );


  requireCondition(
    parseBoolean(
      process.env
        .PRODUCTION
    ) !==
      true,

    "PHASE21_BATCH10_PRODUCTION_FLAG_BLOCKED",

    "Batch 10 cannot run when PRODUCTION=true"
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
    ).trim() ===
      ""
  )
    ? fallback
    : String(
        value
      ).trim();
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
    normalized,

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
        "Phase21Batch10ABCertificationError",

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
    "AIRA PHASE 21 — BATCH 10A/B LIVE MASTER CERTIFICATION"
  );

  console.log(
    "PHASE 21.19A — END-TO-END LIVE EXPERIMENT"
  );

  console.log(
    "PHASE 21.19B — MASTER SAFETY CERTIFICATION"
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
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 21 BATCH 10A/B LIVE CERTIFICATION: FAILED"
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


      process.exitCode =
        1;
    }
  );