"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const crypto =
  require(
    "node:crypto"
  );


const {
  execFile,
} =
  require(
    "node:child_process"
  );


const {
  promisify,
} =
  require(
    "node:util"
  );


const execFileAsync =
  promisify(
    execFile
  );


const {
  ExperimentOrchestrator,
} =
  require(
    "../services/reliability/experimentOrchestrator"
  );


const {
  AiraCorrelationHarness,
} =
  require(
    "../services/reliability/airaCorrelationHarness"
  );


const {
  AiraDiagnosisHarness,
} =
  require(
    "../services/reliability/airaDiagnosisHarness"
  );


const {
  DetectionDiagnosisEvaluator,
} =
  require(
    "../services/reliability/detectionDiagnosisEvaluator"
  );


const {
  ReliabilityFailureInjectorAdapter,
} =
  require(
    "../services/reliability/liveExperimentWiringAdapters"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const lifecycleModule =
  require(
    "../services/reliability/labEnvironmentLifecycleService"
  );


const failureEngineModule =
  require(
    "../services/reliability/failureInjectionEngine"
  );


const kubernetesRuntimeModule =
  require(
    "../services/reliability/runtimes/kubernetesReliabilityLabRuntime"
  );


const {
  verifyPhase21LabSignalOwnership,
} =
  require(
    "../services/reliability/phase21LabServiceOwnership"
  );


const CERTIFICATION_VERSION =
  "21.13-14-live-v1";


const SAFETY_CLASS =
  "LAB_ONLY";


const DEFAULT_NAMESPACE =
  "aira-reliability-lab";


const DEFAULT_CLUSTER_NAME =
  "aira-reliability-lab";


const DEFAULT_EXPERIMENT_KEY =
  "kubernetes.pod.crash";


const DEFAULT_TARGET_APP =
  "lab-api";


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const SIGNAL_INGESTION_PATH =
  path.resolve(
    __dirname,
    "../services/signals/signalIngestionService.js"
  );


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const configuration =
    readConfiguration();


  validateSafety(
    configuration
  );


  printBanner(
    configuration
  );


  // ==========================================================================
  // 1. CANONICAL SIGNAL PATH
  // ==========================================================================

  const signalPersistence =
    inspectSignalPersistence();


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CANONICAL SIGNAL PATH PRE-FLIGHT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Signal service exists:       ${signalPersistence.exists}`
  );

  console.log(
    `Direct Mongoose import:      ${signalPersistence.hasMongooseImport}`
  );

  console.log(
    `Direct models/Signal import: ${signalPersistence.hasLegacySignalModel}`
  );

  console.log(
    `Canonical pre-flight:        ${signalPersistence.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    ""
  );


  if (
    signalPersistence.pass !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH7_SIGNAL_PATH_NOT_CANONICAL",
      "Batch-7 certification requires the canonical PostgreSQL-backed signal path"
    );
  }


  // ==========================================================================
  // 2. CLASSES
  // ==========================================================================

  const LabEnvironmentLifecycleService =
    resolveExportedClass(
      lifecycleModule,
      "LabEnvironmentLifecycleService"
    );


  const FailureInjectionEngine =
    resolveExportedClass(
      failureEngineModule,
      "FailureInjectionEngine"
    );


  const KubernetesReliabilityLabRuntime =
    resolveExportedClass(
      kubernetesRuntimeModule,
      "KubernetesReliabilityLabRuntime"
    );


  // ==========================================================================
  // 3. CANONICAL REPOSITORY + LAB
  // ==========================================================================

  const repository =
    new PostgresReliabilityLabRepository();


  const lifecycle =
    new LabEnvironmentLifecycleService({
      repository,
    });


  const scope = {
    organizationId:
      configuration.organizationId,

    environmentId:
      configuration.environmentId,

    labEnvironmentId:
      configuration.labEnvironmentId,
  };


  const environment =
    await lifecycle
      .requireEnvironment(
        scope
      );


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "LAB SAFETY"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Lab status:             ${environment.status}`
  );

  console.log(
    `Lab kind:               ${environment.kind}`
  );

  console.log(
    `Safety class:           ${environment.safetyClass}`
  );

  console.log(
    `Production:             ${environment.production}`
  );

  console.log(
    `Execution authorized:   ${environment.executionAuthorized}`
  );

  console.log(
    ""
  );


  if (
    environment.status !==
      "AVAILABLE"
  ) {
    throw certificationError(
      "PHASE21_BATCH7_LAB_NOT_AVAILABLE",
      `Lab must be AVAILABLE; received ${environment.status}`
    );
  }


  if (
    environment.production ===
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH7_PRODUCTION_TARGET_FORBIDDEN",
      "Batch-7 certification refuses production environments"
    );
  }


  if (
    environment.executionAuthorized ===
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH7_AUTHORITY_VIOLATION",
      "Reliability Lab environment unexpectedly authorizes execution"
    );
  }


  // ==========================================================================
  // 4. CANONICAL SERVICE OWNERSHIP
  // ==========================================================================

  const ownership =
    await verifyPhase21LabSignalOwnership({
      organizationId:
        configuration.organizationId,

      environmentId:
        configuration.environmentId,

      tenantId:
        configuration.tenantId,

      serviceId:
        configuration.serviceId,

      serviceName:
        configuration.targetApp,
    });


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CANONICAL SERVICE OWNERSHIP"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Resolved:               ${ownership.resolved}`
  );

  console.log(
    `Service ID:             ${ownership.serviceId}`
  );

  console.log(
    `Service name:           ${ownership.serviceName}`
  );

  console.log(
    `Service type:           ${ownership.serviceType}`
  );

  console.log(
    `Execution authorized:   ${ownership.executionAuthorized}`
  );

  console.log(
    ""
  );


  if (
    ownership.resolved !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH7_SERVICE_OWNERSHIP_REQUIRED",
      "Canonical lab-api service ownership could not be resolved"
    );
  }


  // ==========================================================================
  // 5. EXPERIMENT DEFINITION / EVALUATOR GROUND TRUTH
  // ==========================================================================

  const definition =
    await repository
      .getExperimentDefinition({
        organizationId:
          configuration.organizationId,

        environmentId:
          configuration.environmentId,

        experimentKey:
          configuration.experimentKey,

        version:
          configuration.experimentVersion,
      });


  if (
    !definition
  ) {
    throw certificationError(
      "PHASE21_BATCH7_EXPERIMENT_DEFINITION_NOT_FOUND",
      "Canonical Batch-7 experiment definition was not found"
    );
  }


  if (
    !definition.groundTruth ||
    typeof definition.groundTruth !==
      "object"
  ) {
    throw certificationError(
      "PHASE21_BATCH7_GROUND_TRUTH_REQUIRED",
      "Evaluator-owned experiment ground truth was not found"
    );
  }


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "EVALUATOR DEFINITION"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Experiment:             ${definition.experimentKey}@${definition.version}`
  );

  console.log(
    `Expected failure mode:  ${definition.groundTruth.expectedFailureModeKey}`
  );

  console.log(
    `Expected diagnosis:     ${definition.groundTruth.expectedDiagnosis}`
  );

  console.log(
    "Visibility:             EVALUATOR_ONLY"
  );

  console.log(
    "Ground truth to AIRA:   false"
  );

  console.log(
    ""
  );


  // ==========================================================================
  // 6. KNOWN HEALTHY BASELINE
  // ==========================================================================

  const baselineProvider =
    createLiveBaselineProvider({
      lifecycle,

      namespace:
        configuration.namespace,

      targetApp:
        configuration.targetApp,

      labBaseUrl:
        configuration.labBaseUrl,
    });


  const preRunBaseline =
    await baselineProvider
      .capture({
        ...scope,

        experimentRunId:
          null,
      });


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "KNOWN HEALTHY BASELINE"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Health endpoint:        ${preRunBaseline.liveGate.healthHealthy ? "PASS" : "FAIL"}`
  );

  console.log(
    `Readiness endpoint:     ${preRunBaseline.liveGate.readyHealthy ? "PASS" : "FAIL"}`
  );

  console.log(
    `lab-api ready pod:      ${preRunBaseline.liveGate.readyPodObserved ? "PASS" : "FAIL"}`
  );

  console.log(
    `Result:                 ${preRunBaseline.healthy ? "PASS" : "FAIL"}`
  );

  console.log(
    ""
  );


  // ==========================================================================
  // 7. LIVE TARGET
  // ==========================================================================

  const targetBefore =
    await discoverReadyPod({
      namespace:
        configuration.namespace,

      app:
        configuration.targetApp,
    });


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "REAL LAB TARGET"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Pod:                    ${targetBefore.name}`
  );

  console.log(
    `UID:                    ${targetBefore.uid}`
  );

  console.log(
    `Ready:                  ${targetBefore.ready}`
  );

  console.log(
    ""
  );


  // ==========================================================================
  // 8. REAL FAILURE ENGINE
  // ==========================================================================

  const runtime =
    new KubernetesReliabilityLabRuntime({
      clusterName:
        configuration.clusterName,

      namespace:
        configuration.namespace,

      safetyClass:
        SAFETY_CLASS,
    });


  const failureEngine =
    new FailureInjectionEngine({
      repository,

      runtime,

      safetyClass:
        SAFETY_CLASS,
    });


  const failureInjector =
    new ReliabilityFailureInjectorAdapter({
      invoke:
        async (
          input
        ) =>
          failureEngine.inject(
            {
              ...input,

              runtime,

              safetyClass:
                SAFETY_CLASS,

              production:
                false,

              executionAuthorized:
                false,
            },

            runtime
          ),
    });


  // ==========================================================================
  // 9. AIRA HARNESSES
  // ==========================================================================

  const correlationHarness =
    new AiraCorrelationHarness({
      repository,
    });


  const diagnosisHarness =
    new AiraDiagnosisHarness({
      repository,
    });


  const evaluator =
    new DetectionDiagnosisEvaluator({
      repository,
    });


  const orchestrator =
    new ExperimentOrchestrator({
      repository,

      lifecycle,

      baselineProvider,

      failureInjector,

      correlationHarness,
    });


  const correlationId =
    `phase21-batch7:${crypto.randomUUID()}`;


  let runResult =
    null;

  let diagnosisObservation =
    null;

  let evaluation =
    null;

  let resetResult =
    null;

  let experimentError =
    null;


  // ==========================================================================
  // 10. RUN THROUGH REAL CORRELATION
  // ==========================================================================

  try {
    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "REAL FAILURE → SIGNAL → INCIDENT"
    );

    console.log(
      "--------------------------------------------------------------"
    );


    runResult =
      await orchestrator
        .runToCorrelation({
          organizationId:
            configuration.organizationId,

          environmentId:
            configuration.environmentId,

          tenantId:
            configuration.tenantId,

          labEnvironmentId:
            configuration.labEnvironmentId,

          experimentKey:
            configuration.experimentKey,

          experimentVersion:
            configuration.experimentVersion,

          failureKey:
            configuration.experimentKey,

          correlationId,

          safetyClass:
            SAFETY_CLASS,

          production:
            false,

          executionAuthorized:
            false,

          target: {
            kind:
              "kubernetes.pod",

            resourceType:
              "kubernetes.pod",

            namespace:
              configuration.namespace,

            podName:
              targetBefore.name,

            name:
              targetBefore.name,

            uid:
              targetBefore.uid,

            app:
              configuration.targetApp,

            labels: {
              app:
                configuration.targetApp,

              "aira.reliability-lab":
                "true",

              "aira.safety-class":
                SAFETY_CLASS,
            },
          },

          injectionParameters: {
            namespace:
              configuration.namespace,

            podName:
              targetBefore.name,

            gracePeriodSeconds:
              0,
          },

          observableSignalFactory:
            async () => {
              const replacement =
                await waitForPodReplacement({
                  namespace:
                    configuration.namespace,

                  app:
                    configuration.targetApp,

                  previousUid:
                    targetBefore.uid,

                  timeoutMs:
                    configuration.replacementTimeoutMs,
                });


              return buildObservablePodCrashSignal({
                configuration,

                original:
                  targetBefore,

                replacement,

                correlationId,

                serviceId:
                  configuration.serviceId,
              });
            },

          /*
           * This is ownership context, not evaluator truth.
           */
          ingestionContext: {
            organizationId:
              configuration.organizationId,

            environmentId:
              configuration.environmentId,

            tenantId:
              configuration.tenantId,

            serviceId:
              configuration.serviceId,

            source:
              "PHASE21_RELIABILITY_LAB",

            reliabilityLab:
              true,

            executionAuthorized:
              false,
          },

          metadata: {
            certificationVersion:
              CERTIFICATION_VERSION,

            phase:
              "21.13-21.14",

            live:
              true,

            serviceId:
              configuration.serviceId,

            safetyClass:
              SAFETY_CLASS,

            evaluatorGroundTruthStoredSeparately:
              true,

            groundTruthPassedToAira:
              false,

            executionAuthorized:
              false,
          },
        });


    console.log(
      `Experiment run:         ${runResult.experimentRunId}`
    );

    console.log(
      `Run status:             ${runResult.status}`
    );

    console.log(
      `Signal ID:              ${formatNullable(runResult?.correlation?.signalId)}`
    );

    console.log(
      `Correlation group:      ${formatNullable(runResult?.correlation?.correlationGroupId)}`
    );

    console.log(
      `Incident candidate:     ${runResult?.correlation?.incidentCandidate === true}`
    );

    console.log(
      `Routed:                 ${runResult?.correlation?.routed === true}`
    );

    console.log(
      `Routing reason:         ${formatNullable(runResult?.correlation?.routingReason)}`
    );

    console.log(
      `Incident ID:            ${formatNullable(runResult?.correlation?.incidentId)}`
    );

    console.log(
      ""
    );


    // ========================================================================
    // 11. REQUIRE REAL INCIDENT FOR LIVE 21.14
    // ========================================================================

    if (
      !runResult
        ?.correlation
        ?.incidentId
    ) {
      throw certificationError(
        "PHASE21_BATCH7_INCIDENT_NOT_OBSERVED",
        [
          "AIRA detected/correlated the failure but did not expose a canonical Incident.",
          `routingReason=${runResult?.correlation?.routingReason || "NONE"}`,
          "21.14 cannot be live-certified without a real incident.",
        ].join(
          " "
        )
      );
    }


    // ========================================================================
    // 12. REAL DIAGNOSIS COORDINATOR
    // ========================================================================

    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "REAL AIRA DIAGNOSIS"
    );

    console.log(
      "--------------------------------------------------------------"
    );


    diagnosisObservation =
      await diagnosisHarness
        .observe({
          organizationId:
            configuration.organizationId,

          environmentId:
            configuration.environmentId,

          tenantId:
            configuration.tenantId,

          experimentRunId:
            runResult.experimentRunId,

          correlationId,

          incidentId:
            runResult
              .correlation
              .incidentId,

          /*
           * NO evaluator ground truth here.
           */
          diagnosisDependencies: {},
        });


    console.log(
      `Diagnosis run:          ${formatNullable(diagnosisObservation.diagnosisRunId)}`
    );

    console.log(
      `Selected failure mode:  ${formatNullable(diagnosisObservation.selectedFailureMode)}`
    );

    console.log(
      `Outcome:                ${formatNullable(diagnosisObservation.diagnosisOutcome)}`
    );

    console.log(
      `Confidence:             ${formatNullable(diagnosisObservation.diagnosisConfidence)}`
    );

    console.log(
      `Evidence completeness:  ${formatNullable(diagnosisObservation.evidenceCompleteness)}`
    );

    console.log(
      `Duration ms:            ${formatNullable(diagnosisObservation.durationMs)}`
    );

    console.log(
      `Ground truth consumed:  ${diagnosisObservation.groundTruthConsumed}`
    );

    console.log(
      ""
    );


    // ========================================================================
    // 13. EVALUATOR-ONLY COMPARISON
    // ========================================================================

    const canonicalRun =
      await repository
        .getExperimentRun({
          organizationId:
            configuration.organizationId,

          environmentId:
            configuration.environmentId,

          experimentRunId:
            runResult.experimentRunId,
        });


    evaluation =
      await evaluator
        .evaluate({
          organizationId:
            configuration.organizationId,

          environmentId:
            configuration.environmentId,

          experimentRunId:
            runResult.experimentRunId,

          groundTruth:
            definition.groundTruth,

          correlation:
            runResult.correlation,

          diagnosisObservation,

          failureInjectedAt:
            canonicalRun
              ?.failureSummary
              ?.injectedAt ||
            null,

          firstObservableAt:
            runResult
              ?.correlation
              ?.startedAt ||
            null,

          incidentCreatedAt:
            diagnosisObservation
              ?.startedAt ||
            null,
        });


    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      "21.13 + 21.14 EVALUATION"
    );

    console.log(
      "--------------------------------------------------------------"
    );

    console.log(
      `DETECTED:               ${evaluation.detection.status}`
    );

    console.log(
      `CORRELATED:             ${evaluation.correlation.status}`
    );

    console.log(
      `DIAGNOSIS_CORRECT:      ${evaluation.diagnosis.status}`
    );

    console.log(
      `Diagnosis reason:       ${evaluation.diagnosis.reasonCode}`
    );

    console.log(
      `Ground truth to AIRA:   ${evaluation.groundTruthPassedToAira}`
    );

    console.log(
      `Execution authorized:   ${evaluation.executionAuthorized}`
    );

    console.log(
      ""
    );


    if (
      evaluation.detection.status !==
        "PASS"
    ) {
      throw certificationError(
        "PHASE21_BATCH7_DETECTION_FAILED",
        `Detection correctness failed: ${evaluation.detection.reasonCode}`
      );
    }


    if (
      evaluation.correlation.status !==
        "PASS"
    ) {
      throw certificationError(
        "PHASE21_BATCH7_CORRELATION_FAILED",
        `Correlation correctness failed: ${evaluation.correlation.reasonCode}`
      );
    }


    if (
      evaluation.diagnosis.status !==
        "PASS"
    ) {
      throw certificationError(
        evaluation.diagnosis.status ===
          "INCONCLUSIVE"
          ? "PHASE21_BATCH7_DIAGNOSIS_INCONCLUSIVE"
          : "PHASE21_BATCH7_DIAGNOSIS_FAILED",

        [
          `Diagnosis correctness=${evaluation.diagnosis.status}.`,
          `Reason=${evaluation.diagnosis.reasonCode}.`,
          `Expected=${definition.groundTruth.expectedFailureModeKey || definition.groundTruth.expectedDiagnosis}.`,
          `Actual=${diagnosisObservation.selectedFailureMode || "NONE"}.`,
        ].join(
          " "
        )
      );
    }
  } catch (
    error
  ) {
    experimentError =
      error;


    console.error(
      ""
    );

    console.error(
      `Batch-7 experiment error: ${error.message}`
    );

    console.error(
      ""
    );
  } finally {
    // ========================================================================
    // 14. DETERMINISTIC RESET
    // ========================================================================

    if (
      runResult
        ?.experimentRunId
    ) {
      console.log(
        "--------------------------------------------------------------"
      );

      console.log(
        "DETERMINISTIC LAB RESET"
      );

      console.log(
        "--------------------------------------------------------------"
      );


      try {
        resetResult =
          await orchestrator
            .resetAfterPartialRun({
              organizationId:
                configuration.organizationId,

              environmentId:
                configuration.environmentId,

              labEnvironmentId:
                configuration.labEnvironmentId,

              experimentRunId:
                runResult.experimentRunId,

              baselineProvider,

              resetter:
                createKubernetesResetter({
                  namespace:
                    configuration.namespace,

                  app:
                    configuration.targetApp,

                  labBaseUrl:
                    configuration.labBaseUrl,

                  timeoutMs:
                    configuration.resetTimeoutMs,
                }),
            });


        console.log(
          `Reset succeeded:         ${resetResult.resetSucceeded}`
        );

        console.log(
          `Baseline restored:       ${resetResult.baselineRestored}`
        );

        console.log(
          ""
        );
      } catch (
        resetError
      ) {
        if (
          !experimentError
        ) {
          experimentError =
            resetError;
        }


        console.error(
          `RESET FAILED: ${resetError.message}`
        );

        console.error(
          ""
        );
      }
    }
  }


  // ==========================================================================
  // 15. FINAL LAB STATE
  // ==========================================================================

  const finalEnvironment =
    await lifecycle
      .requireEnvironment(
        scope
      );


  if (
    finalEnvironment.status !==
      "AVAILABLE"
  ) {
    throw certificationError(
      "PHASE21_BATCH7_FINAL_LAB_NOT_AVAILABLE",
      `Final lab status must be AVAILABLE; received ${finalEnvironment.status}`
    );
  }


  if (
    experimentError
  ) {
    throw experimentError;
  }


  if (
    !resetResult ||
    resetResult.resetSucceeded !==
      true ||
    resetResult.baselineRestored !==
      true
  ) {
    throw certificationError(
      "PHASE21_BATCH7_RESET_REQUIRED",
      "Batch-7 cannot pass without deterministic successful reset"
    );
  }


  // ==========================================================================
  // 16. ARTIFACT
  // ==========================================================================

  const artifact = {
    certificate:
      CERTIFICATION_VERSION,

    generatedAt:
      new Date()
        .toISOString(),

    organizationId:
      configuration.organizationId,

    environmentId:
      configuration.environmentId,

    tenantId:
      configuration.tenantId,

    labEnvironmentId:
      configuration.labEnvironmentId,

    serviceId:
      configuration.serviceId,

    experimentKey:
      configuration.experimentKey,

    experimentVersion:
      configuration.experimentVersion,

    experimentRunId:
      runResult.experimentRunId,

    signalId:
      runResult
        ?.correlation
        ?.signalId ||
      null,

    correlationGroupId:
      runResult
        ?.correlation
        ?.correlationGroupId ||
      null,

    incidentId:
      runResult
        ?.correlation
        ?.incidentId ||
      null,

    diagnosisRunId:
      diagnosisObservation
        ?.diagnosisRunId ||
      null,

    selectedFailureMode:
      diagnosisObservation
        ?.selectedFailureMode ||
      null,

    expectedFailureMode:
      definition
        .groundTruth
        .expectedFailureModeKey ||
      null,

    expectedDiagnosis:
      definition
        .groundTruth
        .expectedDiagnosis ||
      null,

    assertions: {
      detected:
        evaluation
          .detection
          .status,

      correlated:
        evaluation
          .correlation
          .status,

      diagnosisCorrect:
        evaluation
          .diagnosis
          .status,
    },

    metrics:
      evaluation.metrics,

    groundTruth: {
      availableToEvaluator:
        true,

      passedToAira:
        false,

      consumedByDiagnosisHarness:
        diagnosisObservation
          .groundTruthConsumed,
    },

    reset: {
      succeeded:
        true,

      baselineRestored:
        true,
    },

    finalLabStatus:
      finalEnvironment.status,

    safetyClass:
      SAFETY_CLASS,

    productionCertified:
      false,

    executionAuthorized:
      false,

    frozen:
      true,
  };


  const artifactPath =
    writeArtifact(
      artifact
    );


  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.13 + 21.14 LIVE RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate:              ${CERTIFICATION_VERSION}`
  );

  console.log(
    `Experiment run:           ${runResult.experimentRunId}`
  );

  console.log(
    `Signal ID:                ${runResult.correlation.signalId}`
  );

  console.log(
    `Incident ID:              ${runResult.correlation.incidentId}`
  );

  console.log(
    `Selected failure mode:    ${diagnosisObservation.selectedFailureMode}`
  );

  console.log(
    `DETECTED:                 ${evaluation.detection.status}`
  );

  console.log(
    `CORRELATED:               ${evaluation.correlation.status}`
  );

  console.log(
    `DIAGNOSIS_CORRECT:        ${evaluation.diagnosis.status}`
  );

  console.log(
    "Ground truth leaked:      false"
  );

  console.log(
    "Reset:                    PASS"
  );

  console.log(
    `Final lab status:         ${finalEnvironment.status}`
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    "Frozen:                   true"
  );

  console.log(
    `Artifact:                 ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 7 STATUS: LIVE CERTIFIED / PASS / FROZEN"
  );

  console.log(
    ""
  );

  console.log(
    "NEXT: PHASE 21.15 + 21.16"
  );

  console.log(
    "Recovery Selection Correctness + Execution/Safety Correctness"
  );
}


// ============================================================================
// CONFIGURATION
// ============================================================================

function readConfiguration() {
  const organizationId =
    process.env
      .PHASE21_ORGANIZATION_ID ||
    "aira-dev-org";


  const environmentId =
    process.env
      .PHASE21_ENVIRONMENT_ID ||
    "env_aira_development";


  return {
    organizationId,

    environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      organizationId,

    labEnvironmentId:
      requireEnvironment(
        "PHASE21_LAB_ENVIRONMENT_ID"
      ),

    serviceId:
      requireEnvironment(
        "PHASE21_BATCH7_SERVICE_ID"
      ),

    namespace:
      process.env
        .PHASE21_KUBERNETES_NAMESPACE ||
      DEFAULT_NAMESPACE,

    clusterName:
      process.env
        .PHASE21_KIND_CLUSTER ||
      DEFAULT_CLUSTER_NAME,

    targetApp:
      process.env
        .PHASE21_BATCH7_TARGET_APP ||
      DEFAULT_TARGET_APP,

    experimentKey:
      process.env
        .PHASE21_BATCH7_EXPERIMENT_KEY ||
      DEFAULT_EXPERIMENT_KEY,

    experimentVersion:
      positiveInteger(
        process.env
          .PHASE21_BATCH7_EXPERIMENT_VERSION,
        1
      ),

    labBaseUrl:
      process.env
        .PHASE21_LAB_API_URL ||
      "http://127.0.0.1:18080",

    replacementTimeoutMs:
      positiveInteger(
        process.env
          .PHASE21_BATCH7_REPLACEMENT_TIMEOUT_MS,
        60000
      ),

    resetTimeoutMs:
      positiveInteger(
        process.env
          .PHASE21_BATCH7_RESET_TIMEOUT_MS,
        120000
      ),
  };
}


function validateSafety(
  configuration
) {
  if (
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() !==
      "true"
  ) {
    throw certificationError(
      "PHASE21_RELIABILITY_LAB_FLAG_REQUIRED",
      "AIRA_RELIABILITY_LAB=true is required"
    );
  }


  if (
    String(
      process.env
        .NODE_ENV ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "production"
  ) {
    throw certificationError(
      "PHASE21_PRODUCTION_RUNTIME_FORBIDDEN",
      "Batch-7 certification cannot run with NODE_ENV=production"
    );
  }


  if (
    !configuration.serviceId
  ) {
    throw certificationError(
      "PHASE21_BATCH7_SERVICE_ID_REQUIRED",
      "PHASE21_BATCH7_SERVICE_ID is required"
    );
  }
}


// ============================================================================
// LIVE BASELINE
// ============================================================================

function createLiveBaselineProvider({
  lifecycle,

  namespace,

  targetApp,

  labBaseUrl,
}) {
  return {
    async capture(
      input
    ) {
      const environment =
        await lifecycle
          .requireEnvironment({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            labEnvironmentId:
              input.labEnvironmentId,
          });


      const storedBaseline =
        firstObject(
          environment.baselineSnapshot,

          environment.baseline,

          environment.knownGoodBaseline,

          environment.currentBaseline,

          environment
            ?.metadata
            ?.baseline
        );


      if (
        !storedBaseline
      ) {
        throw certificationError(
          "PHASE21_BATCH7_CANONICAL_BASELINE_REQUIRED",
          "Canonical Reliability Lab baseline is required"
        );
      }


      if (
        storedBaseline.healthy ===
          false
      ) {
        throw certificationError(
          "PHASE21_BATCH7_STORED_BASELINE_UNHEALTHY",
          "Stored Reliability Lab baseline is unhealthy"
        );
      }


      const liveGate =
        await captureLiveHealth({
          namespace,

          targetApp,

          labBaseUrl,
        });


      if (
        liveGate.healthHealthy !==
          true ||
        liveGate.readyHealthy !==
          true ||
        liveGate.readyPodObserved !==
          true
      ) {
        throw certificationError(
          "PHASE21_BATCH7_LIVE_BASELINE_UNHEALTHY",
          "Live lab health/readiness does not match the known-good baseline"
        );
      }


      return {
        ...deepClone(
          storedBaseline
        ),

        healthy:
          true,

        liveGate,

        baselineSource:
          "CANONICAL_STORED_BASELINE_PLUS_LIVE_HEALTH_GATE",

        safetyClass:
          SAFETY_CLASS,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    },
  };
}


async function captureLiveHealth({
  namespace,

  targetApp,

  labBaseUrl,
}) {
  const health =
    await httpProbe(
      `${labBaseUrl}/health`
    );


  const ready =
    await httpProbe(
      `${labBaseUrl}/ready`
    );


  const pod =
    await discoverReadyPod({
      namespace,

      app:
        targetApp,
    });


  return {
    capturedAt:
      new Date()
        .toISOString(),

    healthStatus:
      health.status,

    healthHealthy:
      health.ok,

    readyStatus:
      ready.status,

    readyHealthy:
      ready.ok,

    pod:
      pod.name,

    podUid:
      pod.uid,

    podPhase:
      pod.phase,

    readyPodObserved:
      pod.phase ===
        "Running" &&
      pod.ready ===
        true,

    executionAuthorized:
      false,
  };
}


// ============================================================================
// KUBERNETES OBSERVATION
// ============================================================================

async function discoverReadyPod({
  namespace,

  app,
}) {
  const result =
    await kubectlJson([
      "get",
      "pods",

      "-n",
      namespace,

      "-l",
      `app=${app}`,

      "-o",
      "json",
    ]);


  const pods =
    (
      result.items ||
      []
    )
      .map(
        normalizePod
      );


  const ready =
    pods.find(
      (
        pod
      ) =>
        pod.phase ===
          "Running" &&
        pod.ready ===
          true
    );


  if (
    !ready
  ) {
    throw certificationError(
      "PHASE21_BATCH7_READY_POD_NOT_FOUND",
      `No Running/Ready pod found for app=${app}`
    );
  }


  return ready;
}


async function waitForPodReplacement({
  namespace,

  app,

  previousUid,

  timeoutMs,
}) {
  const startedAt =
    Date.now();


  while (
    Date.now() -
      startedAt <
    timeoutMs
  ) {
    try {
      const current =
        await discoverReadyPod({
          namespace,

          app,
        });


      if (
        current.uid !==
          previousUid
      ) {
        return {
          ...current,

          replacementObservedAt:
            new Date()
              .toISOString(),

          previousUid,

          executionAuthorized:
            false,
        };
      }
    } catch {
      // Temporary absence is expected while Kubernetes replaces the pod.
    }


    await sleep(
      1000
    );
  }


  throw certificationError(
    "PHASE21_BATCH7_POD_REPLACEMENT_TIMEOUT",
    `Replacement pod was not observed within ${timeoutMs}ms`
  );
}


function normalizePod(
  pod
) {
  const readyCondition =
    (
      pod
        ?.status
        ?.conditions ||
      []
    )
      .find(
        (
          condition
        ) =>
          condition.type ===
          "Ready"
      );


  return {
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

    namespace:
      pod
        ?.metadata
        ?.namespace ||
      null,

    phase:
      pod
        ?.status
        ?.phase ||
      null,

    ready:
      readyCondition
        ?.status ===
      "True",

    restartCount:
      (
        pod
          ?.status
          ?.containerStatuses ||
        []
      )
        .reduce(
          (
            sum,
            container
          ) =>
            sum +
            Number(
              container.restartCount ||
              0
            ),

          0
        ),
  };
}


// ============================================================================
// OBSERVABLE SIGNAL
// ============================================================================

function buildObservablePodCrashSignal({
  configuration,

  original,

  replacement,

  correlationId,

  serviceId,
}) {
  const observedAt =
    replacement
      .replacementObservedAt ||
    new Date()
      .toISOString();


  return {
    provider:
      "kubernetes",

    source:
      "kubernetes",

    signalType:
      "kubernetes.pod.replacement",

    eventType:
      "kubernetes.pod.replacement",

    severity:
      "critical",

    status:
      "firing",

    title:
      "Reliability Lab pod replacement observed",

    message:
      `Pod ${original.name} disappeared and replacement ${replacement.name} became Ready`,

    observedAt,

    sourceEventId:
      `phase21-batch7:${original.uid}:${replacement.uid}`,

    correlationId,

    /*
     * Canonical ownership.
     *
     * This is NOT experiment ground truth.
     */
    serviceId,

    resource: {
      type:
        "kubernetes.pod",

      resourceType:
        "kubernetes.pod",

      serviceName:
        configuration.targetApp,

      namespace:
        configuration.namespace,

      name:
        original.name,

      uid:
        original.uid,
    },

   attributes: {
  reliabilityLab: {
    phase:
      "21.13-21.14",

    safetyClass:
      SAFETY_CLASS,

    serviceId,

    /*
     * Never expose experiment/failure identity to AIRA.
     *
     * The evaluator owns scenario ground truth.
     */
    groundTruthIncluded:
      false,
  },

      kubernetes: {
        namespace:
          configuration.namespace,

        originalPod:
          original.name,

        originalUid:
          original.uid,

        replacementPod:
          replacement.name,

        replacementUid:
          replacement.uid,

        replacementReady:
          replacement.ready,
      },
    },

    rawPayload: {
      original: {
        pod:
          original.name,

        uid:
          original.uid,
      },

      replacement: {
        pod:
          replacement.name,

        uid:
          replacement.uid,

        ready:
          replacement.ready,
      },
    },

    metadata: {
      correlationId,

      phase:
        "21.13-21.14",

      safetyClass:
        SAFETY_CLASS,

      serviceOwnershipIncluded:
        true,

      groundTruthIncluded:
        false,

      executionAuthorized:
        false,
    },

    executionAuthorized:
      false,
  };
}


// ============================================================================
// RESET
// ============================================================================

function createKubernetesResetter({
  namespace,

  app,

  labBaseUrl,

  timeoutMs,
}) {
  return {
    async reset() {
      await kubectl(
        [
          "rollout",
          "status",
          `deployment/${app}`,

          "-n",
          namespace,

          `--timeout=${Math.ceil(
            timeoutMs /
            1000
          )}s`,
        ],

        timeoutMs +
          10000
      );


      const liveHealth =
        await captureLiveHealth({
          namespace,

          targetApp:
            app,

          labBaseUrl,
        });


      if (
        liveHealth.healthHealthy !==
          true ||
        liveHealth.readyHealthy !==
          true ||
        liveHealth.readyPodObserved !==
          true
      ) {
        throw certificationError(
          "PHASE21_BATCH7_RESET_HEALTH_FAILED",
          "Lab did not return to healthy/ready state"
        );
      }


      return {
        resetSucceeded:
          true,

        baselineRestored:
          true,

        mechanism:
          "KUBERNETES_DECLARATIVE_SELF_HEALING_WAIT",

        airaRecoveryExecuted:
          false,

        liveHealth,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    },
  };
}


// ============================================================================
// HTTP / KUBECTL
// ============================================================================

async function httpProbe(
  url
) {
  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),

      5000
    );


  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
        }
      );


    return {
      ok:
        response.ok,

      status:
        response.status,
    };
  } catch (
    error
  ) {
    return {
      ok:
        false,

      status:
        null,

      error:
        String(
          error.message ||
          error
        ),
    };
  } finally {
    clearTimeout(
      timer
    );
  }
}


async function kubectlJson(
  args
) {
  const {
    stdout,
  } =
    await kubectl(
      args,
      30000
    );


  return JSON.parse(
    stdout
  );
}


async function kubectl(
  args,
  timeout =
    120000
) {
  return execFileAsync(
    "kubectl",
    args,
    {
      windowsHide:
        true,

      timeout,

      maxBuffer:
        5 *
        1024 *
        1024,
    }
  );
}


// ============================================================================
// SIGNAL PRE-FLIGHT
// ============================================================================

function inspectSignalPersistence() {
  if (
    !fs.existsSync(
      SIGNAL_INGESTION_PATH
    )
  ) {
    return {
      exists:
        false,

      hasMongooseImport:
        false,

      hasLegacySignalModel:
        false,

      pass:
        false,
    };
  }


  const source =
    fs.readFileSync(
      SIGNAL_INGESTION_PATH,
      "utf8"
    );


  const hasMongooseImport =
    /require\s*\(\s*["']mongoose["']\s*\)/i
      .test(
        source
      );


  const hasLegacySignalModel =
    /require\s*\(\s*["'][^"']*models[\\/]+Signal["']\s*\)/i
      .test(
        source
      );


  return {
    exists:
      true,

    hasMongooseImport,

    hasLegacySignalModel,

    pass:
      !hasMongooseImport &&
      !hasLegacySignalModel,
  };
}


// ============================================================================
// ARTIFACT
// ============================================================================

function writeArtifact(
  artifact
) {
  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const artifactPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `phase21-batch7-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      artifact,
      null,
      2
    ),
    "utf8"
  );


  return artifactPath;
}


