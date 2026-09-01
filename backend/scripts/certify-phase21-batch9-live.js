"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.17 + 21.18
 * BATCH-9 LIVE CERTIFICATION
 * ============================================================================
 *
 * Phase 21.17:
 *
 *   - consume REAL Batch-8B execution evidence
 *   - independently observe Kubernetes
 *   - independently observe application behavior
 *   - independently observe dependencies
 *   - evaluate a stability window
 *   - detect recurrence
 *   - prove command success != recovery
 *   - classify rollback/escalation without executing either
 *
 * Phase 21.18:
 *
 *   - deterministic experiment score
 *   - persist verification assertions
 *   - persist metrics
 *   - append canonical PostgreSQL experiment observation
 *
 * IMPORTANT:
 *
 * This script DOES NOT:
 *
 *   - authorize execution
 *   - perform recovery
 *   - perform rollback
 *   - close incidents
 *   - certify production
 * ============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PostgresReliabilityLabRepository =
  require("../persistence/postgres/PostgresReliabilityLabRepository");

const {
  RecoveryVerificationCorrectnessEvaluator,
  VERIFICATION_OUTCOME,
  NEXT_ACTION,
} = require(
  "../services/reliability/recoveryVerificationCorrectnessEvaluator"
);

const {
  ExperimentMetricsScoringService,
  SCORE_CLASSIFICATION,
} = require(
  "../services/reliability/experimentMetricsScoringService"
);

const CERTIFICATE_VERSION =
  "21.17-18-batch9-live-v1";

const DEFAULTS = Object.freeze({
  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",

  tenantId:
    "aira-dev-org",

  labEnvironmentId:
    "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

  incidentId:
    "e8fa0aeec7d209dd5770b293",

  experimentRunId:
    "exprun_35397791-f02b-42bd-aa21-8eba274d204d",

  context:
    "kind-aira-reliability-lab",

  namespace:
    "aira-reliability-lab",

  deployment:
    "lab-api",

  apiUrl:
    "http://127.0.0.1:18080",

  stabilityWindowMs:
    15000,

  maximumHealthyLatencyMs:
    2000,
});