// ============================================================================
// HELPERS
// ============================================================================

function resolveExportedClass(
  moduleValue,
  name
) {
  if (
    typeof moduleValue ===
      "function"
  ) {
    return moduleValue;
  }


  if (
    typeof moduleValue
      ?.[name] ===
      "function"
  ) {
    return moduleValue[name];
  }


  throw certificationError(
    "PHASE21_BATCH7_CLASS_NOT_FOUND",
    `${name} could not be resolved`
  );
}


function requireEnvironment(
  name
) {
  const value =
    process.env[name];


  if (
    !value ||
    !String(
      value
    )
      .trim()
  ) {
    throw certificationError(
      "PHASE21_BATCH7_ENV_REQUIRED",
      `${name} is required`
    );
  }


  return String(
    value
  )
    .trim();
}


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  ) &&
  parsed >
    0
    ? parsed
    : fallback;
}


function firstObject(
  ...values
) {
  return values.find(
    (
      value
    ) =>
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      )
  ) ||
  null;
}


function deepClone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function formatNullable(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return "NOT_OBSERVED";
  }


  return String(
    value
  );
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
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
      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


function printBanner(
  configuration
) {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.13 + 21.14 BATCH-7 LIVE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Detection evaluator:      real"
  );

  console.log(
    "Diagnosis coordinator:    canonical"
  );

  console.log(
    "Failure injection:        Phase 21.9"
  );

  console.log(
    "Infrastructure:           Kubernetes / kind"
  );

  console.log(
    "Service ownership:        canonical PostgreSQL"
  );

  console.log(
    "Ground truth to AIRA:     forbidden"
  );

  console.log(
    "Ground truth evaluator:   enabled"
  );

  console.log(
    "Safety class:             LAB_ONLY"
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
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
    `Service ID:               ${configuration.serviceId}`
  );

  console.log(
    `Scenario:                 ${configuration.experimentKey}`
  );

  console.log(
    ""
  );
}


// ============================================================================
// ENTRY
// ============================================================================

if (
  require.main ===
  module
) {
  main()
    .catch(
      (
        error
      ) => {
        console.error(
          ""
        );

        console.error(
          "=============================================================="
        );

        console.error(
          "PHASE 21.13 + 21.14 LIVE RESULT: FAIL"
        );

        console.error(
          "=============================================================="
        );

        console.error(
          `Code: ${error.code || "UNKNOWN"}`
        );

        console.error(
          error.message
        );

        console.error(
          ""
        );

        console.error(
          "Production certified: false"
        );

        console.error(
          "Execution authorized: false"
        );


        process.exitCode =
          1;
      }
    );
}


module.exports = {
  CERTIFICATION_VERSION,

  buildObservablePodCrashSignal,

  main,
};