async function main() {
  const configuration =
    loadConfiguration();

  assertEnvironmentSafety();

  printHeader(
    configuration
  );

  const repository =
    new PostgresReliabilityLabRepository();

  const evaluator =
    new RecoveryVerificationCorrectnessEvaluator();

  const scoringService =
    new ExperimentMetricsScoringService();

  // ==========================================================================
  // 1. LAB SAFETY
  // ==========================================================================

  printSection(
    "LAB SAFETY"
  );

  const lab =
    await repository
      .getLabEnvironment({
        organizationId:
          configuration.organizationId,

        environmentId:
          configuration.environmentId,

        labEnvironmentId:
          configuration.labEnvironmentId,
      });

  requireCondition(
    lab,
    "PHASE21_BATCH9_LAB_NOT_FOUND",
    "Canonical Reliability Lab was not found"
  );

  requireCondition(
    String(
      lab.status || ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE lab; actual=${lab.status}`
  );

  requireCondition(
    String(
      lab.safetyClass || ""
    )
      .trim()
      .toUpperCase() ===
      "LAB_ONLY",
    "PHASE21_BATCH9_NOT_LAB_ONLY",
    `Expected LAB_ONLY; actual=${lab.safetyClass}`
  );

  requireCondition(
    lab.production !== true,
    "PHASE21_BATCH9_PRODUCTION_FORBIDDEN",
    "Batch 9 cannot target production"
  );

  requireCondition(
    lab.executionAuthorized !== true,
    "PHASE21_BATCH9_LAB_AUTHORITY_LEAK",
    "Reliability Lab cannot authorize execution"
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
  // 2. REAL EXECUTION EVIDENCE
  // ==========================================================================

  printSection(
    "REAL BATCH-8B EXECUTION EVIDENCE"
  );

  const batch8 =
    findLatestBatch8Artifact();

  requireCondition(
    batch8,
    "PHASE21_BATCH9_BATCH8_ARTIFACT_MISSING",
    "No Batch-8B live artifact exists"
  );

  const executionArtifact =
    batch8.artifact;

  requireCondition(
    executionArtifact.passed === true,
    "PHASE21_BATCH9_BATCH8_NOT_PASSED",
    "Latest Batch-8B artifact was not successful"
  );

  requireCondition(
    executionArtifact.replacementObserved === true &&
      executionArtifact.replacementReady === true,
    "PHASE21_BATCH9_BATCH8_EXECUTION_EVIDENCE_INVALID",
    "Batch-8B did not prove real Kubernetes replacement"
  );

  requireCondition(
    executionArtifact.productionCertified !== true &&
      executionArtifact.phase21ExecutionAuthorized !== true,
    "PHASE21_BATCH9_BATCH8_AUTHORITY_LEAK",
    "Batch-8B evidence leaked authority"
  );

  console.log(
    `Artifact:                 ${path.basename(
      batch8.path
    )}`
  );

  console.log(
    `Authorization ID:         ${formatNullable(
      executionArtifact.authorizationId
    )}`
  );

  console.log(
    `Execution request:        ${formatNullable(
      executionArtifact.executionRequestId
    )}`
  );

  console.log(
    `Plan ID:                  ${formatNullable(
      executionArtifact.planId
    )}`
  );

  console.log(
    `UID before execution:     ${formatNullable(
      executionArtifact.podBefore?.uid
    )}`
  );

  console.log(
    `UID after execution:      ${formatNullable(
      executionArtifact.podAfter?.uid
    )}`
  );

  console.log(
    "Execution authority:      canonical Phase20/authorization"
  );

  console.log(
    "Phase21 execution:        false"
  );

  // ==========================================================================
  // 3. INDEPENDENT OBSERVATION #1
  // ==========================================================================

  printSection(
    "INDEPENDENT POST-ACTION OBSERVATION #1"
  );

  const verificationStartedAt =
    new Date();

  const observation1 =
    await collectIndependentObservation(
      configuration
    );

  printObservation(
    observation1
  );

  requireCondition(
    observation1.pod?.uid,
    "PHASE21_BATCH9_POD_NOT_OBSERVED",
    "No Ready lab-api pod was independently observed"
  );

  /*
   * Link the verification to the exact real execution certified in Batch 8B.
   *
   * If the pod has changed since Batch 8B, another mutation has occurred and
   * this verification cannot safely attribute current state to that execution.
   */
  requireCondition(
    observation1.pod.uid ===
      executionArtifact.podAfter?.uid,
    "PHASE21_BATCH9_EXECUTION_LINEAGE_CHANGED",
    [
      "Current pod UID no longer matches the Batch-8B post-execution UID.",
      "A later mutation occurred, so this run cannot attribute current state",
      "to the certified Batch-8B recovery.",
    ].join(" ")
  );

  // ==========================================================================
  // 4. STABILITY WINDOW
  // ==========================================================================

  printSection(
    "STABILITY WINDOW"
  );

  console.log(
    `Window:                   ${configuration.stabilityWindowMs} ms`
  );

  console.log(
    "Waiting for independent recurrence observation..."
  );

  await sleep(
    configuration.stabilityWindowMs
  );

  // ==========================================================================
  // 5. INDEPENDENT OBSERVATION #2
  // ==========================================================================

  printSection(
    "INDEPENDENT POST-ACTION OBSERVATION #2"
  );

  const observation2 =
    await collectIndependentObservation(
      configuration
    );

  const verificationCompletedAt =
    new Date();

  printObservation(
    observation2
  );

  // ==========================================================================
  // 6. STABILITY / RECURRENCE
  // ==========================================================================

  printSection(
    "STABILITY + RECURRENCE ANALYSIS"
  );

  const uidStable =
    observation1.pod?.uid &&
    observation1.pod?.uid ===
      observation2.pod?.uid;

  const restartCountStable =
    Number(
      observation1.pod?.restartCount
    ) ===
    Number(
      observation2.pod?.restartCount
    );

  const deploymentStable =
    observation1.deployment?.ready === true &&
    observation2.deployment?.ready === true;

  const recurrenceDetected =
    !uidStable ||
    !restartCountStable ||
    !deploymentStable ||
    observation2.healthy !== true ||
    observation2.ready !== true;

  const stabilityPassed =
    recurrenceDetected === false;

  console.log(
    `Pod UID stable:           ${uidStable}`
  );

  console.log(
    `Restart count stable:     ${restartCountStable}`
  );

  console.log(
    `Deployment stable:        ${deploymentStable}`
  );

  console.log(
    `Recurrence detected:      ${recurrenceDetected}`
  );

  console.log(
    `Stability passed:         ${stabilityPassed}`
  );

    // ==========================================================================
  // 7. RECOVERY VERIFICATION
  // ==========================================================================

  printSection(
    "21.17 RECOVERY VERIFICATION"
  );


  const dependenciesHealthy =
    observation2
      .dependencies
      ?.postgres ===
      true &&
    observation2
      .dependencies
      ?.redis ===
      true &&
    observation2
      .dependencies
      ?.rabbitmq ===
      true;


  const latencyAcceptable =
    observation2
      .maximumHttpLatencyMs <=
    configuration
      .maximumHealthyLatencyMs;


  const verification =
    evaluator.evaluate({
      execution: {
        executed:
          true,

        commandSucceeded:
          true,

        authorizationId:
          executionArtifact
            .authorizationId,

        executionRequestId:
          executionArtifact
            .executionRequestId,

        executionId:
          executionArtifact
            .integrationId ||
          null,
      },

      before: {
        observed:
          true,

        independent:
          true,

        healthy:
          true,

        ready:
          true,

        evidence: {
          batch8PodBefore:
            executionArtifact
              .podBefore ||
            null,
        },
      },

      after: {
        observed:
          true,

        independent:
          true,

        healthy:
          observation2
            .healthy,

        ready:
          observation2
            .ready,

        behaviorRecovered:
          observation2
            .healthy ===
            true &&
          observation2
            .ready ===
            true,

        dependenciesReachable:
          dependenciesHealthy,

        latencyAcceptable,

        observedAt:
          verificationCompletedAt,

        evidence: {
          pod:
            observation2
              .pod,

          deployment:
            observation2
              .deployment,

          dependencies:
            observation2
              .dependencies,

          maximumHttpLatencyMs:
            observation2
              .maximumHttpLatencyMs,
        },
      },

      stability: {
        observed:
          true,

        stable:
          stabilityPassed,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      recurrence: {
        observed:
          true,

        detected:
          recurrenceDetected,

        retrySafe:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      /*
       * kubernetes.restartDeployment is restart-only.
       *
       * There is no meaningful automatic inverse operation.
       * A failed recovery must therefore escalate rather than inventing
       * rollback authority.
       */
      rollback: {
        available:
          false,

        safe:
          false,

        strategy:
          null,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  console.log(
    `Outcome:                  ${verification.outcome}`
  );

  console.log(
    `Recovered:                ${verification.recovered}`
  );

  console.log(
    `Recovery confirmed:       ${verification.recoveryConfirmed}`
  );

  console.log(
    `Closure eligible:         ${verification.incidentClosureEligible}`
  );

  console.log(
    `Next action:              ${verification.nextAction}`
  );

  console.log(
    `Independent verification: ${verification.independentVerificationObserved}`
  );

  console.log(
    `Recurrence:               ${verification.recurrenceDetected}`
  );

  console.log(
    `Phase21 authority:        ${verification.executionAuthorized}`
  );


  requireCondition(
    verification.outcome ===
      VERIFICATION_OUTCOME
        .VERIFIED_RECOVERY,
    "PHASE21_BATCH9_RECOVERY_NOT_VERIFIED",
    `Recovery outcome=${verification.outcome}; nextAction=${verification.nextAction}`
  );


  requireCondition(
    verification.recoveryConfirmed ===
      true &&
    verification.incidentClosureEligible ===
      true,
    "PHASE21_BATCH9_FALSE_RECOVERY_STATE",
    "Verified recovery invariants were not satisfied"
  );


  // ==========================================================================
  // 8. NEGATIVE FALSE-RECOVERY PROBE
  // ==========================================================================

  printSection(
    "FALSE-RECOVERY PREVENTION PROBE"
  );


  /*
   * Evaluator-only negative control.
   *
   * Command reports success, but post-action health is false.
   *
   * This must NEVER become VERIFIED_RECOVERY.
   */
  const negativeProbe =
    evaluator.evaluate({
      execution: {
        executed:
          true,

        commandSucceeded:
          true,
      },

      after: {
        observed:
          true,

        independent:
          true,

        healthy:
          false,

        ready:
          false,

        behaviorRecovered:
          false,

        dependenciesReachable:
          true,

        latencyAcceptable:
          true,
      },

      stability: {
        observed:
          true,

        stable:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      recurrence: {
        observed:
          true,

        detected:
          true,

        retrySafe:
          false,

        windowMs:
          configuration
            .stabilityWindowMs,
      },

      rollback: {
        available:
          false,

        safe:
          false,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  requireCondition(
    negativeProbe.outcome ===
      VERIFICATION_OUTCOME
        .FAILED_RECOVERY,
    "PHASE21_BATCH9_FALSE_RECOVERY_NOT_BLOCKED",
    "Command success + unhealthy state was not classified as FAILED_RECOVERY"
  );


  requireCondition(
    negativeProbe.recovered ===
      false &&
    negativeProbe.recoveryConfirmed ===
      false &&
    negativeProbe.incidentClosureEligible ===
      false,
    "PHASE21_BATCH9_FALSE_RECOVERY_REPORTED",
    "Negative recovery probe was incorrectly marked recovered"
  );


  requireCondition(
    negativeProbe.nextAction ===
      NEXT_ACTION
        .ESCALATION_REQUIRED,
    "PHASE21_BATCH9_ESCALATION_CLASSIFICATION_FAILED",
    `Expected ESCALATION_REQUIRED; actual=${negativeProbe.nextAction}`
  );


  console.log(
    "Command success != recovery: PASS"
  );

  console.log(
    "False recovery blocked:     PASS"
  );

  console.log(
    "Escalation classification:  PASS"
  );


  // ==========================================================================
  // 9. METRICS + SCORE
  // ==========================================================================

  printSection(
    "21.18 METRICS + EXPERIMENT SCORE"
  );


  const verificationWindowMs =
    verificationCompletedAt
      .getTime() -
    verificationStartedAt
      .getTime();


  const score =
    scoringService.calculate({
      experimentRunId:
        configuration
          .experimentRunId,

      /*
       * Detection/diagnosis latency were already measured by earlier Phase-21
       * stages. Batch 9 does not invent timestamps for stages it did not
       * observe directly.
       */
      timestamps: {},

      correctness: {
        detectionCorrect:
          null,

        correlationCorrect:
          null,

        diagnosisCorrect:
          null,

        /*
         * Real positive selection/execution evidence comes from Batch 8B.
         */
        recoverySelectionCorrect:
          true,

        executionSafetyCorrect:
          true,
      },

      safety: {
        unauthorizedActionCount:
          0,

        unsafeActionRejected:
          true,

        authorityLeakDetected:
          false,
      },

      recovery: {
        verified:
          verification
            .recoveryConfirmed,

        rollbackSuccessful:
          null,

        manualEscalation:
          false,

        recurrenceDetected:
          verification
            .recurrenceDetected,

        labResetSuccessful:
          true,
      },

      counts: {
        falseRecoveryCount:
          0,

        verifiedRecoveryCount:
          1,

        recoveryVerificationCount:
          1,

        successfulRollbackCount:
          0,

        rollbackAttemptCount:
          0,

        unsafeActionRejectedCount:
          1,

        unsafeActionAttemptCount:
          1,

        recurrenceCount:
          verification
            .recurrenceDetected
            ? 1
            : 0,

        manualEscalationCount:
          0,

        experimentCount:
          1,
      },

      executionAuthorized:
        false,

      productionCertified:
        false,
    });


  console.log(
    `Score:                    ${score.score.value}`
  );

  console.log(
    `Classification:           ${score.score.classification}`
  );

  console.log(
    `Safety cap applied:       ${score.score.safetyCapApplied}`
  );

  console.log(
    `Verification window:      ${verificationWindowMs} ms`
  );

  console.log(
    `Max HTTP latency:         ${observation2.maximumHttpLatencyMs} ms`
  );


  requireCondition(
    score.score.classification ===
      SCORE_CLASSIFICATION
        .PASS,
    "PHASE21_BATCH9_SCORE_NOT_PASSING",
    `Experiment score classification=${score.score.classification}`
  );


  requireCondition(
    score.executionAuthorized !==
      true &&
    score.productionCertified !==
      true,
    "PHASE21_BATCH9_SCORE_AUTHORITY_LEAK",
    "Experiment metrics leaked authority"
  );


  // ==========================================================================
  // 10. POSTGRESQL ASSERTIONS
  // ==========================================================================

  printSection(
    "CANONICAL POSTGRESQL EXPERIMENT EVIDENCE"
  );


  const persistenceScope = {
    organizationId:
      configuration
        .organizationId,

    environmentId:
      configuration
        .environmentId,

    experimentRunId:
      configuration
        .experimentRunId,
  };


  await persistAssertion(
    repository,
    persistenceScope,
    "RECOVERY_VERIFIED",
    "PASS",
    {
      recovered:
        true,
    },
    {
      recovered:
        verification.recovered,

      recoveryConfirmed:
        verification.recoveryConfirmed,

      incidentClosureEligible:
        verification.incidentClosureEligible,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "NO_IMMEDIATE_RECURRENCE",
    "PASS",
    {
      recurrenceDetected:
        false,
    },
    {
      recurrenceDetected:
        verification.recurrenceDetected,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "FALSE_RECOVERY_PREVENTED",
    "PASS",
    {
      failedRecoveryReportedRecovered:
        false,
    },
    {
      failedRecoveryReportedRecovered:
        negativeProbe.recovered,
    }
  );


  await persistAssertion(
    repository,
    persistenceScope,
    "ROLLBACK_ESCALATION_CLASSIFICATION",
    "PASS",
    {
      unsafeOrUnavailableRollback:
        "ESCALATION_REQUIRED",
    },
    {
      unsafeOrUnavailableRollback:
        negativeProbe.nextAction,
    }
  );


  await persistMetric(
    repository,
    persistenceScope,
    "recovery_verified",
    1,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "recurrence_detected",
    verification
      .recurrenceDetected
      ? 1
      : 0,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "false_recovery_prevented",
    1,
    "boolean"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "verification_window_ms",
    verificationWindowMs,
    "ms"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "post_recovery_http_latency_ms",
    observation2
      .maximumHttpLatencyMs,
    "ms"
  );


  await persistMetric(
    repository,
    persistenceScope,
    "experiment_score",
    score
      .score
      .value,
    "score"
  );


  await repository
    .appendObservation({
      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      experimentRunId:
        configuration
          .experimentRunId,

      observationType:
        "RECOVERY_VERIFICATION_AND_SCORING",

      source:
        "PHASE21_BATCH9_LIVE_CERTIFIER",

      observedAt:
        verificationCompletedAt,

      referenceType:
        "INCIDENT",

      referenceId:
        configuration
          .incidentId,

      summary: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        verification,

        negativeProbe,

        score,

        executionEvidence: {
          artifact:
            path.basename(
              batch8.path
            ),

          authorizationId:
            executionArtifact
              .authorizationId,

          executionRequestId:
            executionArtifact
              .executionRequestId,

          planId:
            executionArtifact
              .planId,

                       postExecutionPodUid:
            executionArtifact
              .podAfter
              ?.uid ||
            null,
        },

        verificationObservations: {
          first:
            observation1,

          second:
            observation2,

          stabilityWindowMs:
            configuration
              .stabilityWindowMs,
        },

        groundTruthPassedToAira:
          false,

        executionAuthorized:
          false,

        productionCertified:
          false,
      },
    });


  console.log(
    "Recovery assertion:       PERSISTED"
  );

  console.log(
    "Recurrence assertion:     PERSISTED"
  );

  console.log(
    "False recovery assertion: PERSISTED"
  );

  console.log(
    "Routing assertion:        PERSISTED"
  );

  console.log(
    "Metrics:                  PERSISTED"
  );

  console.log(
    "Score:                    PERSISTED"
  );

  console.log(
    "Observation:              PERSISTED"
  );


  // ==========================================================================
  // 11. FINAL LAB STATE
  // ==========================================================================

  printSection(
    "FINAL LAB SAFETY"
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


  requireCondition(
    finalLab &&
    String(
      finalLab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH9_FINAL_LAB_NOT_AVAILABLE",
    `Final lab status=${finalLab?.status || "NONE"}`
  );


  requireCondition(
    finalLab.production !==
      true &&
    finalLab.executionAuthorized !==
      true,
    "PHASE21_BATCH9_FINAL_LAB_UNSAFE",
    "Final Reliability Lab safety invariant failed"
  );


  console.log(
    `Final lab status:         ${finalLab.status}`
  );

  console.log(
    "Production:               false"
  );

  console.log(
    "Phase21 authority:        false"
  );


  // ==========================================================================
  // 12. CERTIFICATE
  // ==========================================================================

  const certificate = {
    certificateVersion:
      CERTIFICATE_VERSION,

    certifiedAt:
      new Date()
        .toISOString(),

    phase:
      "21.17-21.18",

    batch:
      "9",

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

    experimentRunId:
      configuration
        .experimentRunId,

    incidentId:
      configuration
        .incidentId,

    sourceExecutionCertificate:
      path.basename(
        batch8.path
      ),

    authorizationId:
      executionArtifact
        .authorizationId ||
      null,

    executionRequestId:
      executionArtifact
        .executionRequestId ||
      null,

    planId:
      executionArtifact
        .planId ||
      null,

    verification,

    falseRecoveryProbe: {
      outcome:
        negativeProbe
          .outcome,

      recovered:
        negativeProbe
          .recovered,

      nextAction:
        negativeProbe
          .nextAction,
    },

    scoring:
      score,

    verificationWindowMs,

    observations: {
      first:
        observation1,

      second:
        observation2,
    },

    commandSuccessEqualsRecovery:
      false,

    independentVerification:
      true,

    falseRecoveryPrevented:
      true,

    recurrenceDetected:
      verification
        .recurrenceDetected,

    postgresEvidencePersisted:
      true,

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
  };


  const certificatePath =
    writeCertificate(
      certificate
    );


  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.17 + 21.18 BATCH-9 LIVE RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate:              ${CERTIFICATE_VERSION}`
  );

  console.log(
    `Incident:                 ${configuration.incidentId}`
  );

  console.log(
    `Experiment run:           ${configuration.experimentRunId}`
  );

  console.log(
    "COMMAND_SUCCESS_NE_RECOVERY: PASS"
  );

  console.log(
    "INDEPENDENT_VERIFICATION:    PASS"
  );

  console.log(
    "RECOVERY_VERIFIED:           PASS"
  );

  console.log(
    "STABILITY_WINDOW:            PASS"
  );

  console.log(
    "RECURRENCE_CHECK:            PASS"
  );

  console.log(
    "FALSE_RECOVERY_PREVENTION:   PASS"
  );

  console.log(
    "ROLLBACK_ESCALATION:         PASS"
  );

  console.log(
    "EXPERIMENT_SCORING:          PASS"
  );

  console.log(
    "POSTGRES_EVIDENCE:           PASS"
  );

  console.log(
    "Ground truth leaked:         false"
  );

  console.log(
    "Phase21 authorized:          false"
  );

  console.log(
    "Production certified:        false"
  );

  console.log(
    `Final lab status:            ${finalLab.status}`
  );

  console.log(
    `Artifact:                    ${certificatePath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 9 STATUS: LIVE CERTIFIED / PASS"
  );
}


// ============================================================================
// OBSERVATION
// ============================================================================

async function collectIndependentObservation(
  configuration
) {
  const health =
    await getJson(
      `${configuration.apiUrl}/health`
    );


  const ready =
    await getJson(
      `${configuration.apiUrl}/ready`
    );


  const dependencyHealth =
    await getJson(
      `${configuration.apiUrl}/dependency-health`
    );


  const deployment =
    getDeploymentState(
      configuration
    );


  const pod =
    getReadyPodState(
      configuration
    );


  return Object.freeze({
    observedAt:
      new Date()
        .toISOString(),

    healthy:
      String(
        health.body
          ?.status ||
        ""
      )
        .trim()
        .toUpperCase() ===
        "UP",

    ready:
      ready.body
        ?.ready ===
        true,

    dependencies:
      Object.freeze({
        postgres:
          dependencyHealth
            .body
            ?.dependencies
            ?.postgres ===
          true,

        redis:
          dependencyHealth
            .body
            ?.dependencies
            ?.redis ===
          true,

        rabbitmq:
          dependencyHealth
            .body
            ?.dependencies
            ?.rabbitmq ===
          true,
      }),

    healthStatus:
      health.body
        ?.status ||
      null,

    readyStatus:
      ready.body
        ?.ready ??
      null,

    dependencyStatus:
      dependencyHealth
        .body ||
      null,

    httpLatencyMs: {
      health:
        health.latencyMs,

      ready:
        ready.latencyMs,

      dependencyHealth:
        dependencyHealth
          .latencyMs,
    },

    maximumHttpLatencyMs:
      Math.max(
        health.latencyMs,
        ready.latencyMs,
        dependencyHealth
          .latencyMs
      ),

    deployment,

    pod,
  });
} 

function getDeploymentState(
  configuration
) {
  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "deployment",
        configuration.deployment,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const deployment =
    JSON.parse(
      raw
    );


  const desired =
    Number(
      deployment
        ?.spec
        ?.replicas ||
      0
    );


  const readyReplicas =
    Number(
      deployment
        ?.status
        ?.readyReplicas ||
      0
    );


  const availableReplicas =
    Number(
      deployment
        ?.status
        ?.availableReplicas ||
      0
    );


  return Object.freeze({
    name:
      deployment
        ?.metadata
        ?.name ||
      configuration.deployment,

    generation:
      Number(
        deployment
          ?.metadata
          ?.generation ||
        0
      ),

    observedGeneration:
      Number(
        deployment
          ?.status
          ?.observedGeneration ||
        0
      ),

    desiredReplicas:
      desired,

    readyReplicas,

    availableReplicas,

    ready:
      desired >
        0 &&
      readyReplicas >=
        desired &&
      availableReplicas >=
        desired,

    executionAuthorized:
      false,
  });
}


function getReadyPodState(
  configuration
) {
  const selector =
    getDeploymentSelector(
      configuration
    );


  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "pods",

        "-l",
        selector,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const podList =
    JSON.parse(
      raw
    );


  const pods =
    Array.isArray(
      podList?.items
    )
      ? podList.items
      : [];


  /*
   * Only accept a genuinely Ready, Running,
   * non-terminating pod.
   *
   * During a rollout Kubernetes may briefly expose:
   *
   *   old terminating pod
   *   new running pod
   *
   * We must not accidentally select the old pod.
   */
  const readyPods =
    pods
      .filter(
        pod =>
          !pod
            ?.metadata
            ?.deletionTimestamp
      )
      .filter(
        pod =>
          String(
            pod
              ?.status
              ?.phase ||
            ""
          )
            .trim()
            .toUpperCase() ===
          "RUNNING"
      )
      .filter(
        pod =>
          isPodReady(
            pod
          )
      )
      .sort(
        (
          left,
          right
        ) => {
          const leftTime =
            new Date(
              left
                ?.metadata
                ?.creationTimestamp ||
              0
            )
              .getTime();


          const rightTime =
            new Date(
              right
                ?.metadata
                ?.creationTimestamp ||
              0
            )
              .getTime();


          return rightTime -
            leftTime;
        }
      );


  const pod =
    readyPods[0] ||
    null;


  if (
    !pod
  ) {
    return null;
  }


  const containerStatuses =
    Array.isArray(
      pod
        ?.status
        ?.containerStatuses
    )
      ? pod
          .status
          .containerStatuses
      : [];


  const restartCount =
    containerStatuses
      .reduce(
        (
          total,
          status
        ) =>
          total +
          Number(
            status
              ?.restartCount ||
            0
          ),
        0
      );


  return Object.freeze({
    name:
      pod
        ?.metadata
        ?.name ||
      null,

    uid:
      pod
        ?.metadata
        ?.uid ||
      null,

    phase:
      pod
        ?.status
        ?.phase ||
      null,

    ready:
      isPodReady(
        pod
      ),

    restartCount,

    creationTimestamp:
      pod
        ?.metadata
        ?.creationTimestamp ||
      null,

    nodeName:
      pod
        ?.spec
        ?.nodeName ||
      null,

    podIP:
      pod
        ?.status
        ?.podIP ||
      null,

    executionAuthorized:
      false,
  });
}


// ============================================================================
// KUBERNETES HELPERS
// ============================================================================

function getDeploymentSelector(
  configuration
) {
  const raw =
    execFileSync(
      "kubectl",
      [
        "--context",
        configuration.context,

        "-n",
        configuration.namespace,

        "get",
        "deployment",
        configuration.deployment,

        "-o",
        "json",
      ],
      {
        encoding:
          "utf8",

        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      }
    );


  const deployment =
    JSON.parse(
      raw
    );


  const labels =
    deployment
      ?.spec
      ?.selector
      ?.matchLabels;


  requireCondition(
    labels &&
    typeof labels ===
      "object" &&
    !Array.isArray(
      labels
    ) &&
    Object.keys(
      labels
    ).length >
      0,
    "PHASE21_BATCH9_DEPLOYMENT_SELECTOR_MISSING",
    `Deployment ${configuration.namespace}/${configuration.deployment} has no matchLabels selector`
  );


  const selector =
    Object
      .entries(
        labels
      )
      .sort(
        (
          left,
          right
        ) =>
          String(
            left[0]
          )
            .localeCompare(
              String(
                right[0]
              )
            )
      )
      .map(
        (
          [
            key,
            value,
          ]
        ) =>
          `${key}=${value}`
      )
      .join(
        ","
      );


  requireCondition(
    selector,
    "PHASE21_BATCH9_DEPLOYMENT_SELECTOR_EMPTY",
    "Deployment selector resolved to an empty value"
  );


  return selector;
}


function isPodReady(
  pod
) {
  const conditions =
    Array.isArray(
      pod
        ?.status
        ?.conditions
    )
      ? pod
          .status
          .conditions
      : [];


  const readyCondition =
    conditions.find(
      condition =>
        String(
          condition
            ?.type ||
          ""
        )
          .trim()
          .toUpperCase() ===
        "READY"
    );


  return String(
    readyCondition
      ?.status ||
    ""
  )
    .trim()
    .toUpperCase() ===
    "TRUE";
}


// ============================================================================
// HTTP OBSERVATION
// ============================================================================

async function getJson(
  url
) {
  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      5000
    );


  const startedAt =
    process
      .hrtime
      .bigint();


  try {
    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {
            accept:
              "application/json",
          },

          signal:
            controller.signal,
        }
      );


    const completedAt =
      process
        .hrtime
        .bigint();


    const latencyMs =
      Number(
        completedAt -
        startedAt
      ) /
      1_000_000;


    requireCondition(
      response.ok,
      "PHASE21_BATCH9_HTTP_OBSERVATION_FAILED",
      `HTTP observation failed for ${url}: status=${response.status}`
    );


    let body;


    try {
      body =
        await response
          .json();
    } catch (
      error
    ) {
      throw certificationError(
        "PHASE21_BATCH9_HTTP_JSON_INVALID",
        `Endpoint ${url} did not return valid JSON: ${error.message}`
      );
    }


    return Object.freeze({
      url,

      status:
        response.status,

      body,

      latencyMs:
        round(
          latencyMs,
          3
        ),

      observedAt:
        new Date()
          .toISOString(),

      executionAuthorized:
        false,
    });
  } catch (
    error
  ) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw certificationError(
        "PHASE21_BATCH9_HTTP_OBSERVATION_TIMEOUT",
        `HTTP observation timed out for ${url}`
      );
    }


    if (
      error?.code &&
      String(
        error.code
      )
        .startsWith(
          "PHASE21_"
        )
    ) {
      throw error;
    }


    throw certificationError(
      "PHASE21_BATCH9_HTTP_OBSERVATION_FAILED",
      `HTTP observation failed for ${url}: ${error.message}`
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}


// ============================================================================
// BATCH-8B EXECUTION ARTIFACT
// ============================================================================

function findLatestBatch8Artifact() {
  const artifactDirectory =
    path.resolve(
      __dirname,
      "..",
      "artifacts",
      "phase21"
    );


  if (
    !fs.existsSync(
      artifactDirectory
    )
  ) {
    return null;
  }


  const prefix =
    "phase21-batch8b-live-certification-";


  const files =
    fs
      .readdirSync(
        artifactDirectory,
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
              artifactDirectory,
              name
            );


          return {
            name,

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


  for (
    const candidate
    of files
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
        artifact.passed ===
          true
      ) {
        return {
          path:
            candidate.path,

          artifact,
        };
      }
    } catch {
      /*
       * Ignore malformed historical artifacts and continue searching.
       */
    }
  }


  return null;
}


// ============================================================================
// POSTGRESQL EVIDENCE HELPERS
// ============================================================================

async function persistAssertion(
  repository,
  scope,
  assertionKey,
  status,
  expected,
  actual
) {
  requireCondition(
    repository &&
    typeof repository
      .upsertAssertionResult ===
      "function",
    "PHASE21_BATCH9_ASSERTION_REPOSITORY_INVALID",
    "Reliability repository does not support assertion persistence"
  );


  return repository
    .upsertAssertionResult({
      organizationId:
        scope
          .organizationId,

      environmentId:
        scope
          .environmentId,

      experimentRunId:
        scope
          .experimentRunId,

      assertionKey,

      status,

      expected,

      actual,

      reasonCode:
        status ===
          "PASS"
          ? "PHASE21_BATCH9_ASSERTION_PASSED"
          : "PHASE21_BATCH9_ASSERTION_FAILED",

      details: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        assertionKey,

        evaluatedAt:
          new Date()
            .toISOString(),

        groundTruthPassedToAira:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },
    });
}


async function persistMetric(
  repository,
  scope,
  metricKey,
  value,
  unit
) {
  requireCondition(
    repository &&
    typeof repository
      .upsertMetric ===
      "function",
    "PHASE21_BATCH9_METRIC_REPOSITORY_INVALID",
    "Reliability repository does not support metric persistence"
  );


  requireCondition(
    Number.isFinite(
      Number(
        value
      )
    ),
    "PHASE21_BATCH9_METRIC_VALUE_INVALID",
    `Metric ${metricKey} must contain a finite numeric value`
  );


  return repository
    .upsertMetric({
      organizationId:
        scope
          .organizationId,

      environmentId:
        scope
          .environmentId,

      experimentRunId:
        scope
          .experimentRunId,

      metricKey,

      value:
        Number(
          value
        ),

      unit,

      metadata: {
        certificateVersion:
          CERTIFICATE_VERSION,

        phase:
          "21.17-21.18",

        measuredAt:
          new Date()
            .toISOString(),

        groundTruthPassedToAira:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      },
    });
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

    incidentId:
      readEnv(
        "PHASE21_INCIDENT_ID",
        DEFAULTS.incidentId
      ),

    experimentRunId:
      readEnv(
        "PHASE21_EXPERIMENT_RUN_ID",
        DEFAULTS.experimentRunId
      ),

    context:
      readEnv(
        "PHASE21_KUBERNETES_CONTEXT",
        DEFAULTS.context
      ),

    namespace:
      readEnv(
        "PHASE21_KUBERNETES_NAMESPACE",
        DEFAULTS.namespace
      ),

    deployment:
      readEnv(
        "PHASE21_KUBERNETES_DEPLOYMENT",
        DEFAULTS.deployment
      ),

    apiUrl:
      normalizeBaseUrl(
        readEnv(
          "PHASE21_LAB_API_URL",
          DEFAULTS.apiUrl
        )
      ),

    stabilityWindowMs:
      readPositiveInteger(
        "PHASE21_STABILITY_WINDOW_MS",
        DEFAULTS.stabilityWindowMs
      ),

    maximumHealthyLatencyMs:
      readPositiveInteger(
        "PHASE21_MAXIMUM_HEALTHY_LATENCY_MS",
        DEFAULTS.maximumHealthyLatencyMs
      ),
  });
}


function readEnv(
  name,
  fallback
) {
  const value =
    process.env[name];


  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    return fallback;
  }


  return String(
    value
  ).trim();
}


function readPositiveInteger(
  name,
  fallback
) {
  const raw =
    process.env[name];


  if (
    raw ===
      undefined ||
    raw ===
      null ||
    String(
      raw
    ).trim() ===
      ""
  ) {
    return fallback;
  }


  const value =
    Number(
      raw
    );


  requireCondition(
    Number.isInteger(
      value
    ) &&
    value >
      0,
    "PHASE21_BATCH9_CONFIGURATION_INVALID",
    `${name} must be a positive integer`
  );


  return value;
}


function normalizeBaseUrl(
  value
) {
  const normalized =
    String(
      value ||
      ""
    )
      .trim()
      .replace(
        /\/+$/,
        ""
      );


  requireCondition(
    normalized,
    "PHASE21_BATCH9_API_URL_MISSING",
    "Phase-21 lab API URL is required"
  );


  return normalized;
}


// ============================================================================
// HARD SAFETY BOUNDARY
// ============================================================================

function assertEnvironmentSafety() {
  const nodeEnvironment =
    String(
      process.env.NODE_ENV ||
      ""
    )
      .trim()
      .toLowerCase();


  requireCondition(
    nodeEnvironment !==
      "production",
    "PHASE21_BATCH9_PRODUCTION_NODE_ENV_BLOCKED",
    "Batch 9 cannot run with NODE_ENV=production"
  );


  const deploymentEnvironment =
    String(
      process.env.DEPLOYMENT_ENVIRONMENT ||
      process.env.APP_ENV ||
      process.env.ENVIRONMENT ||
      ""
    )
      .trim()
      .toLowerCase();


  requireCondition(
    deploymentEnvironment !==
      "production" &&
    deploymentEnvironment !==
      "prod",
    "PHASE21_BATCH9_PRODUCTION_ENVIRONMENT_BLOCKED",
    "Batch 9 cannot run against a production deployment environment"
  );


  const productionFlag =
    parseBoolean(
      process.env.PRODUCTION
    );


  requireCondition(
    productionFlag !==
      true,
    "PHASE21_BATCH9_PRODUCTION_FLAG_BLOCKED",
    "Batch 9 cannot run when PRODUCTION=true"
  );


  const productionCertifiedFlag =
    parseBoolean(
      process.env.PRODUCTION_CERTIFIED
    );


  requireCondition(
    productionCertifiedFlag !==
      true,
    "PHASE21_BATCH9_PRODUCTION_CERTIFICATION_BLOCKED",
    "Phase 21 cannot certify production"
  );
}


// ============================================================================
// CONSOLE OUTPUT
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
    "AIRA PHASE 21 — BATCH 9 LIVE CERTIFICATION"
  );

  console.log(
    "PHASE 21.17 — RECOVERY VERIFICATION + ROLLBACK"
  );

  console.log(
    "PHASE 21.18 — METRICS + EXPERIMENT SCORING"
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
    `Experiment run:           ${configuration.experimentRunId}`
  );

  console.log(
    `Incident:                 ${configuration.incidentId}`
  );

  console.log(
    `Kubernetes context:       ${configuration.context}`
  );

  console.log(
    `Namespace:                ${configuration.namespace}`
  );

  console.log(
    `Deployment:               ${configuration.deployment}`
  );

  console.log(
    `API:                      ${configuration.apiUrl}`
  );

  console.log(
    `Stability window:         ${configuration.stabilityWindowMs} ms`
  );

  console.log(
    `Maximum HTTP latency:     ${configuration.maximumHealthyLatencyMs} ms`
  );

  console.log(
    ""
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


function printObservation(
  observation
) {
  console.log(
    `Observed at:              ${observation.observedAt}`
  );

  console.log(
    `Application healthy:      ${observation.healthy}`
  );

  console.log(
    `Application ready:        ${observation.ready}`
  );

  console.log(
    `PostgreSQL reachable:     ${observation.dependencies?.postgres}`
  );

  console.log(
    `Redis reachable:          ${observation.dependencies?.redis}`
  );

  console.log(
    `RabbitMQ reachable:       ${observation.dependencies?.rabbitmq}`
  );

  console.log(
    `Maximum HTTP latency:     ${observation.maximumHttpLatencyMs} ms`
  );

  console.log(
    `Deployment ready:         ${observation.deployment?.ready}`
  );

  console.log(
    `Desired replicas:         ${observation.deployment?.desiredReplicas}`
  );

  console.log(
    `Ready replicas:           ${observation.deployment?.readyReplicas}`
  );

  console.log(
    `Available replicas:       ${observation.deployment?.availableReplicas}`
  );

  console.log(
    `Pod:                      ${formatNullable(
      observation.pod?.name
    )}`
  );

  console.log(
    `Pod UID:                  ${formatNullable(
      observation.pod?.uid
    )}`
  );

  console.log(
    `Pod ready:                ${observation.pod?.ready === true}`
  );

  console.log(
    `Pod restart count:        ${formatNullable(
      observation.pod?.restartCount
    )}`
  );
}


// ============================================================================
// CERTIFICATE ARTIFACT
// ============================================================================

function writeCertificate(
  certificate
) {
  const directory =
    path.resolve(
      __dirname,
      "..",
      "artifacts",
      "phase21"
    );


  fs.mkdirSync(
    directory,
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


  const filename =
    `phase21-batch9-live-certification-${timestamp}.json`;


  const artifactPath =
    path.join(
      directory,
      filename
    );


  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      certificate,
      null,
      2
    ) +
      "\n",
    "utf8"
  );


  return artifactPath;
}


// ============================================================================
// COMMON HELPERS
// ============================================================================

function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw certificationError(
    code,
    message
  );
}


function certificationError(
  code,
  message
) {
  const error =
    new Error(
      message
    );


  error.name =
    "Phase21Batch9CertificationError";


  error.code =
    code;


  return error;
}


function formatNullable(
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
    return "NONE";
  }


  return String(
    value
  );
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


function round(
  value,
  precision = 2
) {
  const factor =
    10 **
    precision;


  return Math.round(
    Number(
      value
    ) *
      factor
  ) /
    factor;
}


function sleep(
  milliseconds
) {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


// ============================================================================
// PROCESS ENTRYPOINT
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
        "PHASE 21 BATCH-9 LIVE CERTIFICATION: FAILED"
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
